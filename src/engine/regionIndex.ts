// regionIndex.ts — Bounding box lookup for per-gu CSV loading
// Bounding boxes extracted from actual processed CSV data.
// resolveRegionUrl() returns the smallest available CSV URL for a given coordinate.

interface RegionEntry {
    csvUrl: string;
    latMin: number;
    latMax: number;
    lngMin: number;
    lngMax: number;
}

// Indexed by district name for reference; lookup is done by iterating entries.
const regionEntries: RegionEntry[] = [
    // ── Seoul 25 gu ─────────────────────────────────────────────────────────
    { csvUrl: '/processed/regions/seoul_gangnam.csv', latMin: 37.4691, latMax: 37.5339, lngMin: 127.0100, lngMax: 127.1001 },
    { csvUrl: '/processed/regions/seoul_gangdong.csv', latMin: 37.5186, latMax: 37.5756, lngMin: 127.0929, lngMax: 127.1823 },
    { csvUrl: '/processed/regions/seoul_gangbuk.csv', latMin: 37.6129, latMax: 37.6783, lngMin: 126.9820, lngMax: 127.0350 },
    { csvUrl: '/processed/regions/seoul_gangseo.csv', latMin: 37.5221, latMax: 37.5889, lngMin: 126.7982, lngMax: 126.8855 },
    { csvUrl: '/processed/regions/seoul_gwanak.csv', latMin: 37.4546, latMax: 37.5141, lngMin: 126.9007, lngMax: 126.9878 },
    { csvUrl: '/processed/regions/seoul_gwangjin.csv', latMin: 37.5368, latMax: 37.5736, lngMin: 127.0617, lngMax: 127.1168 },
    { csvUrl: '/processed/regions/seoul_guro.csv', latMin: 37.4791, latMax: 37.5315, lngMin: 126.8469, lngMax: 126.9117 },
    { csvUrl: '/processed/regions/seoul_geumcheon.csv', latMin: 37.4339, latMax: 37.4858, lngMin: 126.8743, lngMax: 126.9206 },
    { csvUrl: '/processed/regions/seoul_nowon.csv', latMin: 37.6146, latMax: 37.6875, lngMin: 127.0429, lngMax: 127.1101 },
    { csvUrl: '/processed/regions/seoul_dobong.csv', latMin: 37.6324, latMax: 37.6926, lngMin: 127.0128, lngMax: 127.0542 },
    { csvUrl: '/processed/regions/seoul_dongdaemun.csv', latMin: 37.5611, latMax: 37.6056, lngMin: 127.0234, lngMax: 127.0770 },
    { csvUrl: '/processed/regions/seoul_dongjak.csv', latMin: 37.4761, latMax: 37.5158, lngMin: 126.9043, lngMax: 126.9833 },
    { csvUrl: '/processed/regions/seoul_mapo.csv', latMin: 37.5351, latMax: 37.5885, lngMin: 126.8726, lngMax: 126.9637 },
    { csvUrl: '/processed/regions/seoul_seodaemun.csv', latMin: 37.5556, latMax: 37.6061, lngMin: 126.9041, lngMax: 126.9686 },
    { csvUrl: '/processed/regions/seoul_seocho.csv', latMin: 37.4305, latMax: 37.5217, lngMin: 126.9811, lngMax: 127.0931 },
    { csvUrl: '/processed/regions/seoul_seongdong.csv', latMin: 37.5346, latMax: 37.5717, lngMin: 127.0098, lngMax: 127.0732 },
    { csvUrl: '/processed/regions/seoul_seongbuk.csv', latMin: 37.5780, latMax: 37.6233, lngMin: 126.9835, lngMax: 127.0701 },
    { csvUrl: '/processed/regions/seoul_songpa.csv', latMin: 37.4686, latMax: 37.5397, lngMin: 127.0717, lngMax: 127.1584 },
    { csvUrl: '/processed/regions/seoul_yangcheon.csv', latMin: 37.5052, latMax: 37.5508, lngMin: 126.8226, lngMax: 126.8877 },
    { csvUrl: '/processed/regions/seoul_yeongdeungpo.csv', latMin: 37.4857, latMax: 37.5453, lngMin: 126.8822, lngMax: 126.9416 },
    { csvUrl: '/processed/regions/seoul_yongsan.csv', latMin: 37.5081, latMax: 37.5549, lngMin: 126.9453, lngMax: 127.0156 },
    { csvUrl: '/processed/regions/seoul_eunpyeong.csv', latMin: 37.5772, latMax: 37.6581, lngMin: 126.8843, lngMax: 126.9507 },
    { csvUrl: '/processed/regions/seoul_jongno.csv', latMin: 37.5659, latMax: 37.6174, lngMin: 126.9527, lngMax: 127.0230 },
    { csvUrl: '/processed/regions/seoul_jung.csv', latMin: 37.5460, latMax: 37.5708, lngMin: 126.9617, lngMax: 127.0267 },
    { csvUrl: '/processed/regions/seoul_jungnang.csv', latMin: 37.5709, latMax: 37.6199, lngMin: 127.0710, lngMax: 127.1155 },

    // ── Gyeonggi key cities ──────────────────────────────────────────────────
    { csvUrl: '/processed/regions/gyeonggi_gwacheon.csv', latMin: 37.4039, latMax: 37.4639, lngMin: 126.9711, lngMax: 127.0345 },
    { csvUrl: '/processed/regions/gyeonggi_gwangmyeong.csv', latMin: 37.4032, latMax: 37.4931, lngMin: 126.8301, lngMax: 126.8993 },
    { csvUrl: '/processed/regions/gyeonggi_gwangju.csv', latMin: 37.2729, latMax: 37.5323, lngMin: 127.1378, lngMax: 127.4421 },
    { csvUrl: '/processed/regions/gyeonggi_guri.csv', latMin: 37.5600, latMax: 37.6448, lngMin: 127.1068, lngMax: 127.1661 },
    { csvUrl: '/processed/regions/gyeonggi_gunpo.csv', latMin: 37.3116, latMax: 37.3781, lngMin: 126.8771, lngMax: 126.9622 },
    { csvUrl: '/processed/regions/gyeonggi_gimpo.csv', latMin: 37.5822, latMax: 37.7702, lngMin: 126.5249, lngMax: 126.8007 },
    { csvUrl: '/processed/regions/gyeonggi_namyangju.csv', latMin: 37.5143, latMax: 37.7700, lngMin: 127.0999, lngMax: 127.3760 },
    { csvUrl: '/processed/regions/gyeonggi_dongducheon.csv', latMin: 37.8639, latMax: 37.9735, lngMin: 127.0110, lngMax: 127.1387 },
    { csvUrl: '/processed/regions/gyeonggi_siheung.csv', latMin: 37.3128, latMax: 37.4719, lngMin: 126.6731, lngMax: 126.8756 },
    { csvUrl: '/processed/regions/gyeonggi_anseong.csv', latMin: 36.9035, latMax: 37.1423, lngMin: 127.1068, lngMax: 127.5148 },
    { csvUrl: '/processed/regions/gyeonggi_yangju.csv', latMin: 37.6725, latMax: 37.9353, lngMin: 126.9102, lngMax: 127.1167 },
    { csvUrl: '/processed/regions/gyeonggi_yangpyeong.csv', latMin: 37.3735, latMax: 37.6552, lngMin: 127.3143, lngMax: 127.8081 },
    { csvUrl: '/processed/regions/gyeonggi_yeoju.csv', latMin: 37.1519, latMax: 37.4362, lngMin: 127.4182, lngMax: 127.7660 },
    { csvUrl: '/processed/regions/gyeonggi_yeoncheon.csv', latMin: 37.9411, latMax: 38.2312, lngMin: 126.8267, lngMax: 127.1608 },
    { csvUrl: '/processed/regions/gyeonggi_osan.csv', latMin: 37.1257, latMax: 37.1992, lngMin: 127.0050, lngMax: 127.0955 },
    { csvUrl: '/processed/regions/gyeonggi_uiwang.csv', latMin: 37.3018, latMax: 37.4070, lngMin: 126.9319, lngMax: 127.0300 },
    { csvUrl: '/processed/regions/gyeonggi_uijeongbu.csv', latMin: 37.6894, latMax: 37.7765, lngMin: 127.0057, lngMax: 127.1208 },
    { csvUrl: '/processed/regions/gyeonggi_icheon.csv', latMin: 37.0439, latMax: 37.3492, lngMin: 127.3348, lngMax: 127.6368 },
    { csvUrl: '/processed/regions/gyeonggi_paju.csv', latMin: 37.6943, latMax: 38.0044, lngMin: 126.6771, lngMax: 127.0123 },
    { csvUrl: '/processed/regions/gyeonggi_pyeongtaek.csv', latMin: 36.9144, latMax: 37.1396, lngMin: 126.7921, lngMax: 127.1537 },
    { csvUrl: '/processed/regions/gyeonggi_pocheon.csv', latMin: 37.7562, latMax: 38.1731, lngMin: 127.0969, lngMax: 127.4225 },
    { csvUrl: '/processed/regions/gyeonggi_hanam.csv', latMin: 37.4724, latMax: 37.5805, lngMin: 127.1404, lngMax: 127.2768 },
    { csvUrl: '/processed/regions/gyeonggi_hwaseong.csv', latMin: 37.0260, latMax: 37.2913, lngMin: 126.5413, lngMax: 127.1491 },
    { csvUrl: '/processed/regions/gyeonggi_gapyeong.csv', latMin: 37.5883, latMax: 38.0273, lngMin: 127.2824, lngMax: 127.5992 },
    { csvUrl: '/processed/regions/gyeonggi_suwon.csv', latMin: 37.2292, latMax: 37.3383, lngMin: 126.9333, lngMax: 127.0882 },
    { csvUrl: '/processed/regions/gyeonggi_seongnam.csv', latMin: 37.3354, latMax: 37.4737, lngMin: 127.0360, lngMax: 127.1858 },
    { csvUrl: '/processed/regions/gyeonggi_goyang.csv', latMin: 37.5777, latMax: 37.7471, lngMin: 126.6803, lngMax: 126.9599 },
    { csvUrl: '/processed/regions/gyeonggi_yongin.csv', latMin: 37.0869, latMax: 37.3710, lngMin: 127.0255, lngMax: 127.4202 },
    { csvUrl: '/processed/regions/gyeonggi_bucheon.csv', latMin: 37.4604, latMax: 37.5521, lngMin: 126.7420, lngMax: 126.8334 },
    { csvUrl: '/processed/regions/gyeonggi_ansan.csv', latMin: 37.1118, latMax: 37.3711, lngMin: 126.3910, lngMax: 126.9370 },
    { csvUrl: '/processed/regions/gyeonggi_anyang.csv', latMin: 37.3618, latMax: 37.4356, lngMin: 126.8820, lngMax: 126.9811 },
];

/**
 * Returns the best-match regional CSV URL for a given lat/lng coordinate.
 * Falls back to the full Seoul processed CSV if no region matches.
 */
export function resolveRegionUrl(lat: number, lng: number): string {
    for (const entry of regionEntries) {
        if (lat >= entry.latMin && lat <= entry.latMax &&
            lng >= entry.lngMin && lng <= entry.lngMax) {
            return entry.csvUrl;
        }
    }
    // Fallback: full Seoul file
    console.warn(`[regionIndex] No region match for (${lat}, ${lng}). Falling back to full Seoul CSV.`);
    return '/processed/seoul_processed.csv';
}
