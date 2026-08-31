import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const nitroPreset = process.env.VERCEL ? undefined : "node-server";

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
    // Docker/local production builds stay pinned to a portable Node server.
    // On Vercel, leave the preset unset so Nitro can select Vercel's native
    // deployment target exactly as recommended by Vercel for TanStack Start.
    nitro({ preset: nitroPreset }),
    viteReact(),
  ],
});
