/*
 * OpenSCAD Previewer - OpenSCAD WASM Type Definitions
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
 *
 * Based on Emscripten Module interface for OpenSCAD
 *
 * Note: This file contains type definitions for the OpenSCAD WebAssembly build.
 * The actual OpenSCAD WASM binaries are NOT included in this repository but are
 * downloaded from the openscad-wasm project which is licensed under GPL v2.
 * Since this project uses openscad-wasm, it must also be licensed under GPL v2
 * to comply with the copyleft requirements.
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
