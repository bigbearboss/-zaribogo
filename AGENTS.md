# 자리보고 개발 안내

## 프로젝트와 작업 범위
- 기존 Vite + TypeScript 앱이다. 프레임워크 교체 없이 현재 저장소를 이어 개발한다.
- 기존 Supabase 인증/DB/Edge Functions, Kakao 지도, Cloudflare 배포와 도메인을 유지한다.
- UI 수정으로 CRI 계산식, 결제/환불, 크레딧 차감, DB 스키마를 변경하지 않는다.
- 실제 분석과 화면 검토용 데이터를 명확히 구분한다. 개발 예시는 `import.meta.env.DEV` 안에서만 실행한다.

## 실행 및 검증
- Node 24, npm. `npm ci`, `npm run dev`.
- `npm run doctor`: 필요한 설정의 유무만 확인하며 값은 출력하지 않는다.
- `npm run typecheck`, `npm run build`를 실행한다.
- `.env.example`을 참고해 `.env.local`에 기존 프로젝트의 공개 클라이언트 설정을 지정한다.
- 서버 비밀키를 `VITE_*` 또는 Git에 넣지 않는다. `.env.local`은 커밋하지 않는다.
- 반응형 검토는 `dev/responsive.html`에서 320/360/390/430/768/1024/1440px을 확인한다.
- 확인할 화면: 랜딩, 조건 입력, 업종 선택, 접힌/펼친 추가 조건, 결과 예시, 로그인 안내, 마이페이지.
- 탭 이동으로 입력값이 보존되는지, 가로 넘침/버튼 가림이 없는지, 키보드 탐색이 되는지 확인한다.
- 실제 로그인·결제·데이터 연동을 확인하지 않았다면 완료 보고에서 구분한다.

## 주요 파일
- `index.html`: 랜딩과 분석 화면. 기존 요소 ID는 `src/main.ts`에서 사용하므로 함부로 변경하지 않는다.
- `src/ui/appShell.ts`: 모바일 탭, 홈/분석 화면 전환, 접근성, 상태 안내.
- `src/responsive.css`: 현재 랜딩/분석 화면의 반응형 스타일. HTML에서 마지막으로 로드한다.
- `src/style.css`, `src/app_modern.css`: 기존 스타일. 레거시 전역 규칙과의 충돌에 주의한다.
- `src/zentropa-report.css`: 실제 분석 결과 카드.
- `src/main.ts`: 입력/분석/저장/결과 렌더링 연결.
- `src/engine/`: 상권·재무 분석. `src/map/`: 지도.
- `src/dev/responsivePreview.ts`: 실제 API 호출이나 크레딧 차감 없는 개발용 결과 예시.
- `docs/CODEX_HANDOFF.md`: 개발 환경 인계와 남은 연동 확인 사항.

## Git
- 기능별 `codex/*` 브랜치에서 작업하고 검증 결과를 PR에 남긴다.
- 기존 배포가 main을 감시할 수 있으므로 main 반영은 운영 배포와 연결될 수 있다.
- 소스는 이 GitHub 저장소를 기준으로 관리한다. 별도 서비스나 중복 저장소로 복제하지 않는다.
