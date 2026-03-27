/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_NAVER_MAPS_CLIENT_ID: string;
    readonly VITE_ODCLOUD_API_KEY: string;
    readonly VITE_ODCLOUD_BASE_URL: string;
    readonly VITE_KAKAO_MAP_APP_KEY: string;
    readonly VITE_AI_PROXY_URL?: string;
    readonly VITE_SGIS_CONSUMER_KEY: string;
    readonly VITE_SGIS_CONSUMER_SECRET: strign;
    readonly VITE_SGIS_API_BASE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
