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
    // Pin the deployment artifact to Node even when the build itself runs under
    // Bun (for example inside the Docker build stage). Auto-detection would
    // otherwise emit a Bun-specific server that cannot be started by Node.
    nitro({ preset: "node-server" }),
    viteReact(),
  ],
});
