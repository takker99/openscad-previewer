/*
 * OpenSCAD Previewer - Main React Application Component
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const [isClient, setIsClient] = useState(false);

  const engine = useMemo(() => new OpenScadEngine(), []);

  // Detect client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

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
      console.error("OpenSCAD Error:", res.errors);
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
      }}
    >
      <header>
        <strong>OpenSCAD Preview</strong>
        <span style={{ color: "#aaa", marginLeft: "10px" }}>
          Entry: {entry}
        </span>
        <span ref={statusRef} className="warn" style={{ marginLeft: "10px" }}>
          Idle
        </span>
        {timeMs !== undefined && (
          <span style={{ color: "#aaa", marginLeft: "10px" }}>
            {Math.round(timeMs)} ms
          </span>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        {isClient
          ? (
            <React.Suspense
              fallback={
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#1a1a1a",
                    color: "#aaa",
                  }}
                >
                  Loading 3D Viewer...
                </div>
              }
            >
              <StlCanvas stlData={stlData} error={error} />
            </React.Suspense>
          )
          : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#1a1a1a",
                color: "#aaa",
              }}
            >
              Loading OpenSCAD Preview...
            </div>
          )}
      </div>
    </div>
  );
}
