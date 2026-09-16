import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      // 更具体的放前面，优先匹配
      "/api/transcribe": {
        target: "http://localhost:8080",
        changeOrigin: true,
        timeout: 120_000,
      },
      // 所有其他 /api/* 代理到 Cloudflare Worker (dev 环境)
      "/api": {
        target: "https://mydiary-api-dev.mcartneyliu.workers.dev",
        changeOrigin: true,
        secure: false,
        timeout: 30_000,
        proxyTimeout: 30_000,
      },
    },
  },
});
