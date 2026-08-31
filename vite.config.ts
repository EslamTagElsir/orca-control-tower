import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Preserve ORCA's explicit SSR error wrapper as the server entry.
      server: { entry: "server" },
    }),
    // Native Nitro output keeps the frontend portable across Node/Docker and
    // other supported hosts instead of forcing a Lovable/Cloudflare preset.
    nitro(),
    viteReact(),
  ],
});
