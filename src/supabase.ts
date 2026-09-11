import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://izhbdcpohffgdhorgqti.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_q4PdhJ0_dhZ41vxM94TvvQ_iHg7rQKt";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
