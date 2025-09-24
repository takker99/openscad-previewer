import { useEffect, useMemo, useRef, useState } from "react";
import { ChangeStream, type FileChange } from "./changeStream.ts";
import { OpenScadEngine } from "./openscadEngine.ts";
import { StlCanvas } from "./StlCanvas.tsx";

interface AppProps {
  entry: string;
}

const serverUrl = new URL(location.pathname, location.href).href.slice(0, -1);

export function App({ entry }: AppProps) {
  const statusRef = useRef<HTMLSpanElement>(null);
  const [timeMs, setTimeMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [stlData, setStlData] = useState<Uint8Array | undefined>(undefined);

  const engine = useMemo(() => new OpenScadEngine(), []);

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
      setStlData(res.stl);
      setError(undefined);
    } else {
      if (statusRef.current) {
        statusRef.current.className = "err";
        statusRef.current.textContent = "Error";
      }
      setTimeMs(res.timeMs);
      setError(res.errors.join("\n"));
      setStlData(undefined);
    }
  };

  useEffect(() => {
    (async () => {
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
      };
    })();
  }, [serverUrl, entry, engine]);

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100vh", width: "100vw"}}>
      <header>
        <strong>OpenSCAD Preview</strong>
        <span style={{color: "#aaa", marginLeft: "10px"}}>Entry: {entry}</span>
        <span ref={statusRef} className="warn" style={{marginLeft: "10px"}}>Idle</span>
        {timeMs !== undefined && (
          <span style={{color: "#aaa", marginLeft: "10px"}}>
            {Math.round(timeMs)} ms
          </span>
        )}
      </header>
      <div style={{flex: 1, minHeight: 0}}>
        <StlCanvas stlData={stlData} error={error} />
      </div>
    </div>
  );
}
