/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_NAVER_MAPS_CLIENT_ID: string;
    readonly VITE_ODCLOUD_API_KEY: string;
    readonly VITE_ODCLOUD_BASE_URL: string;
    readonly VITE_KAKAO_MAP_APP_KEY: string;
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
