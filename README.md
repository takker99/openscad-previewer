# openscad-previewer

Hot-reload previewer for OpenSCAD using WebAssembly. Deno server + Preact +
Three.js.

# Getting started

```sh
deno server -A jsr:@takker/openscad-previewer
```

Then open the url printed in the console, e.g. `http://localhost:8000`.

## License

This project is licensed under the GNU General Public License v2.0 only
(GPL-2.0-only).

Since this project uses openscad-wasm (which is licensed under GPL v2), this
project must also be licensed under GPL v2 to comply with the copyleft
requirements of the GPL license. See the LICENSE file for the full license text.
