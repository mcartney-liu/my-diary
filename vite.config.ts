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
      // 所有 /api/* 代理到 Cloudflare Worker
      "/api": {
        target: "https://mydiary-api-dev.mcartneyliu.workers.dev",
        changeOrigin: true,
        secure: false,
      },
      "/api/transcribe": {
        target: "http://localhost:8080",
        changeOrigin: true,
        timeout: 120_000,
      },
    },
  },
});

