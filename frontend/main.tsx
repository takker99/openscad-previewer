/** @jsxImportSource preact */
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ChangeStream, type FileChange } from "./changeStream.ts";
import { OpenScadEngine } from "./openscadEngine.ts";
import { StlViewer } from "./stlViewer.ts";

function App() {
  const params = new URLSearchParams(location.search);
  const serverUrl = params.get("server") ?? "http://localhost:8787";
  const entry = params.get("entry") ?? "main.scad";
  // remoteBase を指定したら、ブラウザがそのURLから openscad.js/wasm を直接取得（失敗時はローカルへフォールバック）
  const remoteBaseUrl = params.get("remoteBase") || undefined;

  const statusRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeMs, setTimeMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const engine = useMemo(() =>
    new OpenScadEngine({
      localBaseUrl: "/openscad",
      remoteBaseUrl,
      preferRemote: !!remoteBaseUrl,
    }), [remoteBaseUrl]);

  const viewer = useMemo(() => new StlViewer(), []);

  const compile = () => {
    setError(undefined);
    if (statusRef.current) {
      statusRef.current.className = "warn";
      statusRef.current.textContent = "Compiling...";
    }
    const res = engine.compile(entry);
    if (res.ok) {
      if (statusRef.current) {
        statusRef.current.className = "ok";
        statusRef.current.textContent = "OK";
      }
      setTimeMs(res.timeMs);
      viewer.render(res.stl);
    } else {
      if (statusRef.current) {
        statusRef.current.className = "err";
        statusRef.current.textContent = "Error";
      }
      setTimeMs(res.timeMs);
      viewer.showError(res.errors.join("\n"));
      setError(res.errors.join("\n"));
    }
  };

  useEffect(() => {
    (async () => {
      if (!containerRef.current) return;
      viewer.mount(containerRef.current);
      await engine.init();
      await engine.hydrateScadFiles(serverUrl, serverUrl);
      compile();

      const cs = new ChangeStream(serverUrl);
      const off = cs.onChange(async (ev: FileChange) => {
        if (!/\.(scad)$/i.test(ev.path) && ev.kind !== "remove") return;
        await engine.applyChange(ev.kind, ev.path, serverUrl);
        scheduleRebuild();
      });
      cs.start();

      let t: number | undefined;
      const scheduleRebuild = () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          t = undefined;
          compile();
        }, 80) as unknown as number;
      };

      return () => {
        off();
        cs.stop();
        viewer.unmount();
      };
    })();
  }, [serverUrl, entry, engine]);

  return (
    <div style="display:flex;flex-direction:column;height:100vh;width:100vw;">
      <header>
        <strong>OpenSCAD Preview</strong>
        <span style="color:#aaa;margin-left:10px">Entry: {entry}</span>
        <span ref={statusRef} class="warn" style="margin-left:10px">Idle</span>
        {timeMs !== undefined && (
          <span style="color:#aaa;margin-left:10px">
            {Math.round(timeMs)} ms
          </span>
        )}
      </header>
      <div ref={containerRef} style="flex:1; min-height:0;"></div>
      {error && (
        <pre style="max-height:30vh;overflow:auto;margin:0;padding:8px;border-top:1px solid #222;background:#111;color:#ef4444;">
          {error}
        </pre>
      )}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
