/*
 * OpenSCAD Previewer - Server-side Compiler Service
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

import {
  type CompileRequest,
  WorkerMessageType,
  type WorkerResponse,
} from "../worker/types.ts";

export interface CompileOptions {
  entry: string;
  rootPath: string;
  openscadVersion: string;
}

export interface CompileResult {
  success: boolean;
  stl?: Uint8Array;
  duration: number;
  stdout: string[];
  stderr: string[];
  error?: string;
}

export class OpenSCADCompiler {
  private worker: Worker | null = null;
  private requestCounter = 0;
  private pendingRequests = new Map<string, {
    resolve: (result: CompileResult) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (this.worker) {
      this.worker.terminate();
    }

    this.worker = new Worker(new URL("../worker/worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pendingRequests.get(response.id);

      if (!pending) {
        console.warn(
          `Received response for unknown request ID: ${response.id}`,
        );
        return;
      }

      this.pendingRequests.delete(response.id);

      // Type guard to check if this is a CompileResult
      if ("stl" in response || "duration" in response) {
        const compileResponse = response as CompileResult & { id: string };

        if (compileResponse.success) {
          pending.resolve({
            success: compileResponse.success,
            stl: compileResponse.stl,
            duration: compileResponse.duration,
            stdout: compileResponse.stdout,
            stderr: compileResponse.stderr,
          });
        } else {
          pending.resolve({
            success: false,
            duration: compileResponse.duration || 0,
            stdout: compileResponse.stdout || [],
            stderr: compileResponse.stderr || [],
            error: compileResponse.error,
          });
        }
      } else {
        // Handle FileSystemResult or other response types
        pending.resolve({
          success: response.success,
          duration: 0,
          stdout: [],
          stderr: [],
          error: !response.success ? "Unknown error" : undefined,
        });
      }
    };

    this.worker.onerror = (error) => {
      console.error("Worker error:", error);
      // Reject all pending requests
      for (const [_id, pending] of this.pendingRequests) {
        pending.reject(new Error(`Worker error: ${error.message}`));
      }
      this.pendingRequests.clear();

      // Restart worker
      setTimeout(() => this.initWorker(), 1000);
    };
  }

  async compile(options: CompileOptions): Promise<CompileResult> {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }

    // Read all SCAD files from the root path
    const files = await this.collectScadFiles(options.rootPath);

    const requestId = `compile_${++this.requestCounter}`;

    const request: CompileRequest = {
      type: WorkerMessageType.COMPILE,
      id: requestId,
      entry: options.entry,
      files,
      openscadVersion: options.openscadVersion,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout for compilation
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Compilation timeout"));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.worker!.postMessage(request);
    });
  }

  private async collectScadFiles(
    rootPath: string,
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    try {
      for await (const entry of Deno.readDir(rootPath)) {
        if (entry.isFile && entry.name.endsWith(".scad")) {
          const content = await Deno.readTextFile(`${rootPath}/${entry.name}`);
          files.push({
            path: entry.name,
            content,
          });
        } else if (entry.isDirectory) {
          // Recursively collect files from subdirectories
          const subFiles = await this.collectScadFilesRecursive(
            `${rootPath}/${entry.name}`,
            entry.name,
          );
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${rootPath}:`, error);
    }

    return files;
  }

  private async collectScadFilesRecursive(
    dirPath: string,
    relativePath: string,
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    try {
      for await (const entry of Deno.readDir(dirPath)) {
        const fullPath = `${dirPath}/${entry.name}`;
        const relPath = `${relativePath}/${entry.name}`;

        if (entry.isFile && entry.name.endsWith(".scad")) {
          const content = await Deno.readTextFile(fullPath);
          files.push({
            path: relPath,
            content,
          });
        } else if (entry.isDirectory) {
          const subFiles = await this.collectScadFilesRecursive(
            fullPath,
            relPath,
          );
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${dirPath}:`, error);
    }

    return files;
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      pending.reject(new Error("Compiler terminated"));
    }
    this.pendingRequests.clear();
  }
}
