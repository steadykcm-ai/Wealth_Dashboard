import {
  clearCachedNhPlugToken,
  readCachedNhPlugToken,
  saveCachedNhPlugToken,
} from "@/lib/nhplug-token-cache";
import type {
  NhPlugAccountPreview,
  NhPlugBalanceSummary,
  NhPlugHoldingPreview,
  NhPlugPreviewResponse,
} from "@/lib/nhplug-types";

const BASE_URL = "https://api.nhplug.com:8443";
const TOKEN_BUFFER_MS = 5 * 60 * 1000;
const MAX_PAGES = 20;

let memoryToken: string | null = null;
let memoryTokenExpiresAtMs = 0;
let tokenRequest: Promise<TokenResult> | null = null;

interface TokenResult {
  accessToken: string;
  expiresAtMs: number;
  source: NhPlugPreviewResponse["tokenSource"];
}

interface NhPlugResponse {
  Output_0?: unknown;
  Output_1?: unknown;
  rsp_cd?: unknown;
  rsp_msg?: unknown;
  message?: unknown;
}

interface NhPlugPage {
  body: NhPlugResponse;
  cts: string | null;
  ctsFlag: string | null;
}

interface NhPlugAccountRow {
  acct_no?: unknown;
  acct_type?: unknown;
}

