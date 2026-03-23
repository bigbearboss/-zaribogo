import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 5175,
        strictPort: true, // 5175가 이미 사용 중이면 에러를 던짐 (스크립트에서 처리)
    },
});
