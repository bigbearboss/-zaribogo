import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseLegacyAnonKey = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY as string | undefined;

/**
 * 브라우저에서는 publishable/browser key를 우선 사용하고,
 * 없을 때만 legacy anon key로 fallback 한다.
 */
const supabaseKey = supabaseBrowserKey || supabaseLegacyAnonKey;

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
