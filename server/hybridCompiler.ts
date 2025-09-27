/*
 * OpenSCAD Previewer - Hybrid Compiler (Native + WASM fallback message)
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

import {
  type NativeCompileOptions,
  type NativeCompileResult,
  NativeOpenSCADCompiler,
} from "./nativeCompiler.ts";

export type HybridCompileOptions = NativeCompileOptions;
export type HybridCompileResult = NativeCompileResult;

export class HybridOpenSCADCompiler {
  private nativeCompiler = new NativeOpenSCADCompiler();

  async compile(options: HybridCompileOptions): Promise<HybridCompileResult> {
    // Try native compilation first
    if (this.nativeCompiler.isAvailable()) {
      console.log("Using native OpenSCAD compilation");
      return await this.nativeCompiler.compile(options);
    }

    // If native is not available, return helpful message
    return {
      success: false,
      duration: 0,
      stdout: [],
      stderr: [
        "Server-side compilation is not fully implemented yet.",
        "This requires either:",
        "1. Native OpenSCAD installed on the server, or",
        "2. A compatible WASM runtime environment.",
        "",
        "For now, please use the browser-based compilation by reverting to the previous version.",
        "The server-side architecture is prepared but needs proper WASM environment setup.",
      ],
      error:
        "Server-side compilation not available - please install native OpenSCAD or use browser compilation",
    };
  }

  isNativeAvailable(): boolean {
    return this.nativeCompiler.isAvailable();
  }
}
