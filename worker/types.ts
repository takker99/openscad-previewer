/*
 * OpenSCAD Previewer - Worker Types
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 */

export enum WorkerMessageType {
  COMPILE = "compile",
  FS_WRITE = "fs_write",
  FS_READ = "fs_read",
  FS_UNLINK = "fs_unlink",
}

export interface CompileRequest {
  type: WorkerMessageType.COMPILE;
  id: string;
  entry: string;
  files: Array<{ path: string; content: string }>;
}

export interface FileSystemRequest {
  type:
    | WorkerMessageType.FS_WRITE
    | WorkerMessageType.FS_READ
    | WorkerMessageType.FS_UNLINK;
  id: string;
  path: string;
  content?: string;
}

export type WorkerRequest = CompileRequest | FileSystemRequest;

export interface CompileResult {
  id: string;
  success: boolean;
  stl?: Uint8Array;
  duration: number;
  stdout: string[];
  stderr: string[];
  error?: string;
}

export interface FileSystemResult {
  id: string;
  success: boolean;
  content?: string;
}

export type WorkerResponse = CompileResult | FileSystemResult;
