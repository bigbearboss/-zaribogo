# 자리보고 (Zaribogo)

계약 전 후보지의 상권·재무 조건을 확인하는 Vite + TypeScript 웹 앱입니다. 기존 GitHub 저장소를 Codex에서 이어 개발하며, Supabase와 Cloudflare에 있는 서비스는 그대로 연결합니다.

[모바일 개편 미리보기](https://codex-mobile-ready.zaribogo.pages.dev/) · [변경 검토 PR](https://github.com/bigbearboss/-zaribogo/pull/1)

미리보기는 별도 브랜치 배포입니다. 현재 Preview 환경에 지도 및 분석 연결 설정이 없어 화면을 확인할 수 있는 상태이며, 실제 기능 연동은 설정 후 검증해야 합니다.

## 개발 시작

Node 24를 사용합니다 (`.nvmrc`). Windows에서도 같은 npm 명령을 사용할 수 있습니다.

```bash
git clone https://github.com/bigbearboss/-zaribogo.git
cd -zaribogo
npm ci
```

`.env.example`을 `.env.local`로 복사한 뒤, 기존 Antigravity 프로젝트의 클라이언트 설정값을 옮깁니다. API 비밀키를 채팅이나 Git에 붙여 넣지 마세요. 변수별 용도와 연동 확인 순서는 [개발 인계 문서](docs/CODEX_HANDOFF.md)에 정리했습니다.

```bash
npm run doctor
npm run dev
```

일반 로컬 개발 주소는 `http://localhost:5175`입니다. `doctor`는 설정 유무만 출력하며 실제 연결 성공 여부를 검사하지 않습니다. API 설정 없이도 소개 페이지와 개발용 화면 예시를 확인할 수 있습니다.

## 화면 검토

개발 서버에서 `/dev/responsive.html`을 열면 320~1440px 화면 폭과 소개/입력/리포트/마이페이지를 선택할 수 있습니다. 이는 브라우저 안의 CSS 화면 폭 검사이며 실제 휴대폰의 키보드, 노치, 터치 동작을 완전히 재현하지는 않습니다.

- `/?ui-preview=app`: 분석 조건 화면
- `/?ui-preview=report`: 실제 렌더러와 가상 입력값으로 만든 리포트 예시
- `/mypage.html`: 기존 마이페이지. 로그인되지 않았다면 홈으로 이동합니다.

개발용 리포트는 실제 분석 결과가 아니며 API 분석·결제·저장을 실행하지 않습니다. 검토 페이지와 예시 데이터 모듈은 프로덕션 빌드에 포함되지 않습니다.

## 검증과 배포

```bash
npm run typecheck
npm run build
```

배포 산출물은 `dist/`이며 `index.html`, `mypage.html`, `admin-billing.html`을 포함합니다. 기존 Cloudflare Pages 프로젝트의 환경변수·연결 브랜치·빌드 설정을 확인한 후 배포하세요. Supabase Edge Functions와 DB는 별도로 운영되는 기존 프로젝트를 사용합니다.

Vite 개발 서버와 `npm run preview`는 `functions/`의 Cloudflare 서버 함수를 실행하지 않습니다. 로컬 AI 연동에는 기존 서버 엔드포인트를 지정하거나 별도의 Cloudflare 개발 환경이 필요합니다.

지속적인 작업 규칙은 [AGENTS.md](AGENTS.md), 코드 구조·현재 검증 범위·남은 작업은 [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md)를 참고하세요.
