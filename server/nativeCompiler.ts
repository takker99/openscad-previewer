/*
 * OpenSCAD Previewer - Native OpenSCAD Compiler (Fallback)
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

export interface NativeCompileOptions {
  entry: string;
  rootPath: string;
}

export interface NativeCompileResult {
  success: boolean;
  stl?: Uint8Array;
  duration: number;
  stdout: string[];
  stderr: string[];
  error?: string;
}

export class NativeOpenSCADCompiler {
  private openscadPath?: string;

  constructor() {
    this.detectOpenSCAD();
  }

  private async detectOpenSCAD(): Promise<void> {
    // Try to detect if native OpenSCAD is available
    const possiblePaths = ["openscad", "/usr/bin/openscad", "/opt/openscad/bin/openscad"];
    
    for (const path of possiblePaths) {
      try {
        const process = new Deno.Command(path, {
          args: ["--version"],
          stdout: "piped",
          stderr: "piped",
        });
        
        const { code } = await process.output();
        if (code === 0) {
          this.openscadPath = path;
          console.log(`Found native OpenSCAD at: ${path}`);
          return;
        }
      } catch {
        // Continue to next path
      }
    }
    
    console.log("Native OpenSCAD not found, will use WASM fallback");
  }

  async compile(options: NativeCompileOptions): Promise<NativeCompileResult> {
    if (!this.openscadPath) {
      return {
        success: false,
        duration: 0,
        stdout: [],
        stderr: [],
        error: "Native OpenSCAD not available",
      };
    }

    const start = Date.now();
    const inputFile = `${options.rootPath}/${options.entry}`;
    const outputFile = `/tmp/openscad_output_${Date.now()}.stl`;

    try {
      // Check if input file exists
      try {
        await Deno.stat(inputFile);
      } catch {
        return {
          success: false,
          duration: Date.now() - start,
          stdout: [],
          stderr: [],
          error: `Input file not found: ${inputFile}`,
        };
      }

      const process = new Deno.Command(this.openscadPath, {
        args: [
          inputFile,
          "-o", outputFile,
          "--export-format=binstl",
          "--enable=manifold",
          "--enable=fast-csg", 
          "--enable=lazy-union",
        ],
        stdout: "piped",
        stderr: "piped",
        cwd: options.rootPath,
      });

      const { code, stdout, stderr } = await process.output();
      const duration = Date.now() - start;

      const stdoutStr = new TextDecoder().decode(stdout).split('\n').filter(Boolean);
      const stderrStr = new TextDecoder().decode(stderr).split('\n').filter(Boolean);

      if (code !== 0) {
        return {
          success: false,
          duration,
          stdout: stdoutStr,
          stderr: stderrStr,
          error: `OpenSCAD exited with code ${code}`,
        };
      }

      // Read output file
      let stl: Uint8Array;
      try {
        stl = await Deno.readFile(outputFile);
        // Clean up temp file
        await Deno.remove(outputFile);
      } catch (error) {
        return {
          success: false,
          duration,
          stdout: stdoutStr,
          stderr: stderrStr,
          error: `Failed to read output file: ${error}`,
        };
      }

      return {
        success: true,
        stl,
        duration,
        stdout: stdoutStr,
        stderr: stderrStr,
      };

    } catch (error) {
      return {
        success: false,
        duration: Date.now() - start,
        stdout: [],
        stderr: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  isAvailable(): boolean {
    return !!this.openscadPath;
  }
}