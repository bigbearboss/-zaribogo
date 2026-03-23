/**
 * kakaoMapLoader.ts
 * ──────────────────────────────────────────────────────────────
 * Dedicated service for reliably loading the Kakao Maps SDK.
 * Handles script injection, singleton promise caching, and initialization.
 */

let loadPromise: Promise<void> | null = null;

export function loadKakaoMap(): Promise<void> {
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY;

    // 1. Return cached promise if already loading/loaded
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        if (!appKey) {
            console.error('[KakaoMapLoader] VITE_KAKAO_MAP_APP_KEY is missing from environment variables.');
            reject(new Error('VITE_KAKAO_MAP_APP_KEY is missing in .env'));
            return;
        }

        console.log(`[KakaoMapLoader] Initializing with AppKey prefix: ${appKey.substring(0, 4)}***`);

        // 2. Check if script already exists in DOM (e.g. from previous attempts)
        const existingScript = document.querySelector(`script[src*="dapi.kakao.com/v2/maps/sdk.js"]`);
        if (typeof window.kakao !== 'undefined' && window.kakao.maps && window.kakao.maps.load) {
            console.log('[KakaoMapLoader] SDK already available, reusing instance.');
            window.kakao.maps.load(() => resolve());
            return;
        }

        // 3. Create and inject script
        console.log('[KakaoMapLoader] Injecting Kakao Maps SDK script...');
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
        script.async = true;

        script.onload = () => {
            console.log('[KakaoMapLoader] Script tag loaded. Waiting for kakao.maps.load...');
            if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
                window.kakao.maps.load(() => {
                    console.log('[KakaoMapLoader] SDK successfully initialized and ready.');
                    resolve();
                });
            } else {
                console.error('[KakaoMapLoader] Script loaded but kakao.maps.load is undefined.');
                reject(new Error('Kakao Maps SDK loaded but maps.load is not available.'));
            }
        };

        script.onerror = (err) => {
            console.error('[KakaoMapLoader] SDK script injection failed.', err);
            loadPromise = null;
            reject(new Error('Failed to load Kakao Maps SDK script.'));
        };

        document.head.appendChild(script);
    });

    return loadPromise;
}
