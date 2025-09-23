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
