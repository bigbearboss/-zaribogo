import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_BROWSER_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const SUPABASE_LEGACY_ANON_KEY = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY as string | undefined;

/**
 * 브라우저에서는 publishable/browser key를 우선 사용하고,
 * 없을 때만 legacy anon key로 fallback 한다.
 */
export const SUPABASE_PUBLIC_KEY = SUPABASE_BROWSER_KEY || SUPABASE_LEGACY_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
  console.warn(
    '[Supabase] Missing environment variables. Check VITE_SUPABASE_URL and anon key envs.'
  );
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_PUBLIC_KEY || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
