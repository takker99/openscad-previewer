/*
 * OpenSCAD Previewer - Server-side App Component
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ServerChangeStream } from "./serverChangeStream.ts";
import {
  type CompileEvent,
  ServerOpenScadEngine,
  type StlEvent,
} from "./serverEngine.ts";
import { StlCanvas } from "./StlCanvas.tsx";

interface ServerAppProps {
  entry: string;
}

const serverUrl = new URL(location.pathname, location.href).href.slice(0, -1);

export function ServerApp({ entry }: ServerAppProps) {
  const statusRef = useRef<HTMLSpanElement>(null);
  const [timeMs, setTimeMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [stlData, setStlData] = useState<Uint8Array | undefined>(undefined);
  const [isClient, setIsClient] = useState(false);
  const [compilationLog, setCompilationLog] = useState<string[]>([]);

  const engine = useMemo(() => new ServerOpenScadEngine(serverUrl), []);

  // Detect client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  const updateStatus = (
    status: "idle" | "compiling" | "ok" | "error",
    text: string,
  ) => {
    if (statusRef.current) {
      statusRef.current.className = status === "idle" ? "warn" : status;
      statusRef.current.textContent = text;
    }
  };

  useEffect(() => {
    (async () => {
      await engine.init();
      updateStatus("compiling", "Compiling...");

      const cs = new ServerChangeStream(serverUrl, entry);

      // Handle file changes
      const offChange = cs.onChange((ev) => {
        console.log(`File ${ev.kind}: ${ev.path}`);
        setCompilationLog((prev) => [...prev, `File ${ev.kind}: ${ev.path}`]);
      });

      // Handle compilation results
      const offCompile = cs.onCompile((ev: CompileEvent) => {
        console.log(
          `Compilation ${
            ev.success ? "succeeded" : "failed"
          } in ${ev.duration}ms`,
          ev,
        );

        setTimeMs(ev.duration);

        // Update log
        const logEntries: string[] = [];
        if (ev.trigger) {
          logEntries.push(ev.trigger);
        }
        logEntries.push(
          `Compilation ${
            ev.success ? "succeeded" : "failed"
          } in ${ev.duration}ms`,
        );
        if (ev.stdout.length > 0) {
          logEntries.push(...ev.stdout);
        }
        if (ev.stderr.length > 0) {
          logEntries.push(...ev.stderr);
        }

        setCompilationLog((prev) => [...prev, ...logEntries]);

        if (ev.success) {
          updateStatus("ok", "OK");
          setError(undefined);
          if (ev.stlSize > 0) {
            console.log(`STL generated: ${ev.stlSize} bytes`);
          }
        } else {
          updateStatus("error", "Error");
          setError(ev.error || "Compilation failed");
          setStlData(undefined);
        }
      });

      // Handle STL data
      const offStl = cs.onStl(async (ev: StlEvent) => {
        console.log(`Loading STL: ${ev.resultKey} (${ev.size} bytes)`);

        try {
          const stl = await engine.loadStl(ev.resultKey);
          setStlData(stl);
          console.log(`STL loaded successfully: ${stl.length} bytes`);
        } catch (error) {
          console.error("Failed to load STL:", error);
          setError(`Failed to load STL: ${error}`);
        }
      });

      cs.start();

      return () => {
        offChange();
        offCompile();
        offStl();
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
        <strong>OpenSCAD Preview (Server)</strong>
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
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
        <div
          style={{
            width: "300px",
            background: "#1e1e1e",
            borderLeft: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px",
              borderBottom: "1px solid #333",
              fontWeight: "bold",
            }}
          >
            Compilation Log
          </div>
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "10px",
              fontSize: "12px",
              fontFamily: "monospace",
              lineHeight: "1.4",
            }}
          >
            {compilationLog.map((line, index) => (
              <div
                key={index}
                style={{
                  marginBottom: "2px",
                  color: line.includes("failed")
                    ? "#ff6b6b"
                    : line.includes("succeeded")
                    ? "#51cf66"
                    : line.includes("File")
                    ? "#74c0fc"
                    : "#aaa",
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
