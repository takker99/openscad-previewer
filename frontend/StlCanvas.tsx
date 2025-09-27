import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  CameraControls,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
} from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";

interface StlCanvasProps {
  stlData?: Uint8Array;
  error?: string;
}

function StlMesh({ stlData }: { stlData: Uint8Array }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const cameraControlsRef = useRef<CameraControls>(null);

  useEffect(() => {
    if (!stlData) return;

    try {
      // Create blob URL for STL data
      const blob = new Blob([stlData.buffer as ArrayBuffer], {
        type: "model/stl",
      });
      const url = URL.createObjectURL(blob);

      const loader = new STLLoader();
      loader.load(
        url,
        (loadedGeometry) => {
          // Center the geometry
          loadedGeometry.center();
          loadedGeometry.computeVertexNormals();
          setGeometry(loadedGeometry);

          // Fit camera to object
          if (cameraControlsRef.current && meshRef.current) {
            const box = new THREE.Box3().setFromObject(meshRef.current);
            cameraControlsRef.current.fitToBox(box, true);
          }

          // Clean up blob URL
          URL.revokeObjectURL(url);
        },
        undefined,
        (error) => {
          console.error("Error loading STL:", error);
          URL.revokeObjectURL(url);
        },
      );
    } catch (error) {
      console.error("Error processing STL data:", error);
    }
  }, [stlData]);

  if (!geometry) return null;

  return (
    <>
      <CameraControls
        ref={cameraControlsRef}
        dollySpeed={1}
        truckSpeed={2}
      />
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#888888"
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>
    </>
  );
}

function SceneContent({ stlData, error }: StlCanvasProps) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[50, 50, 50]}
        intensity={0.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      {/* Environment for better lighting */}
      <Environment preset="studio" />

      {/* Grid */}
      <Grid
        position={[0, -0.01, 0]}
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#444444"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#666666"
        fadeDistance={100}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      {/* STL Model */}
      {stlData && !error && <StlMesh stlData={stlData} />}

      {/* Error Display */}
      {error && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[10, 2, 1]} />
          <meshBasicMaterial color="#ff4444" />
        </mesh>
      )}

      {/* Gizmo Helper */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#ff0000", "#00ff00", "#0000ff"]}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
}

export function StlCanvas({ stlData, error }: StlCanvasProps) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        camera={{
          position: [50, 50, 50],
          fov: 75,
          near: 0.1,
          far: 1000,
        }}
        shadows
        style={{ background: "#1a1a1a" }}
      >
        <SceneContent stlData={stlData} error={error} />
      </Canvas>

      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(239, 68, 68, 0.9)",
            color: "white",
            padding: "8px",
            fontSize: "12px",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            maxHeight: "30vh",
            overflow: "auto",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
