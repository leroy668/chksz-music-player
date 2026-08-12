import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      "/chksz-api": {
        target: "https://api.chksz.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chksz-api/, ""),
      },
    },
  },
});
