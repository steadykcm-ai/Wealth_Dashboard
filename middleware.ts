import { type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getSetCookie().map((setCookieHeader) => {
            const [name, ...rest] = setCookieHeader.split("=");
            const value = rest.join("=").split(";")[0];
            return { name, value };
          });
        },
        setAll() {},
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 로그인 페이지는 항상 접근 가능
  if (requestUrl.pathname === "/login") {
    return;
  }

  // Cron, 정적 리소스는 미들웨어 제외
  if (
    requestUrl.pathname.startsWith("/api/cron") ||
    requestUrl.pathname.startsWith("/_next") ||
    requestUrl.pathname.startsWith("/favicon")
  ) {
    return;
  }

  // 세션 없으면 로그인 페이지로 리다이렉트
  if (!session) {
    return new Response(null, {
      status: 307,
      headers: {
        location: `/login?next=${encodeURIComponent(requestUrl.pathname)}`,
      },
    });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
