import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseBrowserClient() {
  if (!url || !anonKey) {
    throw new Error("Supabase 환경변수 미설정 (.env.local 확인)");
  }
  return createClient(url, anonKey);
}

export function getSupabaseServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service role 환경변수 미설정");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
