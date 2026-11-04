import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxy: the frontend owns the GS1 Digital Link paths (/01/...) for the passport page,
// so API calls to the resolver go through /resolver/01/... and are rewritten to the backend.
const BACKEND = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/resolver": {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/resolver/, ""),
      },
    },
  },
});
