import { loadKakaoMap } from "../../services/kakaoMapLoader";
import { KakaoMapManager } from "../../map/KakaoMapManager";

/**
 * MVP Kakao Map Initialization
 * ──────────────────────────────────────────────────────────────
 * Initializes a map at Seoul center (37.5665, 126.9780) with a
 * marker and a 500m radius circle.
 */
export async function initKakaoMapDebug(containerId: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`[KakaoMapDebug] Container #${containerId} not found.`);
        return;
    }

    try {
        // 1. Load SDK via dedicated service
        await loadKakaoMap();

        const kakao = window.kakao;
        const defaultPos = { lat: 37.5665, lng: 126.9780 };
        const center = new kakao.maps.LatLng(defaultPos.lat, defaultPos.lng);

        // 2. Initialize Map
        const map = new kakao.maps.Map(container, {
            center: center,
            level: 4
        });

        // 3. Initialize Marker
        const marker = new kakao.maps.Marker({
            position: center,
            map: map
        });

        // 4. Initialize 500m Circle
        const circle = new kakao.maps.Circle({
            center: center,
            radius: 500,
            strokeWeight: 2,
            strokeColor: '#6366f1',
            strokeOpacity: 0.8,
            strokeStyle: 'solid',
            fillColor: '#6366f1',
            fillOpacity: 0.08,
            map: map
        });

        // 5. Click Event: Move marker & circle, log coords
        kakao.maps.event.addListener(map, 'click', (e: any) => {
            const latLng = e.latLng;
            const lat = latLng.getLat();
            const lng = latLng.getLng();

            marker.setPosition(latLng);
            circle.setPosition(latLng);

            console.log(`[KakaoMapDebug] Clicked Location: lat=${lat}, lng=${lng}`);
        });

        console.log('[KakaoMapDebug] Initialization complete at Seoul center.');
    } catch (err: any) {
        console.error('[KakaoMapDebug] Failed to initialize:', err.message);
        KakaoMapManager.showError(containerId, '지도를 불러올 수 없습니다. API 키 또는 구성을 확인하세요.');
    }
}
