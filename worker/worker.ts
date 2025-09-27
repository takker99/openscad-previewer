/*
 * OpenSCAD Previewer - Worker Implementation
 * Copyright (C) 2025 takker
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * Based on https://github.com/seasick/openscad-web-gui/blob/main/src/worker.mts
 */

import { OpenSCADEngine } from "./openscad.ts";
import {
  WorkerMessageType,
  type WorkerRequest,
  type WorkerResponse,
} from "./types.ts";

const engine = new OpenSCADEngine();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data: message } = event;
  let response: WorkerResponse;

  try {
    switch (message.type) {
      case WorkerMessageType.COMPILE: {
        const result = await engine.compile({
          entry: message.entry,
          files: message.files,
          openscadVersion: message.openscadVersion,
        });

        response = {
          id: message.id,
          success: result.success,
          stl: result.stl,
          duration: result.duration,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error,
        };
        break;
      }

      default:
        response = {
          id: message.id,
          success: false,
          error: `Unknown message type: ${message.type}`,
        } as WorkerResponse;
        break;
    }
  } catch (error) {
    response = {
      id: message.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } as WorkerResponse;
  }

  self.postMessage(response);
};
