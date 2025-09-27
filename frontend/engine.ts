/*
 * OpenSCAD Previewer - Server-side Engine Client
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

export type ServerCompileResult =
  | { ok: true; timeMs: number; stl: Uint8Array; warnings?: string[] }
  | { ok: false; timeMs?: number; errors: string[]; warnings?: string[] };

export interface CompileEvent {
  success: boolean;
  duration: number;
  stlSize: number;
  stdout: string[];
  stderr: string[];
  error?: string;
  timestamp: number;
  trigger?: string;
}

export interface StlEvent {
  resultKey: string;
  size: number;
}

export class ServerOpenScadEngine {
  private serverUrl: string;
  private currentStlData?: Uint8Array;

  constructor(serverUrl: string = "") {
    this.serverUrl = serverUrl;
  }

  init(): Promise<void> {
    // No initialization needed for server-side engine
    return Promise.resolve();
  }

  // This method is called by the old interface but doesn't do actual compilation
  // The compilation is triggered by the SSE events
  compile(_entry: string): ServerCompileResult {
    if (this.currentStlData) {
      return {
        ok: true,
        timeMs: 0, // This will be updated by the SSE events
        stl: this.currentStlData,
      };
    } else {
      return {
        ok: false,
        errors: ["No STL data available yet. Compilation in progress..."],
      };
    }
  }

  async loadStl(resultKey: string): Promise<Uint8Array> {
    const response = await fetch(`${this.serverUrl}/api/stl/${resultKey}`);
    if (!response.ok) {
      throw new Error(`Failed to load STL: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const stlData = new Uint8Array(arrayBuffer);
    this.currentStlData = stlData;
    return stlData;
  }

  getCurrentStl(): Uint8Array | undefined {
    return this.currentStlData;
  }

  // Legacy methods - these are no-ops in server-side mode
  async hydrateScadFiles(
    _listEndpointBase: string,
    _fileEndpointBase: string,
  ): Promise<void> {
    // Files are handled server-side
  }

  async applyChange(
    _kind: "create" | "modify" | "remove",
    _relPath: string,
    _fileEndpointBase: string,
  ): Promise<void> {
    // File changes are handled server-side
  }
}
