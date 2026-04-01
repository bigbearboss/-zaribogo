import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// DB/Auth용: legacy anon 우선
const supabaseLegacyAnonKey = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY;
const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 1) 일반 DB/Auth 클라이언트
// - legacy JWT anon key 우선
const supabaseDbKey = supabaseLegacyAnonKey || supabaseBrowserKey;

// 2) Edge Function 호출 전용 클라이언트
// - publishable / browser key 우선
const supabaseFunctionKey = supabaseBrowserKey || supabaseLegacyAnonKey;

if (!supabaseUrl || !supabaseDbKey) {
  console.warn('[Supabase] Missing DB/Auth environment variables.');
}

if (!supabaseUrl || !supabaseFunctionKey) {
  console.warn('[Supabase] Missing Function environment variables.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseDbKey || 'placeholder'
);

export const supabaseFunctions = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseFunctionKey || 'placeholder',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
