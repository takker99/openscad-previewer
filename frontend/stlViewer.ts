import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { STLLoader } from "three-stdlib";

export class StlViewer {
  private root?: HTMLElement;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private currentMesh?: THREE.Mesh;
  private animationId?: number;

  mount(el: HTMLElement) {
    this.root = el;
    this.setupThreeJS();
    this.startRenderLoop();
  }

  unmount() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }

    this.controls?.dispose();
    this.renderer?.dispose();

    if (this.root) {
      this.root.innerHTML = "";
    }

    this.root = undefined;
    this.scene = undefined;
    this.camera = undefined;
    this.renderer = undefined;
    this.controls = undefined;
    this.currentMesh = undefined;
  }

  render(stlData: Uint8Array) {
    if (!this.scene || !this.camera || !this.renderer) return;

    console.log("STL viewer render called with data size:", stlData.length);

    // Remove existing mesh
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      if (Array.isArray(this.currentMesh.material)) {
        this.currentMesh.material.forEach((m) => m.dispose());
      } else {
        this.currentMesh.material.dispose();
      }
    }

    try {
      // Create blob URL for STL data
      const blob = new Blob([stlData.buffer as ArrayBuffer], { type: "model/stl" });
      const url = URL.createObjectURL(blob);
      console.log("Created blob URL:", url);

      const loader = new STLLoader();
      loader.load(
        url,
        (geometry) => {
          console.log(
            "STL loaded successfully, triangles:",
            geometry.attributes.position.count / 3,
          );

          // Clean up blob URL
          URL.revokeObjectURL(url);

          // Create material
          const material = new THREE.MeshLambertMaterial({
            color: 0x888888,
            side: THREE.DoubleSide,
          });

          // Create mesh
          this.currentMesh = new THREE.Mesh(geometry, material);
          this.scene!.add(this.currentMesh);
          console.log("Mesh added to scene");

          // Center and fit the camera to the model
          this.fitCameraToModel();
        },
        undefined,
        (error) => {
          URL.revokeObjectURL(url);
          console.error("STL loading error:", error);
          this.showError(`Failed to load STL: ${error}`);
        },
      );
    } catch (error) {
      console.error("STL rendering error:", error);
      this.showError(`Failed to render STL: ${error}`);
    }
  }

  showError(message: string) {
    if (!this.root) return;
    this.root.innerHTML =
      `<pre style="color:#ef4444;white-space:pre-wrap;padding:12px">${message}</pre>`;
  }

  private setupThreeJS() {
    if (!this.root) return;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.root.clientWidth / this.root.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(50, 50, 50);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.root.clientWidth, this.root.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Handle window resize
    const handleResize = () => {
      if (!this.root || !this.camera || !this.renderer) return;

      const width = this.root.clientWidth;
      const height = this.root.clientHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    globalThis.addEventListener("resize", handleResize);

    // Store resize handler for cleanup
    // @ts-ignore: Adding custom property for cleanup
    this.renderer.domElement._resizeHandler = handleResize;
  }

  private startRenderLoop() {
    const render = () => {
      if (!this.renderer || !this.scene || !this.camera || !this.controls) {
        return;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  private fitCameraToModel() {
    if (!this.currentMesh || !this.camera || !this.controls) return;

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(this.currentMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Calculate optimal camera distance
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5;

    // Position camera
    this.camera.position.copy(center);
    this.camera.position.x += distance;
    this.camera.position.y += distance;
    this.camera.position.z += distance;

    // Update controls target
    this.controls.target.copy(center);
    this.controls.update();
  }
}
