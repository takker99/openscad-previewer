# GitHub Copilot Instructions

Please follow `../AGENTS.md` for the full agent playbook tailored to this
repository. Key reminders:

- Keep OpenSCAD WASM assets outside the repo; default to remote download via
  `/openscad/*` proxy or `?remoteBase=...`.
- Use `deno task dev -- ./examples` for local runs and `deno task fix` (fmt +
  lint + check) before proposing changes.
- Maintain the `OpenScadEngine` + `ChangeStream` workflow in `frontend/` and
  keep new frontend code under that directory so the on-demand esbuild bundle
  stays valid.
- Preserve COOP/COEP headers in `server.tsx`; they are required for WebAssembly
  features and should not be removed unintentionally.
- Keep comments and docs in English only, translating legacy snippets when you
  modify a file.
- Write commits using English Conventional Commit messages (`feat:`, `fix:`,
  etc.).
