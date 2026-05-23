import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "환경변수 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY가 설정되지 않았습니다."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
