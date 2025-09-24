import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

// サーバーサイドからのpropsを取得
const propsElement = document.getElementById("app-props");
const props = propsElement ? JSON.parse(propsElement.textContent || "{}") : {};

const params = new URLSearchParams(location.search);
const entry = props.entry || params.get("entry") || "main.scad";

const container = document.getElementById("app")!;
// Clear existing content and render
container.innerHTML = '';
const root = createRoot(container);
root.render(<App entry={entry} />);
