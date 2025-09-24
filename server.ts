#!/usr/bin/env -S deno run -A
// Deno 2 以降推奨
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";

type ChangeKind = "create" | "modify" | "remove";
type FileChange = { path: string; kind: ChangeKind };

// CLI引数の解析
function parseArgs() {
  const args = Deno.args;
  let root = Deno.cwd();
  let version = "latest";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--version" || arg === "-v") {
      version = args[++i] || "latest";
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: deno run -A server.ts [directory] [options]

Arguments:
  [directory]     Directory to watch (default: current directory)

Options:
  --version, -v   OpenSCAD WASM version to download (default: latest)
  --help, -h      Show this help message

Examples:
  deno run -A server.ts
  deno run -A server.ts ./examples
  deno run -A server.ts ./examples --version v2023.12.03
      `);
      Deno.exit(0);
    } else if (!arg.startsWith("--")) {
      root = arg;
    }
  }

  return { root, version };
}

const { root: ROOT, version: OPENSCAD_VERSION } = parseArgs();
const PORT = Number(Deno.env.get("PORT") ?? 8787);

// OpenSCAD WASM ダウンロード機能
async function downloadOpenSCADWASM(version: string = "latest") {
  const publicDir = "./public/openscad";

  try {
    await Deno.mkdir(publicDir, { recursive: true });
  } catch {
    // Directory already exists
  }

  let downloadVersion = version;
  if (version === "latest") {
    try {
      console.log("Fetching latest OpenSCAD WASM release...");
      const response = await fetch(
        "https://api.github.com/repos/openscad/openscad/releases/latest",
      );
      const data = await response.json();
      downloadVersion = data.tag_name;
      console.log(`Latest version: ${downloadVersion}`);
    } catch (error) {
      console.warn("Could not fetch latest version, using fallback", error);
      downloadVersion = "v2023.12.03"; // fallback version
    }
  }

  const baseUrl =
    `https://github.com/openscad/openscad/releases/download/${downloadVersion}`;
  const files = [
    { name: "openscad.js", url: `${baseUrl}/openscad.js` },
    { name: "openscad.wasm", url: `${baseUrl}/openscad.wasm` },
  ];

  console.log(`Downloading OpenSCAD WASM ${downloadVersion}...`);

  for (const file of files) {
    const filePath = `${publicDir}/${file.name}`;

    // Check if file already exists
    try {
      await Deno.stat(filePath);
      console.log(`${file.name} already exists, skipping download`);
      continue;
    } catch {
      // File doesn't exist, proceed with download
    }

    try {
      console.log(`Downloading ${file.name}...`);
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();
      await Deno.writeFile(filePath, new Uint8Array(data));
      console.log(`✓ Downloaded ${file.name} (${data.byteLength} bytes)`);
    } catch (error) {
      console.error(`Failed to download ${file.name}:`, error);
      // Create a placeholder file to prevent repeated failures
      await Deno.writeTextFile(
        filePath,
        `// Placeholder for ${file.name} - download failed\n`,
      );
    }
  }
}

const app = new Hono();

// 必要に応じて許可オリジンを絞る
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
    ],
  }),
);

// COOP/COEP（WASMマルチスレッドを将来使うときは有効化を検討）
app.use("*", async (_c, next) => {
  // c.header("Cross-Origin-Opener-Policy", "same-origin");
  // c.header("Cross-Origin-Embedder-Policy", "require-corp");
  await next();
});

