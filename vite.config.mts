import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
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
        preact(),
        devServer({
          entry: "./server.tsx",
          exclude: [...defaultOptions.exclude, /^\/.vite\/.+/],
        }),
        build({ entry: "./server.tsx" }),
      ],
    };
  }
});
