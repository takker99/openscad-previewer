import { hydrate } from "preact";
import { App } from "./App.tsx";

// サーバーサイドからのpropsを取得
const propsElement = document.getElementById("app-props");
const props = propsElement ? JSON.parse(propsElement.textContent || "{}") : {};

const params = new URLSearchParams(location.search);
const entry = props.entry || params.get("entry") || "main.scad";

hydrate(
  <App entry={entry} />,
  document.getElementById("app")!,
);
