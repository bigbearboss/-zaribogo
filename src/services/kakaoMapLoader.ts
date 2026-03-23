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
            reject(new Error('VITE_KAKAO_MAP_APP_KEY is missing in .env'));
            return;
        }

        // 2. Check if script already exists in DOM (e.g. from previous attempts)
        const existingScript = document.querySelector(`script[src*="dapi.kakao.com/v2/maps/sdk.js"]`);
        if (typeof window.kakao !== 'undefined' && window.kakao.maps && window.kakao.maps.load) {
            window.kakao.maps.load(() => resolve());
            return;
        }

        if (existingScript) {
            // If script exists but kakao is not ready, we might need to wait or handle manually.
            // But to be safe, we'll proceed with attaching to the existing one's load event or reinjecting.
            // Kakao SDK requires manual load() call anyway when autoload=false.
        }

        // 3. Create and inject script
        const script = document.createElement('script');
        script.type = 'text/javascript';
        // Requirements: https, dapi.kakao.com, appkey, libraries=services, autoload=false
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
        script.async = true;

        script.onload = () => {
            if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
                window.kakao.maps.load(() => {
                    resolve();
                });
            } else {
                reject(new Error('Kakao Maps SDK loaded but maps.load is not available.'));
            }
        };

        script.onerror = () => {
            loadPromise = null; // Allow retry on failure
            reject(new Error('Failed to load Kakao Maps SDK script.'));
        };

        document.head.appendChild(script);
    });

    return loadPromise;
}
