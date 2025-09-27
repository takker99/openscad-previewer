/*
 * OpenSCAD Previewer - Server-side Change Stream
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

import type { CompileEvent, StlEvent } from "./serverEngine.ts";

export interface FileChange {
  path: string;
  kind: "create" | "modify" | "remove";
}

export class ServerChangeStream {
  private serverUrl: string;
  private eventSource?: EventSource;
  private onChangeCallback?: (ev: FileChange) => void;
  private onCompileCallback?: (ev: CompileEvent) => void;
  private onStlCallback?: (ev: StlEvent) => void;
  private entry: string;

  constructor(serverUrl: string, entry: string = "main.scad") {
    this.serverUrl = serverUrl;
    this.entry = entry;
  }

  onChange(callback: (ev: FileChange) => void): () => void {
    this.onChangeCallback = callback;
    return () => {
      this.onChangeCallback = undefined;
    };
  }

  onCompile(callback: (ev: CompileEvent) => void): () => void {
    this.onCompileCallback = callback;
    return () => {
      this.onCompileCallback = undefined;
    };
  }

  onStl(callback: (ev: StlEvent) => void): () => void {
    this.onStlCallback = callback;
    return () => {
      this.onStlCallback = undefined;
    };
  }

  start(): void {
    if (this.eventSource) {
      this.stop();
    }

    const url = new URL(`${this.serverUrl}/events`);
    url.searchParams.set("entry", this.entry);

    this.eventSource = new EventSource(url.toString());

    this.eventSource.addEventListener("change", (event) => {
      try {
        const data = JSON.parse(event.data) as FileChange;
        if (this.onChangeCallback) {
          this.onChangeCallback(data);
        }
      } catch (error) {
        console.error("Failed to parse change event:", error);
      }
    });

    this.eventSource.addEventListener("compile", (event) => {
      try {
        const data = JSON.parse(event.data) as CompileEvent;
        if (this.onCompileCallback) {
          this.onCompileCallback(data);
        }
      } catch (error) {
        console.error("Failed to parse compile event:", error);
      }
    });

    this.eventSource.addEventListener("stl", (event) => {
      try {
        const data = JSON.parse(event.data) as StlEvent;
        if (this.onStlCallback) {
          this.onStlCallback(data);
        }
      } catch (error) {
        console.error("Failed to parse STL event:", error);
      }
    });

    this.eventSource.addEventListener("ping", (_event) => {
      console.log("Server ping received");
    });

    this.eventSource.addEventListener("error", (event) => {
      console.error("SSE error", event);
    });
  }

  stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
  }
}
