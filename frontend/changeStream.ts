/*
 * OpenSCAD Previewer - File Change Stream using Server-Sent Events
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
 */

export type FileChange = { path: string; kind: "create" | "modify" | "remove" };

export class ChangeStream {
  private es?: EventSource;
  private listeners = new Set<(ev: FileChange) => void>();
  constructor(private baseUrl: string) {}

  start() {
    if (this.es) return;
    this.es = new EventSource(`${this.baseUrl}/events`);
    this.es.addEventListener("change", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as FileChange;
        this.listeners.forEach((fn) => fn(data));
      } catch (err) {
        console.error("Bad change event", err);
      }
    });
    this.es.onerror = (e) => console.warn("SSE error", e);
  }

  onChange(fn: (ev: FileChange) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  stop() {
    this.es?.close();
    this.es = undefined;
  }
}
