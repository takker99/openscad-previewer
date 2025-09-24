# openscad-previewer (Local server + Frontend)

目的

- VS Codeで編集中の `.scad` を、OpenSCAD WASM
  を用いてブラウザ上で即時プレビュー（ホットリロード）する軽量な開発環境を提供する。

非目標

- VS Code WebView 実装は行わない（現計画/将来とも対象外）。
- `openscad-web-gui`
  のコードは流用・参照しない（READMEに「参考にした」旨は記載可）。

アーキテクチャ概要

- サーバ（Deno + Hono）
  - 任意ディレクトリ（WSL含む）を監視。
  - SSE `/events` で変更通知、HTTP `/list?ext=scad` と `/file?path=...`
    でファイル提供。
  - 重要: サーバは OpenSCAD WASM（openscad.js /
    openscad.wasm）を配布・プロキシしない。
- フロント（React + react-three-fiber）
  - OpenSCAD WASM
    は「ブラウザが外部の公式配布元（またはユーザ指定のホスト）から直接ロード」する。
    - 方式: `<script>` 注入 + `Module.locateFile` を用いて `openscad.js` と
      `openscad.wasm` を同一リモートオリジンから取得。
    - クエリ `remoteBase` を指定できる（例:
      `?remoteBase=https://example.com/openscad/wasm-YYYYMMDD`）。
    - CORS と `Content-Type: text/javascript` が正しく設定されたホストが必要。
  - 初回に `.scad` を MEMFS `/workspace` に同期、変更時は差分反映。
  - `callMain(["-o", "/out/model.stl", "/workspace/<entry>"])` で STL
    生成して描画。
  - STL ビューアは react-three-fiber + @react-three/drei 実装（CameraControls、Grid、GizmoHelper等）。

WASM ロード方針

- デフォルト: リモート直接ロード（remoteBase 指定）。
  - あなた（このリポジトリ/サーバ）は WASM を再配布しないため、GPL
    配布義務は発生しない。
- フォールバック（任意・主に開発時）:
  - `public/openscad/` に `openscad.js/openscad.wasm`
    を手動配置して同一オリジンから読み込むことも可。
  - ただし「あなたが配布する成果物」に同梱/ホスティングする場合は、同梱部分について
    GPL の配布要件に従う必要がある。
- 型定義:
  - OpenSCAD WASM が提供する公式の `.d.ts` を開発時に使用する。
  - 実装では JS/WASM を配布せず、型のみ dev 用に取得・同梱（もしくは
    devDependency
    として参照）。型ファイルには上流の著作権/ライセンスヘッダを保持する。

ディレクトリ構成（想定）

- server.ts … Deno + Hono のローカルサーバ（SSE + ファイル配信、WASM非配布）
- public/
- index.html
- （任意）openscad/ … 開発時のローカル配置用（WASMは配布対象外）
  - openscad.js
  - openscad.wasm
- frontend/
  - changeStream.ts … SSE クライアント
  - loader.ts … openscad.js を `<script>` でロードし factory を得るローダ
  - openscadEngine.ts … MEMFS 同期 + `callMain` 実行
  - openscad-wasm.d.ts（上流の d.ts を配置して参照）
  - StlCanvas.tsx … react-three-fiber による STL ビューア
  - main.tsx … React エントリ
- vite.config.ts, tsconfig.json … Vite/TS 設定

起動（開発）

1. サーバ起動
   - deno run -A server.ts /path/to/your/scad/project

2. フロント起動（Vite）
   - cd frontend
   - npm run dev
   - ブラウザで:
     - リモートWASM:
       http://localhost:5173/?server=http://localhost:8787&entry=main.scad&remoteBase=https://<your-wasm-host>
     - ローカルWASM（任意）:
       http://localhost:5173/?server=http://localhost:8787&entry=main.scad

3. 動作
   - 初回に /list?ext=scad で .scad 一覧を取得 → MEMFS に同期。
   - SSE で変更通知を受信 → 変更ファイルのみ MEMFS を更新 → entry を再ビルド →
     STL 描画。

ライセンス方針

- このリポジトリのコードは MIT で配布。
- OpenSCAD WASM は「リモート直接ロード」を基本とし、当方は再配布しない。
- 開発時に型定義（.d.ts）は dev
  用に取得・同梱可（上流のライセンス表記を保持）。JS/WASM
  の同梱/配布は行わない。

開発タスク（エージェント向け、優先度順）

1. Vite + Preact のセットアップ
   - frontend に Vite 初期化、`@preact/preset-vite` 導入、`package.json` と
     `vite.config.ts` 作成。
   - `index.html` と `frontend/main.tsx` を Vite で動く形に（`public/main.js`
     のプレースホルダは廃止）。
2. OpenSCAD WASM ローダ実装（リモート優先）
   - `loader.ts` を実装: `<script>` 注入 + `Module.locateFile` により
     `openscad.js/wasm` を `remoteBase` から取得。
   - `openscadEngine.ts` から `loader.ts` を用い、初期化・MEMFS 同期・`callMain`
     を配線。
   - フォールバック（任意）: `public/openscad/`
     に存在すればローカルからも読み込めるようにする。
3. 型定義（公式 d.ts）の導入
   - 上流配布の `.d.ts` を `frontend/openscad-wasm.d.ts`
     として追加（ライセンス/著作権表記を保持）。
   - tsconfig の `typeRoots` または `include` で参照。自前の最小 d.ts
     は置換する。
4. STL ビューア（react-three-fiber）実装
   - `StlCanvas.tsx` を react-three-fiber
     実装に置換（CameraControls、Grid、GizmoHelper、Environment等）。
5. ドキュメント/開発体験
   - `README.md` に remoteBase の使い方、CORS/MIME
     の要件、ローカルフォールバック手順、WSL 注意点を追記。
   - `.vscode/tasks.json` でサーバと Vite を同時起動（任意）。
6. サーバ改善（任意）
   - CLI フラグ `--port`, `--root`, `--allow-origin`, `--exts`、COOP/COEP
     ON/OFF（将来のMT対応）。
7. テスト
   - 外部 or `examples/` に SCAD プロジェクト（`main.scad` +
     `lib/*.scad`）を用意。
   - 初期表示、保存→再描画（~500ms目安）、削除/リネーム時の耐性とUIエラー表示を確認。

受け入れ基準（MVP）

- 指定ディレクトリの `main.scad`（相対 include/use あり）を初回同期 → STL 表示。
- 保存で自動再描画（モデル規模に依存、デバウンス可）。
- 重大エラーはUI表示、SSE切断時は再接続（開発中は手動リロードでも可）。
- WASM はリモート直接ロードで動作（CORS/MIME
  の整ったホストを前提）。ローカル配置は開発時の任意フォールバック。

ガイドライン

- 小さく進める：各ステップで「実行→確認→コミット」。
- コミットメッセージは `feat:`, `fix:`, `docs:`, `chore:` 等で明確に。
- 参照禁止：`openscad-web-gui` のコードはコピー/参照しない（概念の参考のみ）。
- 依存追加は理由を記録し、`README.md` に反映。