interface BalancePages {
  summary: Record<string, unknown> | null;
  holdings: Record<string, unknown>[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const row = asRecord(item);
      return row ? [row] : [];
    })
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(asString(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function responseMessage(body: NhPlugResponse): string {
  const message = asRecord(body.message);
  return asString(body.rsp_msg)
    || asString(message?.usr_msg)
    || asString(message?.dvlp_msg);
}

function hasFailureMessage(body: NhPlugResponse): boolean {
  const message = responseMessage(body);
  return Boolean(message) && /(실패|오류|유효하지|확인해주세요|초과|제한)/.test(message);
}

export function maskNhPlugAccountNumber(accountNumber: string): string {
  const compact = accountNumber.replaceAll(/\s|-/g, "");
  const suffix = compact.slice(-4);
  return suffix ? `NH ···· ${suffix}` : "NH 계좌";
}

function getCredentials(): { appKey: string; appSecret: string } {
  const appKey = process.env.NHPLUG_APP_KEY;
  const appSecret = process.env.NHPLUG_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("NHPLUG_APP_KEY와 NHPLUG_APP_SECRET을 설정해야 합니다.");
  }
  return { appKey, appSecret };
}

async function issueToken(): Promise<TokenResult> {
  const { appKey, appSecret } = getCredentials();
  const response = await fetch(`${BASE_URL}/oauth2/token`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      appkey: appKey,
      appsecretkey: appSecret,
      grant_type: "client_credentials",
      scope: "oob",
    }),
  });
  const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Namuh PLUG 접근 토큰 발급 실패: HTTP ${response.status}`);
  }

  const expiresInSeconds = Math.max(asNumber(body.expires_in), 10 * 60);
  const expiresAtMs = Date.now() + expiresInSeconds * 1000 - TOKEN_BUFFER_MS;
  await saveCachedNhPlugToken(body.access_token, expiresAtMs);
  memoryToken = body.access_token;
  memoryTokenExpiresAtMs = expiresAtMs;
  return { accessToken: body.access_token, expiresAtMs, source: "issued" };
}

async function getToken(forceIssue = false): Promise<TokenResult> {
  const now = Date.now();
  if (!forceIssue && memoryToken && memoryTokenExpiresAtMs > now) {
    return { accessToken: memoryToken, expiresAtMs: memoryTokenExpiresAtMs, source: "memory" };
  }
  if (!forceIssue) {
    const cached = await readCachedNhPlugToken(now);
    if (cached) {
      memoryToken = cached.accessToken;
      memoryTokenExpiresAtMs = cached.expiresAtMs;
      return { ...cached, source: "database" };
    }
  }
  if (!tokenRequest) {
    tokenRequest = issueToken().finally(() => {
      tokenRequest = null;
    });
  }
  return tokenRequest;
}

async function requestPage(
  path: string,
  input: Record<string, string>,
  token: TokenResult,
  cts?: string,
  ctsFlag?: string,
  allowTokenRefresh = true
): Promise<{ page: NhPlugPage; token: TokenResult }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
  };
  if (cts) headers.cts = cts;
  if (ctsFlag) headers.cts_flag = ctsFlag;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({ Input_0: input }),
  });

  if (response.status === 401 && allowTokenRefresh) {
    memoryToken = null;
    memoryTokenExpiresAtMs = 0;
    await clearCachedNhPlugToken();
    const refreshed = await getToken(true);
    return requestPage(path, input, refreshed, cts, ctsFlag, false);
  }

  const body = await response.json() as NhPlugResponse;
  if (!response.ok || hasFailureMessage(body)) {
    throw new Error(`${responseMessage(body) || "Namuh PLUG 요청에 실패했습니다."} (HTTP ${response.status})`);
  }

  return {
    page: {
      body,
      cts: response.headers.get("cts"),
      ctsFlag: response.headers.get("cts_flag"),
    },
    token,
  };
}

async function fetchBalancePages(
  path: string,
  input: Record<string, string>,
  initialToken: TokenResult
): Promise<{ balance: BalancePages; token: TokenResult }> {
  let token = initialToken;
  let cts: string | undefined;
  let ctsFlag: string | undefined;
  let previousCts: string | undefined;
  let summary: Record<string, unknown> | null = null;
  const holdings: Record<string, unknown>[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const result = await requestPage(path, input, token, cts, ctsFlag);
    token = result.token;
    summary = asRecord(result.page.body.Output_0) ?? summary;
    holdings.push(...asRows(result.page.body.Output_1));

    const nextCts = result.page.cts ?? "";
    const nextFlag = result.page.ctsFlag ?? "";
    if (!nextCts || nextFlag === "N" || nextCts === previousCts) break;
    previousCts = nextCts;
    cts = nextCts;
    ctsFlag = nextFlag || "Y";
  }

  return { balance: { summary, holdings }, token };
}

export function parseDomesticBalance(balance: BalancePages): {
  summary: NhPlugBalanceSummary;
  holdings: NhPlugHoldingPreview[];
} {
  const source = balance.summary ?? {};
  return {
    summary: {
      cash: asNumber(source.dca),
      investedAmount: asNumber(source.tot_byn_amt),
      currentValue: asNumber(source.tot_eal_amt),
      totalAsset: asNumber(source.tot_aet_amt),
      profitLoss: asNumber(source.tot_eal_pls),
    },
    holdings: balance.holdings.map((row) => ({
      code: asString(row.iem_cd),
      name: asString(row.iem_nm) || asString(row.iem_cd),
      quantity: asNumber(row.itg_bnc_qty),
      averagePrice: asNumber(row.phs_pr),
      currentPrice: asNumber(row.now_pr),
      investedAmount: asNumber(row.byn_amt),
      currentValue: asNumber(row.eal_amt),
      profitLoss: asNumber(row.eal_pls_amt),
      currency: "KRW",
      market: "domestic",
    })),
  };
}

export function parseUsBalance(balance: BalancePages): {
  summary: NhPlugBalanceSummary;
  holdings: NhPlugHoldingPreview[];
} {
  const source = balance.summary ?? {};
  return {
    summary: {
      cash: asNumber(source.krw_dca),
      investedAmount: asNumber(source.abk_amt),
      currentValue: asNumber(source.eal_amt_sum),
      totalAsset: asNumber(source.tot_aet_amt),
      profitLoss: asNumber(source.eal_pls_sum_amt),
    },
    holdings: balance.holdings.map((row) => ({
      code: asString(row.iem_cd),
      name: asString(row.iem_nm) || asString(row.oss_iem_eng_nm) || asString(row.iem_cd),
      quantity: asNumber(row.cns_bse_bnc_qty),
      averagePrice: asNumber(row.krw_avg_phs_pr) || asNumber(row.phs_uit_pr),
      currentPrice: asNumber(row.end_pr),
      investedAmount: asNumber(row.krw_abk_amt1),
      currentValue: asNumber(row.krw_eal_amt),
      profitLoss: asNumber(row.krw_eal_pls_amt),
      currency: asString(row.cur_cd) || "USD",
      market: "us",
    })),
  };
}

function waitForRateLimit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 260));
}

function redactAccountNumber(message: string, accountNumber: string): string {
  return message.replaceAll(accountNumber, "마스킹된 계좌");
}

async function fetchAccountPreview(
  accountNumber: string,
  accountType: "01" | "02",
  initialToken: TokenResult
): Promise<{ account: NhPlugAccountPreview; token: TokenResult }> {
  let token = initialToken;
  let domestic: NhPlugAccountPreview["domestic"] = null;
  let us: NhPlugAccountPreview["us"] = null;
  const holdings: NhPlugHoldingPreview[] = [];
  const errors: string[] = [];

  try {
    const result = await fetchBalancePages("/krstock/inquiry/v1/balance", {
      act_no: accountNumber,
      bnc_bse_cd: "5",
      ltg_aot_dit_cd: "9",
      aet_bse: "2",
      qut_dit_cd: "UNT",
      aly_qut_cd: "1",
    }, token);
    token = result.token;
    const parsed = parseDomesticBalance(result.balance);
    domestic = parsed.summary;
    holdings.push(...parsed.holdings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "조회 실패";
    errors.push(`국내주식: ${redactAccountNumber(message, accountNumber)}`);
  }

  await waitForRateLimit();
  try {
    const result = await fetchBalancePages("/gbstock/inquiry/v1/balance", {
      act_no: accountNumber,
      qut_iqr_dit_cd: "9",
      fc_sec_trd_nat_cd: "200",
      cur_cd: "USD",
      xns_dit_cd: "1",
    }, token);
    token = result.token;
    const parsed = parseUsBalance(result.balance);
    us = parsed.summary;
    holdings.push(...parsed.holdings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "조회 실패";
    errors.push(`미국주식: ${redactAccountNumber(message, accountNumber)}`);
  }

  return {
    account: {
      accountId: maskNhPlugAccountNumber(accountNumber),
      accountType,
      domestic,
      us,
      holdings,
      errors,
    },
    token,
  };
}

export async function fetchNhPlugPreview(): Promise<NhPlugPreviewResponse> {
  let token = await getToken();
  const accountResult = await requestPage("/n2/acctinfo", {}, token);
  token = accountResult.token;
  const accountRows = asRows(accountResult.page.body.Output_0) as NhPlugAccountRow[];
  const liveAccounts = accountRows.reduce<Array<{
    accountNumber: string;
    accountType: "01" | "02";
  }>>((result, row) => {
    const accountNumber = asString(row.acct_no);
    const accountType = asString(row.acct_type);
    if (accountNumber && (accountType === "01" || accountType === "02")) {
      result.push({ accountNumber, accountType });
    }
    return result;
  }, []);
  if (liveAccounts.length === 0) {
    throw new Error("Namuh PLUG에서 조회 가능한 운영 계좌를 찾지 못했습니다.");
  }

  const accounts: NhPlugAccountPreview[] = [];
  for (const row of liveAccounts) {
    await waitForRateLimit();
    const result = await fetchAccountPreview(row.accountNumber, row.accountType, token);
    token = result.token;
    accounts.push(result.account);
  }

  return {
    provider: "NH투자증권 Namuh PLUG",
    readOnly: true,
    updatedAt: new Date().toISOString(),
    tokenSource: token.source,
    tokenExpiresAt: new Date(token.expiresAtMs).toISOString(),
    accounts,
    totals: {
      accounts: accounts.length,
      holdings: accounts.reduce((sum, account) => sum + account.holdings.length, 0),
      currentValue: accounts.reduce((sum, account) => (
        sum + (account.domestic?.currentValue ?? 0) + (account.us?.currentValue ?? 0)
      ), 0),
      cash: accounts.reduce((sum, account) => (
        sum + (account.domestic?.cash ?? 0) + (account.us?.cash ?? 0)
      ), 0),
    },
  };
}
