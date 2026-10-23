import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// La mappa generata sta in /data: permettiamo a Vite di servire file dalla radice del monorepo.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, fs: { allow: [repoRoot] } },
});
