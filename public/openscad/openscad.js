// Placeholder - In real usage, place actual openscad.js here
// This is just for testing the loader mechanism
console.log("OpenSCAD WASM placeholder loaded");

// Mock OpenSCAD factory for testing
globalThis.OpenSCAD = function (overrides = {}) {
  console.log("Mock OpenSCAD factory called with:", overrides);

  return Promise.resolve({
    FS: {
      writeFile: (path, _data) => console.log(`Mock writeFile: ${path}`),
      readFile: (path) => {
        console.log(`Mock readFile: ${path}`);
        if (path === "/out/model.stl") {
          // Return mock STL data - a simple cube
          console.log("Generating mock STL cube");
          const mockSTL = createMockCubeSTL();
          console.log("Mock STL size:", mockSTL.length, "bytes");
          return mockSTL;
        }
        return new Uint8Array(0);
      },
      mkdir: (path) => console.log(`Mock mkdir: ${path}`),
      unlink: (path) => console.log(`Mock unlink: ${path}`),
      readdir: (path) => {
        console.log(`Mock readdir: ${path}`);
        return [];
      },
      stat: (path) => {
        console.log(`Mock stat: ${path}`);
        return { size: 0 };
      },
    },
    callMain: (args) => {
      console.log("Mock callMain called with:", args);
      return 0; // Success
    },
    print: overrides.print || console.log,
    printErr: overrides.printErr || console.error,
  });
};

// Helper function to create a proper STL cube for testing
function createMockCubeSTL() {
  const size = 10; // 10mm cube

  // STL format: header (80 bytes) + triangle count (4 bytes) + triangles
  const triangles = [];

  // Helper to add triangle with vertices and normal
  function addTriangle(v1, v2, v3, normal) {
    const triangle = new Float32Array(12); // normal(3) + v1(3) + v2(3) + v3(3)
    triangle.set(normal, 0);
    triangle.set(v1, 3);
    triangle.set(v2, 6);
    triangle.set(v3, 9);
    triangles.push(triangle);
  }

  // Create a simple cube with 12 triangles (2 per face)
  const s = size;

  // Front face (z=0)
  addTriangle([0, 0, 0], [s, 0, 0], [s, s, 0], [0, 0, -1]);
  addTriangle([0, 0, 0], [s, s, 0], [0, s, 0], [0, 0, -1]);

  // Back face (z=s)
  addTriangle([0, 0, s], [0, s, s], [s, s, s], [0, 0, 1]);
  addTriangle([0, 0, s], [s, s, s], [s, 0, s], [0, 0, 1]);

  // Left face (x=0)
  addTriangle([0, 0, 0], [0, s, 0], [0, s, s], [-1, 0, 0]);
  addTriangle([0, 0, 0], [0, s, s], [0, 0, s], [-1, 0, 0]);

  // Right face (x=s)
  addTriangle([s, 0, 0], [s, 0, s], [s, s, s], [1, 0, 0]);
  addTriangle([s, 0, 0], [s, s, s], [s, s, 0], [1, 0, 0]);

  // Bottom face (y=0)
  addTriangle([0, 0, 0], [0, 0, s], [s, 0, s], [0, -1, 0]);
  addTriangle([0, 0, 0], [s, 0, s], [s, 0, 0], [0, -1, 0]);

  // Top face (y=s)
  addTriangle([0, s, 0], [s, s, 0], [s, s, s], [0, 1, 0]);
  addTriangle([0, s, 0], [s, s, s], [0, s, s], [0, 1, 0]);

  // Build STL binary format
  const header = new Uint8Array(80);
  const triangleCount = new Uint32Array([triangles.length]);

  let totalSize = 80 + 4; // header + count
  triangles.forEach((_t) => totalSize += 50); // 12 floats * 4 bytes + 2 bytes attribute

  const stl = new Uint8Array(totalSize);
  let offset = 0;

  // Header
  stl.set(header, offset);
  offset += 80;

  // Triangle count
  const countBytes = new Uint8Array(triangleCount.buffer);
  stl.set(countBytes, offset);
  offset += 4;

  // Triangles
  triangles.forEach((triangle) => {
    const triangleBytes = new Uint8Array(triangle.buffer);
    stl.set(triangleBytes, offset);
    offset += 48; // 12 floats * 4 bytes

    // Attribute byte count (2 bytes)
    stl.set([0, 0], offset);
    offset += 2;
  });

  return stl;
}
