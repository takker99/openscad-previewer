import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/deno";
import { proxy } from "hono/proxy";
import { renderToString } from "react-dom/server";
import { streamSSE } from "hono/streaming";

type ChangeKind = "create" | "modify" | "remove";

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

// OpenSCAD WASM バージョン取得
async function getOpenSCADVersion(version: string = "latest"): Promise<string> {
  if (version !== "latest") {
    return version;
  }

  try {
    console.log("Fetching latest OpenSCAD WASM release...");
    const response = await fetch(
      "https://api.github.com/repos/openscad/openscad-wasm/releases/latest",
    );
    const data = await response.json();
    const downloadVersion = data.tag_name;
    console.log(`Latest version: ${downloadVersion}`);
    return downloadVersion;
  } catch (error) {
    console.warn("Could not fetch latest version, using fallback", error);
    return "v2023.12.03"; // fallback version
  }
}

const app = new Hono();

app.use("*", logger());

app.use("*", async (c, next) => {
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Embedder-Policy", "require-corp");
  await next();
});

// SSR ルート
app.get("/", (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1] || "");
  const serverUrl = `http://localhost:${PORT}`;
  const entry = params.get("entry") || "main.scad";

  try {
    const appProps = { serverUrl, entry };
    return c.html(renderToString(
      <html>
        <head>
          <meta charSet="utf-8" />
          <title>OpenSCAD WASM Preview</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            {`
      html, body, #app {
        height: 100%;
        margin: 0;
      }
      body {
        background: #0b0b0b;
        color: #e5e5e5;
        font: 13px system-ui, sans-serif;
      }
      header {
        padding: 6px 10px;
        border-bottom: 1px solid #222;
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .ok {
        color: #22c55e;
      }
      .err {
        color: #ef4444;
      }
      .warn {
        color: #f59e0b;
      }
    `}
          </style>
          {import.meta.env.PROD
            ? <script type="module" src="/static/main.js"></script>
            : <script type="module" src="/frontend/main.tsx"></script>}
        </head>
        <body>
          <div id="app">
            <div style="display:flex;flex-direction:column;height:100vh;width:100vw;">
              <header>
                <strong>OpenSCAD Preview</strong>
                <span style="color:#aaa;margin-left:10px">Entry: {entry}</span>
                <span class="warn" style="margin-left:10px">Loading...</span>
              </header>
              <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center;">
                <div style="color:#aaa;">
                  Loading OpenSCAD Preview...
                </div>
              </div>
            </div>
          </div>
          <script
            type="application/json"
            id="app-props"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(appProps) }}
          >
          </script>
        </body>
      </html>,
    ));
  } catch (error) {
    console.error("SSR Error:", error);
    return c.text("Internal Server Error", 500);
  }
});

// OpenSCAD WASM ファイルプロキシ
app.get("/openscad/:path{.+}", async (c) => {
  const tag = await getOpenSCADVersion(OPENSCAD_VERSION);
  const path = c.req.param("path");
  const contentType = path.endsWith(".wasm")
    ? "application/wasm"
    : path.endsWith(".js")
    ? "text/javascript"
    : "application/octet-stream";
  const res = await proxy(
    `https://github.com/openscad/openscad-wasm/releases/download/${tag}/${
      c.req.param("path")
    }`,
    {
      headers: c.req.header(),
    },
  );
  res.headers.delete("Set-Cookie");
  res.headers.set("Content-Type", contentType);
  return res;
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
app.use(
  "/file/*",
  serveStatic({
    root: "./",
    rewriteRequestPath: (path) => path.replace(/^\/file/, ""),
  }),
);

// SSE イベントストリーム (streamSSE使用)
app.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    // 初回に ping を送る
    await stream.writeSSE({
      event: "ping",
      data: JSON.stringify({}),
    });

    // ファイル監視をこのストリーム内で開始
    const debounce = new Map<string, number>();

    try {
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
            setTimeout(async () => {
              try {
                await stream.writeSSE({
                  event: "change",
                  data: JSON.stringify({ path: rel, kind }),
                });
              } catch (error) {
                console.error("Failed to send SSE event:", error);
              }
            }, 30) as unknown as number,
          );
        }
      }
    } catch (error) {
      console.error("File watching error:", error);
    }
  }));

export default app;

function mapKind(k: Deno.FsEvent["kind"]): ChangeKind | null {
  if (k === "create") return "create";
  if (k === "modify") return "modify";
  if (k === "remove") return "remove";
  return null;
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
