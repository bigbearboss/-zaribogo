# 🔍 자리보고 (JariBogo) - 배포 가이드

'자리보고' 서비스를 실제 환경에 배포하기 위한 가이드입니다.

## 1. 환경변수 설정 (.env)

배포 전, 프로젝트 루트에 `.env.production` 파일을 생성하거나 환경변수를 설정해야 합니다. `.env.example` 파일을 참고하세요.

| 변수명 | 설명 | 비고 |
| :--- | :--- | :--- |
| `VITE_KAKAO_MAP_APP_KEY` | 카카오맵 JavaScript 키 | 개발자 센터 등록 필수 |
| `VITE_ODCLOUD_API_KEY` | 공공데이터포털 API 키 | Encoding 키 권장 |
| `VITE_AI_PROXY_URL` | AI 요약 프록시 엔드포인트 | `/api/ai-summary` (기본값) |

## 2. 빌드 및 배포

본 프로젝트는 Vite를 사용하는 정적 웹 애플리케이션입니다.

### 빌드 명령어
```bash
npm run build
```
빌드가 완료되면 `/dist` 폴더에 정적 파일들이 생성됩니다.

### 배포 대상
- **Vercel / Netlify**: 프로젝트 연결 후 환경변수만 등록하면 자동 배포됩니다.
- **S3 / Cloudfront**: `dist` 폴더의 내용을 업로드합니다.

## 3. 도메인 연결 후 필수 작업 (중요)

도메인을 연결한 후에는 반드시 아래 작업을 수행해야 서비스가 정상 작동합니다.

### 1) Kakao Developers 설정
- [Kakao Developers 콘솔](https://developers.kakao.com/) 접속
- **내 애플리케이션 > 플랫폼 > Web** 메뉴로 이동
- **사이트 도메인**에 실제 배포된 URL (예: `https://your-domain.com`) 추가 등록

### 2) API 키 보안 (권장)
- 공공데이터포털 및 카카오 API 키에 대해 **도메인 제한(CORS)** 설정을 적용하여 무단 사용을 방지하세요.

## 4. 로컬 개발 환경 실행
```bash
npm install
npm run dev
```
로컬 서버는 `http://localhost:5175`에서 실행됩니다.
