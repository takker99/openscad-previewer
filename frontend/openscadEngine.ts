import type { EmscriptenModule } from "./openscad-wasm.d.ts";
import { loadOpenScadFactoryViaScript } from "./loader.ts";

export type CompileResult =
  | { ok: true; timeMs: number; stl: Uint8Array; warnings?: string[] }
  | { ok: false; timeMs?: number; errors: string[]; warnings?: string[] };

type InitOptions = {
  // ローカル配置（server/openscad）のベースURL
  localBaseUrl?: string;
};

export class OpenScadEngine {
  private mod?: EmscriptenModule;
  private stdout: string[] = [];
  private stderr: string[] = [];
  private readyPromise?: Promise<void>;
  private workspace = "/workspace";
  private outdir = "/out";
  private outFile = `${this.outdir}/model.stl`;
  private localBaseUrl: string;

  constructor(opts?: InitOptions) {
    this.localBaseUrl = opts?.localBaseUrl ?? "/openscad";
  }

  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      const jsUrl = `${this.localBaseUrl.replace(/\/+$/, "")}/openscad.js`;
      const wasmUrl = `${this.localBaseUrl.replace(/\/+$/, "")}/openscad.wasm`;

      let factory:
        | ((overrides?: Partial<EmscriptenModule>) => Promise<EmscriptenModule>)
        | null = null;

      try {
        factory = await loadOpenScadFactoryViaScript(jsUrl, wasmUrl);
      } catch (error) {
        throw new Error(`Failed to load OpenSCAD WASM: ${error}`);
      }

      this.mod = await factory({
        print: (...args: string[]) => this.stdout.push(args.join(" ")),
        printErr: (...args: string[]) => this.stderr.push(args.join(" ")),
      });

      // MEMFS 準備
      try {
        this.mod!.FS.mkdir(this.workspace);
      } catch {
        // Directory might already exist
      }
      try {
        this.mod!.FS.mkdir(this.outdir);
      } catch {
        // Directory might already exist
      }
    })();
    return this.readyPromise;
  }

  async hydrateScadFiles(listEndpointBase: string, fileEndpointBase: string) {
    const r = await fetch(`${listEndpointBase}/list?ext=scad`);
    if (!r.ok) throw new Error(await r.text());
    const { files } = await r.json() as { files: { path: string }[] };
    for (const f of files) {
      const u = `${fileEndpointBase}/file?path=${encodeURIComponent(f.path)}`;
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      const wsPath = `/${this.workspace.replace(/^\//, "")}/${f.path}`;
      this.ensureDirs(wsPath);
      this.mod!.FS.writeFile(wsPath, buf);
    }
  }

  async applyChange(
    kind: "create" | "modify" | "remove",
    relPath: string,
    fileEndpointBase: string,
  ) {
    const wsPath = `/${this.workspace.replace(/^\//, "")}/${relPath}`;
    if (kind === "remove") {
      try {
        this.mod!.FS.unlink(wsPath);
      } catch {
        // File might not exist
      }
      return;
    }
    const r = await fetch(
      `${fileEndpointBase}/file?path=${encodeURIComponent(relPath)}`,
      { cache: "no-store" },
    );
    if (!r.ok) return;
    const buf = new Uint8Array(await r.arrayBuffer());
    this.ensureDirs(wsPath);
    this.mod!.FS.writeFile(wsPath, buf);
  }

  compile(entry: string): CompileResult {
    this.stdout = [];
    this.stderr = [];
    const start = performance.now();
    try {
      try {
        this.mod!.FS.unlink(this.outFile);
      } catch {
        // File might not exist
      }
      const entryPath = `${this.workspace}/${entry}`;
      const code = this.mod!.callMain(["-o", this.outFile, entryPath]);
      const timeMs = performance.now() - start;
      const errTxt = this.stderr.join("\n").trim();
      if (code !== 0 || errTxt) {
        if (code !== 0) {
          return {
            ok: false,
            timeMs,
            errors: [errTxt || `OpenSCAD exited with code ${code}`],
          };
        }
      }
      const stl = this.mod!.FS.readFile(this.outFile);
      return {
        ok: true,
        timeMs,
        stl,
        warnings: this.stdout.length ? [this.stdout.join("\n")] : undefined,
      };
    } catch (e: unknown) {
      const timeMs = performance.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      const allErr = [this.stderr.join("\n"), error].filter(Boolean);
      return { ok: false, timeMs, errors: allErr };
    }
  }

  private ensureDirs(path: string) {
    const parts = path.split("/").slice(0, -1);
    let acc = "";
    for (const p of parts) {
      if (!p) continue;
      acc += `/${p}`;
      try {
        this.mod!.FS.mkdir(acc);
      } catch {
        // Directory might already exist
      }
    }
  }
}
