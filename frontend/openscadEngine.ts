import type { EmscriptenModule } from "./openscad-wasm.d.ts";

export type CompileResult =
  | { ok: true; timeMs: number; stl: Uint8Array; warnings?: string[] }
  | { ok: false; timeMs?: number; errors: string[]; warnings?: string[] };

type InitOptions = {
  // ローカル配置（server/openscad）のベースURL またはリモートURL
  baseUrl?: string;
};

export class OpenScadEngine {
  private mod?: EmscriptenModule;
  private stdout: string[] = [];
  private stderr: string[] = [];
  private readyPromise?: Promise<void>;
  private workspace = "/workspace";
  private outdir = "/out";
  private outFile = `${this.outdir}/model.stl`;
  private baseUrl: string;
  private moduleCorrupted = false;
  private rehydrationData?: { listEndpointBase: string; fileEndpointBase: string };

  constructor(opts?: InitOptions) {
    this.baseUrl = opts?.baseUrl ?? "/openscad";
  }

  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      const jsUrl = `${this.baseUrl.replace(/\/+$/, "")}/openscad.js`;

      try {
        // ES6モジュールとして動的にインポート
        const { default: OpenSCAD } = await import(jsUrl);

        if (typeof OpenSCAD !== "function") {
          throw new Error("OpenSCAD default export is not a function");
        }

        // OpenSCAD WASM インスタンスを初期化
        this.mod = await OpenSCAD({
          noInitialRun: true,
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
      } catch (error) {
        throw new Error(`Failed to load OpenSCAD WASM: ${error}`);
      }
    })();
    return this.readyPromise;
  }

  async hydrateScadFiles(listEndpointBase: string, fileEndpointBase: string) {
    // Store rehydration data for potential module recovery
    this.rehydrationData = { listEndpointBase, fileEndpointBase };
    
    const r = await fetch(`${listEndpointBase}/list?ext=scad`);
    if (!r.ok) throw new Error(await r.text());
    const { files } = await r.json() as { files: { path: string }[] };
    console.log(`Hydrating ${files.length} SCAD files:`, files);

    for (const f of files) {
      const u = `${fileEndpointBase}/file/${f.path}`;
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) {
        console.log(`Failed to fetch ${f.path}:`, res.status, res.statusText);
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const wsPath = `/${this.workspace.replace(/^\//, "")}/${f.path}`;
      console.log(`Writing file: ${f.path} -> ${wsPath} (${buf.length} bytes)`);
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
    console.log(`Applying change: ${kind} ${relPath} -> ${wsPath}`);

    if (kind === "remove") {
      try {
        this.mod!.FS.unlink(wsPath);
        console.log(`Removed file: ${wsPath}`);
      } catch {
        // File might not exist
        console.log(`Failed to remove file (might not exist): ${wsPath}`);
      }
      return;
    }
    const r = await fetch(
      `${fileEndpointBase}/file/${relPath}`,
      { cache: "no-store" },
    );
    if (!r.ok) {
      console.log(`Failed to fetch ${relPath}:`, r.status, r.statusText);
      return;
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    this.ensureDirs(wsPath);
    this.mod!.FS.writeFile(wsPath, buf);
    console.log(
      `Applied change: ${kind} ${relPath} -> ${wsPath} (${buf.length} bytes)`,
    );
  }

  compile(entry: string): CompileResult {
    // Check if module is corrupted and needs reinitialization
    if (this.moduleCorrupted) {
      return {
        ok: false,
        timeMs: 0,
        errors: ['OpenSCAD WASM module is recovering. Please wait a moment and try again.'],
      };
    }
    
    this.stdout = [];
    this.stderr = [];
    const start = performance.now();
    try {
      try {
        this.mod!.FS.unlink(this.outFile);
      } catch {
        // File might not exist
      }

      // DEBUG: FS内のファイル構造をコンソールに出力 (commented out for production)
      // this.debugFS();

      // エントリファイルの実際のパスを探す
      const entryPath = this.findEntryFile(entry);
      if (!entryPath) {
        return {
          ok: false,
          timeMs: performance.now() - start,
          errors: [`Entry file '${entry}' not found in workspace`],
        };
      }

      console.log(`Attempting to compile: ${entryPath}`);
      
      // Clear any previous error state
      this.stdout = [];
      this.stderr = [];
      
      const callStart = performance.now();
      const code = this.mod!.callMain([
        entryPath,
        "--enable=manifold",
        "-o",
        this.outFile,
      ]);
      const callTime = performance.now() - callStart;
      console.log(`OpenSCAD compilation completed in ${callTime}ms with code: ${code}`);
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
      
      // Check if output file exists
      try {
        const stl = this.mod!.FS.readFile(this.outFile);
        console.log(`Successfully generated STL: ${stl.length} bytes`);
        return {
          ok: true,
          timeMs,
          stl,
          warnings: this.stdout.length ? [this.stdout.join("\n")] : undefined,
        };
      } catch (fileError) {
        console.error(`Failed to read output file ${this.outFile}:`, fileError);
        return {
          ok: false,
          timeMs,
          errors: [`Failed to read output file: ${fileError}`],
        };
      }
    } catch (e: unknown) {
      const timeMs = performance.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      const allErr = [this.stderr.join("\n"), error].filter(Boolean);
      
      // Check if this is a numeric WASM exception (memory corruption)
      const numericError = /^\d+$/.test(error);
      if (numericError) {
        console.warn(`OpenSCAD WASM module requires reinitialization after hot reload. Recovering...`);
        this.moduleCorrupted = true;
        
        // Schedule async reinitialization
        setTimeout(async () => {
          try {
            await this.reinitializeModule();
            console.log('OpenSCAD WASM module recovered successfully');
          } catch (reinitError) {
            console.error('Failed to recover WASM module:', reinitError);
            this.moduleCorrupted = true; // Keep it marked as corrupted
          }
        }, 100);
        
        return { 
          ok: false, 
          timeMs, 
          errors: [`OpenSCAD WASM module is recovering from hot reload. Please wait a moment and try again.`] 
        };
      }
      
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

  private findEntryFile(entry: string): string | null {
    if (!this.mod) return null;

    // 候補パスを生成
    const candidates = [
      `${this.workspace}/${entry}`, // 直接指定（例: /workspace/main.scad）
      `${this.workspace}/examples/${entry}`, // examples配下（例: /workspace/examples/main.scad）
    ];

    // FS内のすべての.scadファイルを再帰的に検索
    const allScadFiles = this.findAllScadFiles(this.workspace);

    // エントリファイル名（例: main.scad）と一致するファイルを探す
    const matchingFiles = allScadFiles.filter((filePath) =>
      filePath.endsWith(`/${entry}`) ||
      filePath === `${this.workspace}/${entry}`
    );

    console.log(`Looking for entry file '${entry}':`, {
      candidates,
      allScadFiles,
      matchingFiles,
    });

    // 最初に見つかったマッチするファイルを返す
    if (matchingFiles.length > 0) {
      return matchingFiles[0];
    }

    // 候補パスの中で存在するものを返す
    for (const candidate of candidates) {
      try {
        this.mod.FS.stat(candidate);
        return candidate;
      } catch {
        // ファイルが存在しない
      }
    }

    return null;
  }

  private findAllScadFiles(dir: string): string[] {
    if (!this.mod) return [];

    const files: string[] = [];

    try {
      const items = this.mod.FS.readdir(dir);

      for (const item of items) {
        if (item === "." || item === "..") continue;

        const fullPath = `${dir}/${item}`;

        try {
          const stat = this.mod.FS.stat(fullPath);

          // ディレクトリの場合は再帰的に探索
          if (stat.size === 4096) { // ディレクトリのサイズは通常4096
            files.push(...this.findAllScadFiles(fullPath));
          } // .scadファイルの場合はリストに追加
          else if (item.endsWith(".scad")) {
            files.push(fullPath);
          }
        } catch {
          // stat エラーの場合はスキップ
        }
      }
    } catch {
      // readdir エラーの場合はスキップ
    }

    return files;
  }

  private async reinitializeModule() {
    console.log('Recovering OpenSCAD WASM module...');
    
    // Clear the current module and ready promise
    this.mod = undefined;
    this.readyPromise = undefined;
    this.moduleCorrupted = false;
    
    // Reinitialize the module
    await this.init();
    
    // Re-hydrate all files if we have the data
    if (this.rehydrationData) {
      await this.hydrateScadFiles(
        this.rehydrationData.listEndpointBase,
        this.rehydrationData.fileEndpointBase
      );
    }
    
    console.log('OpenSCAD WASM module recovered successfully');
  }

  private debugFS() {
    if (!this.mod) {
      console.log("FS Debug: Module not initialized");
      return;
    }

    console.log("=== FS Debug ===");

    // ルートディレクトリの内容を確認
    try {
      const rootFiles = this.mod.FS.readdir("/");
      console.log("Root directory contents:", rootFiles);
    } catch (e) {
      console.log("Error reading root directory:", e);
    }

    // workspaceディレクトリの内容を確認
    try {
      const workspaceFiles = this.mod.FS.readdir(this.workspace);
      console.log(`${this.workspace} directory contents:`, workspaceFiles);

      // 各ファイルの詳細情報を確認
      for (const file of workspaceFiles) {
        if (file === "." || file === "..") continue;
        const filePath = `${this.workspace}/${file}`;
        try {
          const stat = this.mod.FS.stat(filePath);
          console.log(`File: ${filePath}, Size: ${stat.size} bytes`);
        } catch (e) {
          console.log(`Error reading ${filePath}:`, e);
        }
      }
    } catch (e) {
      console.log(`Error reading ${this.workspace} directory:`, e);
    }

    console.log("=== End FS Debug ===");
  }
}
