import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseLegacyAnonKey = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY as string | undefined;
const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
