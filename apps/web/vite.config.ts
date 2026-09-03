import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  // Same proxy for `vite preview`, so a local production-build check
  // exercises real API calls too, not just static asset serving.
  preview: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    // No sourcemaps in the production artifact — this is a private
    // governance app; shipping source maps would hand out readable
    // TypeScript sources (including API request shapes) to anyone with
    // the URL for no benefit to real users.
    sourcemap: false,
  },
});
