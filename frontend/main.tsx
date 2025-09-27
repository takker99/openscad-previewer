/*
 * OpenSCAD Previewer - Client-side Entry Point
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

import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

// サーバーサイドからのpropsを取得
const propsElement = document.getElementById("app-props");
const props = propsElement ? JSON.parse(propsElement.textContent || "{}") : {};

const params = new URLSearchParams(location.search);
const entry = props.entry || params.get("entry") || "main.scad";

const container = document.getElementById("app")!;
// Clear existing content and render
container.innerHTML = "";
const root = createRoot(container);
root.render(<App entry={entry} />);
