import { loadEnv } from 'vite';

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const groups = [
  ['로그인 · 저장 · 크레딧', ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']],
  ['지도 · 장소 검색', ['VITE_KAKAO_MAP_APP_KEY']],
  ['현재 AIService 연동', ['VITE_AI_PROXY_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_LEGACY_ANON_KEY']],
  ['외부 상권 CSV', ['VITE_CSV_BASE_URL']],
  ['공공데이터 API', ['VITE_ODCLOUD_API_KEY']],
  ['결제 클라이언트', ['VITE_TOSS_CLIENT_KEY']],
];
console.log(`Node ${process.versions.node} · 설정 상태 (값은 출력하지 않음)`);
for (const [feature, keys] of groups) {
  const missing = keys.filter(key => !env[key]?.trim());
  console.log(`${missing.length ? '미설정' : '설정됨'}: ${feature}${missing.length ? ' — ' + missing.join(', ') : ''}`);
}
console.log('설정됨은 연결 성공을 뜻하지 않습니다. 외부 서비스는 각각 확인해야 합니다.');
