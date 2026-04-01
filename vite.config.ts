import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 5175,
        strictPort: true,
    },
    build: {
        rollupOptions: {
            input: {
                main: new URL('./index.html', import.meta.url).pathname,
                mypage: new URL('./mypage.html', import.meta.url).pathname,
                adminBilling: new URL('./admin-billing.html', import.meta.url).pathname,
            }
        }
    }
});
