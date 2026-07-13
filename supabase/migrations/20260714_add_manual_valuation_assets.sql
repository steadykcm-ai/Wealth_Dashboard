ALTER TABLE assets
  ALTER COLUMN quantity TYPE NUMERIC(18,4),
  ALTER COLUMN avg_price TYPE NUMERIC(18,4);

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS valuation_mode TEXT NOT NULL DEFAULT 'market',
  ADD COLUMN IF NOT EXISTS manual_invest_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS manual_value NUMERIC,
  ADD COLUMN IF NOT EXISTS valuation_updated_at TIMESTAMPTZ;

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_valuation_mode_check;

ALTER TABLE assets
  ADD CONSTRAINT assets_valuation_mode_check
  CHECK (valuation_mode IN ('market', 'manual'));

INSERT INTO assets (
  user_id,
  asset_type,
  account_name,
  name,
  code,
  quantity,
  avg_price,
  is_cash,
  valuation_mode,
  manual_invest_amount,
  manual_value,
  valuation_updated_at
)
SELECT
  '56701cc8-3dff-405d-a2b7-1ff4301e92cc',
  '개인연금',
  'KB_IRP',
  item.name,
  NULL,
  item.quantity,
  item.invest_amount / item.quantity,
  FALSE,
  'manual',
  item.invest_amount,
  item.current_value,
  '2026-07-14 12:02:00+09'::timestamptz
FROM (
  VALUES
    ('KB온국민적격TDF2030증권자투자신탁(주식혼합-재간접형)(H)C', 1355.784::numeric, 1946526::numeric, 2185277::numeric),
    ('한화LIFEPLUS적격TDF2050증권자투자신탁(주식혼합-재간접형)', 1396.034::numeric, 2398255::numeric, 2744490::numeric),
    ('삼성글로벌반도체증권자투자신탁H[주식]_Cpe(퇴직)', 1152.197::numeric, 2227307::numeric, 4193239::numeric),
    ('고려저축은행 퇴직연금정기예금 1년-IRP', 3000000::numeric, 3000000::numeric, 3081795::numeric),
    ('KB증권 디폴트옵션 적극투자형 포트폴리오 2호', 875.226::numeric, 1307944::numeric, 1515211::numeric)
) AS item(name, quantity, invest_amount, current_value)
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc'
)
AND NOT EXISTS (
  SELECT 1
  FROM assets existing
  WHERE existing.user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc'
    AND existing.account_name = 'KB_IRP'
    AND existing.name = item.name
);

UPDATE cash
SET amount = 0
WHERE user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc'
  AND account_name LIKE 'KB_IRP%';
