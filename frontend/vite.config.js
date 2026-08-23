import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend calls the backend via the relative path "/api/...".
// In dev, Vite proxies those requests to the backend container.
// Inside Docker Compose the backend is reachable as host "backend".
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so it's reachable from outside the container
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://backend:5000",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.VITE_API_TARGET || "http://backend:5000",
        changeOrigin: true,
      },
    },
  },
});
