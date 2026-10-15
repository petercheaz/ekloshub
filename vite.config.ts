import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.join(repoRoot, "src");

export default defineConfig({
  plugins: [react()],
  root: "client",
  resolve: {
    alias: {
      "@media-limits": path.join(sharedSrc, "media-limits.ts"),
      "@org-permissions": path.join(sharedSrc, "org-permissions.ts"),
      "@vbs-snacks-menu-days": path.join(sharedSrc, "vbs-snacks-menu-days.ts"),
      "@vbs-cooking-plan-types": path.join(sharedSrc, "vbs-cooking-plan-types.ts"),
      "@vbs-rotation-stations": path.join(sharedSrc, "vbs-rotation-stations.ts"),
      "@vbs-workbook-stations": path.join(sharedSrc, "vbs-workbook-stations.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
      "/files": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
