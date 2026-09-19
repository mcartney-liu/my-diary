import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const TS = Date.now().toString();

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify("0.4.1-" + TS),
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/index-${TS}.js`,
        chunkFileNames: `assets/chunk-${TS}.js`,
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api/transcribe": {
        target: "http://localhost:8080",
        changeOrigin: true,
        timeout: 120_000,
      },
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
