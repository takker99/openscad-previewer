import app from "./server.tsx";

Deno.serve(app.fetch);
