#!/usr/bin/env -S deno run -A
// Deno 2 以降推奨
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";

type ChangeKind = "create" | "modify" | "remove";
type FileChange = { path: string; kind: ChangeKind };

const ROOT = Deno.args[0] ?? Deno.cwd(); // 監視するプロジェクトルート（WSL内のパス推奨）
const PORT = Number(Deno.env.get("PORT") ?? 8787);

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
const clients = new Set<WritableStreamDefaultWriter<string>>();
app.get("/events", (c) => {
  const stream = new ReadableStream<string>({
    start(controller) {
      const writer = controller as unknown as WritableStreamDefaultWriter<
        string
      >;
      clients.add(writer);
      // 初回に ping を送る
      writer.write("event: ping\ndata: {}\n\n");
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
console.log(`Server on http://localhost:${PORT} watching ${ROOT}`);

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

function broadcast(msg: FileChange) {
  const data = `event: change\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const w of clients) {
    w.write(data).catch(() => {
      clients.delete(w);
    });
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
