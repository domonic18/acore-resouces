import { useState, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import {
  AlertCircle,
  RotateCw,
  ZoomIn,
  Move,
  RefreshCw,
  Hexagon,
} from "lucide-react";
import type { ModelPreview } from "@/shared/types";

interface ModelViewerProps {
  preview: ModelPreview;
  resourceType: string;
}

export function ModelViewer({ preview }: ModelViewerProps) {
  const [wireframe, setWireframe] = useState(false);

  const hasGltf =
    preview.conversion.status === "success" && preview.conversion.output_dir;

  return (
    <div className="viewer-panel">
      <div className="viewer-canvas">
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} />
          <Grid infiniteGrid fadeDistance={25} />
          <PlaceholderModel wireframe={wireframe} />
          <OrbitControls />
        </Canvas>
        {!hasGltf && (
          <div className="absolute bottom-4 left-4 right-4 z-10 rounded-md border border-border bg-bg-elevated/90 p-3 text-xs text-text-secondary backdrop-blur">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p>
                  暂无可用的 glTF 模型，展示占位预览。转换状态：
                  {preview.conversion.status}
                </p>
                {preview.conversion.error && (
                  <p className="mt-1 text-danger">{preview.conversion.error}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="viewer-toolbar">
        <button className="btn btn-sm btn-ghost" title="旋转">
          <RotateCw className="h-4 w-4" />
        </button>
        <button className="btn btn-sm btn-ghost" title="缩放">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="btn btn-sm btn-ghost" title="平移">
          <Move className="h-4 w-4" />
        </button>
        <button className="btn btn-sm btn-ghost" title="重置视角">
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          className={`btn btn-sm ${wireframe ? "btn-primary" : "btn-ghost"}`}
          title="线框模式"
          onClick={() => setWireframe((v) => !v)}
        >
          <Hexagon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PlaceholderModel({ wireframe }: { wireframe: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      meshRef.current.rotation.x =
        Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef} scale={[1, 1, 1]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6366f1" wireframe={wireframe} />
    </mesh>
  );
}
