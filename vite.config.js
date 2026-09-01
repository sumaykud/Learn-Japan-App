import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Absolute, not "./". The app has a real route at /admin, and a relative base
  // would make its assets resolve to /admin/assets/... and 404. The host must
  // therefore serve index.html for unknown paths — see vercel.json.
  //
  // Deploying under a sub-path (GitHub Pages project sites) means setting this
  // to "/<repo-name>/" and providing the same SPA fallback; the router reads
  // import.meta.env.BASE_URL and adjusts.
  base: "/",
});
