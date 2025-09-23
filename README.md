# openscad-previewer

Hot-reload previewer for OpenSCAD using WebAssembly. Deno server + Preact +
Three.js.

# Frontend runtime options for OpenSCAD WASM

This app can load OpenSCAD WASM in two ways:

1. Local (default; recommended for development)

- Place `openscad.js` and `openscad.wasm` under `public/openscad/`.
- The browser loads them from the same origin (e.g., Vite dev server).
- Pros: most reliable; no CORS issues. Cons: you host the binaries yourself (not
  an issue in dev).

2. Remote (no redistribution; avoids GPL distribution obligations)

- Pass `?remoteBase=<absolute-url>` to the app. The browser will insert a
  `<script>` tag pointing to `<remoteBase>/openscad.js` and will configure
  `Module.locateFile` so that `<remoteBase>/openscad.wasm` is fetched from the
  same origin.
- Your server does NOT proxy these files; the browser gets them directly from
  the official host.
- Example:
  ```
  http://localhost:5173/?server=http://localhost:8787&entry=main.scad&remoteBase=https://example.com/openscad-wasm/2024-XX
  ```
- Requirements:
  - The remote host must provide CORS headers (`Access-Control-Allow-Origin: *`
    or your origin) and proper `Content-Type: text/javascript` for
    `openscad.js`.
  - `openscad.wasm` must be accessible from the same base URL.
- If remote loading fails, the app falls back to local assets if present.

Notes

- We do NOT include the OpenSCAD WASM binaries in this repository. For local
  development, place them under `public/openscad/`.
- Types: we use minimal Emscripten typings in `frontend/emscripten.d.ts`. No
  official TypeScript types are required from OpenSCAD.

Troubleshooting

- If remote loading fails (blocked by CORS or MIME type), either:
  - Host the files on a static server you control with correct headers, or
  - Use the local method (copy `openscad.js/wasm` into `public/openscad/`).
- Multi-threaded builds require COOP/COEP and extra worker assets; start with
  single-threaded builds.
