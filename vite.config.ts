import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    // 代理：前端 /api/transcribe → 本地 Whisper 服务（默认 8080）
    // 没起本地服务时会 fallback 到 Cloudflare Worker
    proxy: {
      "/api/transcribe": {
        target: "http://localhost:8080",
        changeOrigin: true,
        timeout: 120_000, // Whisper 转写比较慢
      },
    },
  },
});
