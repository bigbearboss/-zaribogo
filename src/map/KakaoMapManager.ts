/**
 * KakaoMapManager.ts
 * ──────────────────────────────────────────────────────────────
 * Encapsulates all Kakao Maps JavaScript API interactions:
 *   - Dynamic SDK loading (with services library)
 *   - Map initialization
 *   - Single marker management
 *   - Radius circle
 *   - Keyword place search
 *   - Click-to-select location
 *   - Graceful error display
 *
 * Usage:
 *   const mgr = new KakaoMapManager();
 *   await KakaoMapManager.loadSdk(apiKey);
 *   mgr.init('mapContainer', 37.5665, 126.9780);
 *   mgr.onLocationSelect = (lat, lng, label) => { ... };
 */

export interface KakaoPlaceResult {
    placeName: string;
    addressName: string;
    roadAddressName: string;
    lat: number;
    lng: number;
    id: string;

    // 🔥 추가
    sidoName?: string;
    sigunguName?: string;
    dongName?: string;
}

type LocationSelectCallback = (
  lat: number,
  lng: number,
  label: string,
  meta?: {
    sidoName?: string;
    sigunguName?: string;
    dongName?: string;
  }
) => void;

export class KakaoMapManager {
    private map: any = null;
    private marker: any = null;
    private circle: any = null;
    private ps: any = null;
    private geocoder: any = null;

    /** Called whenever a location is selected (map click or search result). */
    onLocationSelect: LocationSelectCallback | null = null;

    // ──────────────────────────────────────────────────────────
    // 2. Map Initialization
    // ──────────────────────────────────────────────────────────

    init(containerId: string, lat: number, lng: number): void {
        console.log("[map] init called");

        const kakao = window.kakao;
        if (!kakao || !kakao.maps) {
            console.error('[KakaoMap] window.kakao.maps is not available during init.');
            return;
        }

        // 1. 이미 지도가 초기화된 경우 건너뜀 (싱글톤 유지)
        if (this.map) {
            console.log("[map] map already exists, skip init");
            return;
        }

        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`[KakaoMap] Container #${containerId} not found in DOM.`);
            return;
        }

        const center = new kakao.maps.LatLng(lat, lng);
        try {
            this.map = new kakao.maps.Map(container, { center, level: 4 });
            console.log('[KakaoMap] Map instance created successfully.');
        } catch (err) {
            console.error('[KakaoMap] Failed to create Map instance:', err);
            return;
        }

        // 2. 서비스 객체 초기화 (1회만)
        if (!this.ps) this.ps = new kakao.maps.services.Places();
        if (!this.geocoder) this.geocoder = new kakao.maps.services.Geocoder();

        // 3. 이벤트 리스너 등록 (1회만)
        kakao.maps.event.addListener(this.map, 'click', (e: any) => {
            const clickedLat = e.latLng.getLat();
            const clickedLng = e.latLng.getLng();
            console.log(`[KakaoMap] Map clicked: ${clickedLat}, ${clickedLng}`);
            this._reverseGeocode(clickedLat, clickedLng);
        });
    }

    // ──────────────────────────────────────────────────────────
    // 3. Marker + Circle
    // ──────────────────────────────────────────────────────────

    setMarker(lat: number, lng: number, radiusM: number): void {
        console.log("[map] setMarker called", { lat, lng, radiusM });
        const kakao = window.kakao;
        if (!this.map) return;

        const pos = new kakao.maps.LatLng(lat, lng);

        // 1. Marker 업데이트 또는 생성
        if (this.marker) {
            this.marker.setPosition(pos);
            console.log("[map] marker updated");
        } else {
            this.marker = new kakao.maps.Marker({ position: pos, map: this.map });
            console.log("[map] marker created");
        }

        // 2. Circle 업데이트 또는 생성
        const circleOptions: any = {
            center: pos,
            radius: radiusM,
            strokeWeight: 2,
            strokeColor: '#6366f1',
            strokeOpacity: 0.8,
            strokeStyle: 'solid',
            fillColor: '#6366f1',
            fillOpacity: 0.08,
        };
        if (this.circle) {
            this.circle.setPosition(pos);
            this.circle.setRadius(radiusM);
            console.log("[map] circle updated");
        } else {
            this.circle = new kakao.maps.Circle({ ...circleOptions, map: this.map });
            console.log("[map] circle created");
        }

        // 3. 지도 중심 이동
        this.map.setCenter(pos);
    }

    /** Update only the radius circle (e.g., when user changes radius selector). */
    updateRadius(radiusM: number): void {
        if (this.circle) this.circle.setRadius(radiusM);
    }

    // ──────────────────────────────────────────────────────────
    // 4. Keyword Search
    // ──────────────────────────────────────────────────────────

    searchKeyword(query: string): Promise<KakaoPlaceResult[]> {
        const kakao = window.kakao;
        return new Promise((resolve) => {
            if (!this.ps || !query.trim()) { resolve([]); return; }

            this.ps.keywordSearch(query, (results: any[], status: any) => {
                if (status !== kakao.maps.services.Status.OK) { resolve([]); return; }
               const places: KakaoPlaceResult[] = results.map(r => ({
    placeName: r.place_name,
    addressName: r.address_name,
    roadAddressName: r.road_address_name,
    lat: parseFloat(r.y),
    lng: parseFloat(r.x),
    id: r.id,

    // 🔥 핵심
    sidoName: r.address?.region_1depth_name,
    sigunguName: r.address?.region_2depth_name,
    dongName: r.address?.region_3depth_name,
}));
                resolve(places);
            }, { size: 10 });
        });
    }

    /** Search for exact addresses (geocoding). */
    searchAddress(query: string): Promise<KakaoPlaceResult[]> {
        const kakao = window.kakao;
        return new Promise((resolve) => {
            if (!this.geocoder || !query.trim()) { resolve([]); return; }

            this.geocoder.addressSearch(query, (results: any[], status: any) => {
                if (status !== kakao.maps.services.Status.OK) { resolve([]); return; }
                const places: KakaoPlaceResult[] = results.map(r => {
    const addr = r.address;

    return {
        placeName: r.address_name,
        addressName: r.address_name,
        roadAddressName: r.road_address?.address_name || r.address?.address_name || '',
        lat: parseFloat(r.y),
        lng: parseFloat(r.x),
        id: 'addr_' + Date.now() + Math.random().toString(36).substr(2, 5),

        // 🔥 핵심 추가
        sidoName: addr?.region_1depth_name,
        sigunguName: addr?.region_2depth_name,
        dongName: addr?.region_3depth_name,
    };
});
                resolve(places);
            });
        });
    }

