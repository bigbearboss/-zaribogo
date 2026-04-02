import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseLegacyAnonKey = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY as string | undefined;
const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 브라우저에서는 Supabase client를 반드시 하나만 생성한다.
 *
 * 우선순위
 * 1) legacy anon key (기존 Auth/DB 흐름과의 호환)
 * 2) browser/publishable key
 */
const supabaseKey = supabaseLegacyAnonKey || supabaseBrowserKey;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Supabase] Missing environment variables. Check VITE_SUPABASE_URL and anon key envs.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);