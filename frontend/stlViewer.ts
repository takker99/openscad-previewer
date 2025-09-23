// 簡易ビューア（Three.jsなどに差し替え可能な最小プレースホルダー）
export class StlViewer {
  private root?: HTMLElement;

  mount(el: HTMLElement) {
    this.root = el;
    this.root.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100%;">STL viewer placeholder</div>`;
  }
  unmount() {
    if (this.root) this.root.innerHTML = "";
    this.root = undefined;
  }
  render(_stlData: Uint8Array) {
    // TODO: ここで three.js の STLLoader 等を使って描画する
    // 当面は何もしない（将来差し替え）
    if (!this.root) return;
    // 例: const blob = new Blob([stlData], { type: "model/stl" }); const url = URL.createObjectURL(blob);
  }
  showError(message: string) {
    if (!this.root) return;
    this.root.innerHTML =
      `<pre style="color:#ef4444;white-space:pre-wrap;padding:12px">${message}</pre>`;
  }
}
