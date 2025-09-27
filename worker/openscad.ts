/*
 * OpenSCAD Previewer - Server-side OpenSCAD Wrapper
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * Based on https://github.com/seasick/openscad-web-gui/blob/main/src/worker/openSCAD.ts
 */

import type { EmscriptenModule } from "../frontend/openscad-wasm.d.ts";

export interface CompileRequest {
  entry: string;
  files: Array<{ path: string; content: string }>;
}

export interface CompileResult {
  success: boolean;
  stl?: Uint8Array;
  duration: number;
  stdout: string[];
  stderr: string[];
  error?: string;
}

export class OpenSCADEngine {
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:8000/openscad") {
    this.baseUrl = baseUrl;
  }

  async compile(request: CompileRequest): Promise<CompileResult> {
    const start = Date.now();
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      // Create fresh WASM instance for each compilation
      const instance = await this.createInstance(stdout, stderr);

      // Write all files to WASM filesystem
      this.writeFiles(instance, request.files);

      // Find entry file path
      const entryPath = this.findEntryFile(instance, request.entry);
      if (!entryPath) {
        return {
          success: false,
          duration: Date.now() - start,
          stdout,
          stderr,
          error: `Entry file '${request.entry}' not found`,
        };
      }

      // Compile with OpenSCAD
      const outputFile = "/out/model.stl";
      this.ensureDir(instance, "/out");

      const args = [
        entryPath,
        "-o",
        outputFile,
        "--export-format=binstl",
        "--enable=manifold",
        "--enable=fast-csg",
        "--enable=lazy-union",
      ];

      const exitCode = instance.callMain(args);

      if (exitCode !== 0) {
        return {
          success: false,
          duration: Date.now() - start,
          stdout,
          stderr,
          error: `OpenSCAD exited with code ${exitCode}`,
        };
      }

      // Read STL output
      const stl = instance.FS.readFile(outputFile);

      return {
        success: true,
        stl,
        duration: Date.now() - start,
        stdout,
        stderr,
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - start,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createInstance(
    stdout: string[],
    stderr: string[],
  ): Promise<EmscriptenModule> {
    const jsUrl = `${this.baseUrl.replace(/\/+$/, "")}/openscad.js`;

    try {
      // Dynamic import of OpenSCAD WASM
      const { default: OpenSCAD } = await import(jsUrl);

      if (typeof OpenSCAD !== "function") {
        throw new Error("OpenSCAD default export is not a function");
      }

      // Create fresh instance
      const instance = await OpenSCAD({
        noInitialRun: true,
        print: (...args: string[]) => stdout.push(args.join(" ")),
        printErr: (...args: string[]) => stderr.push(args.join(" ")),
      });

      // Ensure required directories exist
      this.ensureDir(instance, "/workspace");
      this.ensureDir(instance, "/out");

      return instance;
    } catch (error) {
      throw new Error(`Failed to create OpenSCAD instance: ${error}`);
    }
  }

  private writeFiles(
    instance: EmscriptenModule,
    files: Array<{ path: string; content: string }>,
  ) {
    for (const file of files) {
      const wsPath = `/workspace/${file.path}`;
      this.ensureDirsForFile(instance, wsPath);
      instance.FS.writeFile(wsPath, file.content);
    }
  }

  private findEntryFile(
    instance: EmscriptenModule,
    entry: string,
  ): string | null {
    // Try direct paths first
    const candidates = [
      `/workspace/${entry}`,
      `/workspace/examples/${entry}`,
    ];

    for (const candidate of candidates) {
      try {
        instance.FS.stat(candidate);
        return candidate;
      } catch {
        // File doesn't exist, continue
      }
    }

    // Search recursively for files with matching name
    const allScadFiles = this.findAllScadFiles(instance, "/workspace");
    const matchingFiles = allScadFiles.filter((filePath) =>
      filePath.endsWith(`/${entry}`) || filePath === `/workspace/${entry}`
    );

    return matchingFiles.length > 0 ? matchingFiles[0] : null;
  }

  private findAllScadFiles(instance: EmscriptenModule, dir: string): string[] {
    const files: string[] = [];

    try {
      const items = instance.FS.readdir(dir);

      for (const item of items) {
        if (item === "." || item === "..") continue;

        const fullPath = `${dir}/${item}`;

        try {
          const stat = instance.FS.stat(fullPath);

          // Check if it's a directory (size 4096 is typical for directories)
          if (stat.size === 4096 || this.isDirectory(instance, fullPath)) {
            files.push(...this.findAllScadFiles(instance, fullPath));
          } else if (item.endsWith(".scad")) {
            files.push(fullPath);
          }
        } catch {
          // Skip files that can't be stat'd
        }
      }
    } catch {
      // Skip directories that can't be read
    }

    return files;
  }

  private isDirectory(instance: EmscriptenModule, path: string): boolean {
    try {
      instance.FS.readdir(path);
      return true;
    } catch {
      return false;
    }
  }

  private ensureDir(instance: EmscriptenModule, path: string) {
    try {
      instance.FS.mkdir(path);
    } catch {
      // Directory might already exist
    }
  }

  private ensureDirsForFile(instance: EmscriptenModule, filePath: string) {
    const parts = filePath.split("/").slice(0, -1);
    let acc = "";
    for (const part of parts) {
      if (!part) continue;
      acc += `/${part}`;
      this.ensureDir(instance, acc);
    }
  }
}
