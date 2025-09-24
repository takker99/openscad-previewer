import type { EmscriptenModule } from "./openscad-wasm.d.ts";

// openscad.js を <script> で読み込み、Emscripten Module factory を取得する共通ローダ
// - jsUrl: openscad.js の完全URL（remote or local）
// - wasmUrl: openscad.wasm の完全URL（locateFileで指す）

interface OpenScadModuleOverrides {
  print?: (...args: string[]) => void;
  printErr?: (...args: string[]) => void;
  locateFile?: (path: string) => string;
}

type OpenScadFactory = (
  overrides?: OpenScadModuleOverrides,
) => Promise<EmscriptenModule>;

declare global {
  interface Window {
    Module?: unknown;
    OpenSCAD?: unknown;
    openSCAD?: unknown;
    createOpenSCAD?: unknown;
  }
}

export async function loadOpenScadFactoryViaScript(
  jsUrl: string,
  wasmUrl: string,
): Promise<OpenScadFactory> {
  // Emscriptenの locateFile を事前に指定（グローバル Module または factory 側で参照される）
  (globalThis as { Module?: unknown }).Module = {
    locateFile: (p: string) => {
      if (p.endsWith(".wasm")) return wasmUrl;
      // 他の補助ファイル（worker.jsなど）があればここで分岐
      return p;
    },
  };

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = jsUrl;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = (_e) => reject(new Error(`Failed to load ${jsUrl}`));
    document.head.appendChild(s);
  });

  // 工場関数の候補をいくつか試す（ビルド設定により名前が異なる可能性があるため）
  const candidates = [
    (globalThis as { OpenSCAD?: unknown }).OpenSCAD, // 例: グローバル関数
    (globalThis as { openSCAD?: unknown }).openSCAD, // 小文字パターン
    (globalThis as { Module?: unknown }).Module, // 直接 Module を返すケース
    (globalThis as { createOpenSCAD?: unknown }).createOpenSCAD, // create系
  ].filter(Boolean);

  const factory = candidates.find((x: unknown) => typeof x === "function") ||
    candidates.find((x: unknown) => typeof x === "object");
  if (!factory) {
    throw new Error(
      "OpenSCAD factory not found on window after loading openscad.js",
    );
  }
  // Emscripten MODULARIZE=1 の場合は関数、そうでない場合はオブジェクト。どちらにも対応。
  if (typeof factory === "function") {
    return factory as OpenScadFactory;
  } else {
    // 既に Module オブジェクトがある場合、ファクトリの代わりに固定Moduleを返すラッパを作る
    return (overrides?: OpenScadModuleOverrides) =>
      Promise.resolve(
        Object.assign(factory, overrides ?? {}) as EmscriptenModule,
      );
  }
}
