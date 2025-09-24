import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer, { defaultOptions } from "@hono/vite-dev-server";
import build from "@hono/vite-build";

export default defineConfig(({ mode }) => {
  if (mode === "client") {
    return {
      build: {
        rollupOptions: {
          input: "./frontend/main.tsx",
          output: {
            dir: "./dist/static",
            entryFileNames: "main.js",
          },
        },
      },
    };
  } else {
    return {
      plugins: [
        react(),
        devServer({
          entry: "./server.tsx",
          exclude: [...defaultOptions.exclude, /^\/.vite\/.+/],
        }),
        build({ entry: "./server.tsx" }),
      ],
    };
  }
});