// 静的ファイル（フロント配信用・任意）
app.get("/", (c) => c.redirect("/public/index.html"));
app.get("/public/*", async (c) => {
  const rel = c.req.path.replace(/^\/public\//, "");
  const filePath = new URL(`../frontend/public/${rel}`, import.meta.url);
  try {
    const f = await Deno.open(filePath);
    return new Response(f.readable);
  } catch {
    return c.notFound();
  }
});

// OpenSCAD WASM ファイル配信
app.get("/openscad/*", async (c) => {
  const filename = c.req.path.replace(/^\/openscad\//, "");
  const filePath = `./public/openscad/${filename}`;

  try {
    const data = await Deno.readFile(filePath);
    const headers = new Headers();

    if (filename.endsWith(".js")) {
      headers.set("Content-Type", "text/javascript");
    } else if (filename.endsWith(".wasm")) {
      headers.set("Content-Type", "application/wasm");
    } else {
      headers.set("Content-Type", "application/octet-stream");
    }

    return new Response(data, { headers });
  } catch (e) {
    return c.text(`OpenSCAD file not found: ${String(e)}`, 404);
  }
});

// ファイル一覧（初期同期用）
app.get("/list", async (c) => {
  const extFilter = (c.req.query("ext") ?? "").split(",").map((s) =>
    s.trim().toLowerCase()
  ).filter(Boolean);
  const results: { path: string; size: number; mtime: number }[] = [];
  for await (const entry of walk(ROOT)) {
    if (!entry.isFile) continue;
    const rel = entry.path.substring(ROOT.length + 1).replaceAll("\\", "/");
    if (extFilter.length) {
      const ext = rel.split(".").pop()?.toLowerCase();
      if (!ext || !extFilter.includes(ext)) continue;
    }
    const stat = await Deno.stat(entry.path);
    results.push({
      path: rel,
      size: stat.size,
      mtime: stat.mtime?.getTime() ?? 0,
    });
  }
  return c.json({ root: ROOT, files: results });
});

// 単一ファイル取得（テキスト/バイナリ両対応）
app.get("/file", async (c) => {
  const rel = c.req.query("path");
  if (!rel) return c.text("Missing path", 400);
  const fsPath = normalizeJoin(ROOT, rel);
  try {
    const data = await Deno.readFile(fsPath);
    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    return new Response(data, { headers });
  } catch (e) {
    return c.text(String(e), 404);
  }
});

// SSE イベントストリーム
const clients = new Set<ReadableStreamDefaultController<string>>();
app.get("/events", (c) => {
  const stream = new ReadableStream<string>({
    start(controller) {
      clients.add(controller);
      // 初回に ping を送る
      controller.enqueue("event: ping\ndata: {}\n\n");
    },
    cancel() {
      // no-op
    },
  });
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  return c.body(stream as unknown as ReadableStream);
});

// サーバ起動とファイル監視
console.log(`Server starting on http://localhost:${PORT} watching ${ROOT}`);

// OpenSCAD WASM をダウンロードしてからサーバを起動
(async () => {
  await downloadOpenSCADWASM(OPENSCAD_VERSION);

  console.log(`✓ Server ready on http://localhost:${PORT}`);

  // ファイル監視を非同期で開始
  (async () => {
    const debounce = new Map<string, number>();
    for await (const ev of Deno.watchFs(ROOT, { recursive: true })) {
      const kind = mapKind(ev.kind);
      if (!kind) continue;
      for (const p of ev.paths) {
        const rel = p.startsWith(ROOT)
          ? p.substring(ROOT.length + 1).replaceAll("\\", "/")
          : p;
        const key = `${kind}:${rel}`;
        clearTimeout(debounce.get(key));
        debounce.set(
          key,
          setTimeout(() => {
            broadcast({ path: rel, kind });
          }, 30) as unknown as number,
        );
      }
    }
  })();

  // サーバを起動
  Deno.serve({ port: PORT }, app.fetch);
})();

function broadcast(msg: FileChange) {
  const data = `event: change\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const controller of clients) {
    try {
      controller.enqueue(data);
    } catch {
      clients.delete(controller);
    }
  }
}

function mapKind(k: Deno.FsEvent["kind"]): ChangeKind | null {
  if (k === "create") return "create";
  if (k === "modify") return "modify";
  if (k === "remove") return "remove";
  return null;
}

function normalizeJoin(root: string, rel: string) {
  const u = new URL(
    `file://${root.replaceAll("\\", "/").replace(/\/+$/, "")}/${
      rel.replace(/^\/+/, "")
    }`,
  );
  return u.pathname;
}

async function* walk(
  dir: string,
): AsyncGenerator<
  Deno.DirEntry & { path: string; isFile: boolean; isDirectory: boolean }
> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    const isFile = entry.isFile;
    const isDirectory = entry.isDirectory;
    yield Object.assign(entry, { path, isFile, isDirectory });
    if (isDirectory) {
      yield* walk(path);
    }
  }
}
