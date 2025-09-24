/*
 * OpenSCAD WASM Type Definitions
 * Based on Emscripten Module interface for OpenSCAD
 *
 * Note: This file contains type definitions for the OpenSCAD WebAssembly build.
 * The actual OpenSCAD WASM binaries are NOT included in this repository to avoid
 * GPL distribution obligations.
 */

interface FSWriteOptions {
  encoding?: string;
}

interface FSReadOptions {
  encoding?: string;
}

export interface EmscriptenFS {
  writeFile(
    path: string,
    data: string | Uint8Array | Int8Array,
    opts?: FSWriteOptions,
  ): void;
  readFile(path: string, opts?: FSReadOptions): Uint8Array;
  mkdir(path: string): void;
  unlink(path: string): void;
  readdir(path: string): string[];
  stat(path: string): { size: number };
}

export interface EmscriptenModule {
  // File system
  FS: EmscriptenFS;

  // Main entry point - equivalent to calling OpenSCAD from command line
  callMain: (args: string[]) => number;

  // Output capturing
  print?: (...args: string[]) => void;
  printErr?: (...args: string[]) => void;

  // Lifecycle hooks
  preRun?: Array<() => void>;
  postRun?: Array<() => void>;

  // Emscripten configuration
  noInitialRun?: boolean;
  locateFile?: (path: string) => string;
}

// Factory function type for creating OpenSCAD instances
export type OpenSCADModuleFactory = (
  overrides?: Partial<EmscriptenModule>,
) => Promise<EmscriptenModule>;

// Global exports that might be available after loading openscad.js
declare global {
  interface Window {
    Module?: unknown;
    OpenSCAD?: OpenSCADModuleFactory | EmscriptenModule;
    openSCAD?: OpenSCADModuleFactory | EmscriptenModule;
    createOpenSCAD?: OpenSCADModuleFactory;
  }
}
