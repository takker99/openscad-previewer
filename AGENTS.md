# openscad-previewer Agent Guide

## Mission

- Deliver instant STL previews for OpenSCAD sources via Deno server + React 3D
  viewer.
- Keep GPL-sensitive OpenSCAD WASM binaries outside the repo; default to remote
  fetches.

## System overview

- `server.tsx` (Deno + Hono) exposes `/list` + `/file` APIs, `/events` SSE, and
  on-the-fly esbuild bundling for `frontend/main.tsx` served as `/main.js`.
- CLI: `deno run -A server.tsx [root] [--version vYYYY.MM.DD]`; root defaults to
  cwd and becomes the watched tree mirrored into MEMFS.
- `/openscad/*` proxies GitHub releases using the supplied `--version` (or
  latest tag lookup). COOP/COEP headers ship by default—leave them in place for
  future threaded WASM.
- SSR shell renders `#app` and embeds `{entry}` so the client hydrates before
  React mounts.

## Frontend pipeline

- `frontend/main.tsx` resolves `entry` from SSR props or `?entry=...`, creates a
  React root, and renders `App`.
- `App.tsx` wires `OpenScadEngine` + `ChangeStream`: `init()` →
  `hydrateScadFiles(serverUrl, serverUrl)` → watch `/events`, debounce 80 ms,
  and rerun `compile()`.
- `OpenScadEngine` dynamically imports `${baseUrl}/openscad.js`, syncs
  `/workspace` in MEMFS, normalizes entry paths via `findAllScadFiles`, and
  reads `/out/model.stl`.
- `StlCanvas.tsx` displays STL buffers with `@react-three/fiber` +
  `@react-three/drei`; camera fitting happens inside `StlMesh`.

## Developer workflows

- Local dev: `deno task dev -- ./examples` (or omit path for cwd). Open
  `http://localhost:8000/?entry=main.scad` and optionally add `remoteBase=` when
  pointing at an external WASM host.
- Remote asset mode falls back to local `/openscad` proxy if `remoteBase` fails;
  keep both code paths working when adjusting loaders.
- Quality gate: `deno task fix` runs fmt + lint + `deno check`. No separate Node
  build—the server’s esbuild plugin outputs ESM on each request.

## Conventions & gotchas

- Treat `/openscad` as fetch-only; never commit binaries unless licensing is
  cleared.
- `ChangeStream` only forwards `.scad` updates—extend both server filter +
  client guard before supporting new extensions.
- Errors bubble through `App`’s `error` state and render over the canvas;
  maintain `statusRef` text (`Idle` → `Compiling...` → `OK/Error`).
- Add new frontend modules under `frontend/` so the single esbuild entry stays
  valid; update `server.tsx` if you introduce extra bundles or routes.
- Write code comments and documentation in English only; translate any existing
  non-English notes when you touch the file.
- When committing, use Conventional Commits in English (e.g., `feat:`, `fix:`)
  so the history stays consistent.