async resolveAddressMeta(lat: number, lng: number): Promise<{
    address?: string;
    sidoName?: string;
    sigunguName?: string;
    dongName?: string;
}> {
    const kakao = window.kakao;

    // 타임아웃 (3초) - API 무응답 시 UI freeze 방지
    const timeout = new Promise<{}>((resolve) =>
        setTimeout(() => {
            console.warn('[KakaoMap] resolveAddressMeta timed out — returning empty meta');
            resolve({});
        }, 3000)
    );

    const apiCall = new Promise<{
        address?: string;
        sidoName?: string;
        sigunguName?: string;
        dongName?: string;
    }>((resolve) => {
        if (!this.geocoder) {
            resolve({});
            return;
        }

        this.geocoder.coord2Address(lng, lat, (result: any[], status: any) => {
            if (status !== kakao.maps.services.Status.OK || !result[0]) {
                resolve({});
                return;
            }

            const addr = result[0]?.address;
            const roadAddr = result[0]?.road_address;

            resolve({
                address: roadAddr?.address_name || addr?.address_name || "",
                sidoName: addr?.region_1depth_name,
                sigunguName: addr?.region_2depth_name,
                dongName: addr?.region_3depth_name,
            });
        });
    });

    return Promise.race([apiCall, timeout]) as Promise<{
        address?: string;
        sidoName?: string;
        sigunguName?: string;
        dongName?: string;
    }>;
}
    
    // ──────────────────────────────────────────────────────────
    // 5. Reverse Geocoding (map click → address)
    // ──────────────────────────────────────────────────────────

    private _reverseGeocode(lat: number, lng: number): void {
        const kakao = window.kakao;
        if (!this.geocoder) { this._emitSelect(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`); return; }

        this.geocoder.coord2Address(lng, lat, (result: any[], status: any) => {
            const label = (status === kakao.maps.services.Status.OK && result[0])
                ? (result[0].road_address?.address_name || result[0].address?.address_name || '선택한 위치')
                : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            const addr = result[0]?.address;

this._emitSelect(lat, lng, label, {
    sidoName: addr?.region_1depth_name,
    sigunguName: addr?.region_2depth_name,
    dongName: addr?.region_3depth_name,
});
        });
    }

    private _emitSelect(
    lat: number,
    lng: number,
    label: string,
    meta?: {
        sidoName?: string;
        sigunguName?: string;
        dongName?: string;
    }
): void {
    this.onLocationSelect?.(lat, lng, label, meta);
}
 
    // ──────────────────────────────────────────────────────────
    // 6. Error Display
    // ──────────────────────────────────────────────────────────

    static showError(containerId: string, message: string): void {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = `
            <div class="kakao-map-error">
                <span class="kakao-map-error-icon">🗺️</span>
                <p>${message}</p>
            </div>`;
    }
}
