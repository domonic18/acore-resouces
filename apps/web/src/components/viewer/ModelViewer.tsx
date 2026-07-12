import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Box, AlertCircle } from 'lucide-react';
import type { ModelPreview } from '@/shared/types';

interface ModelViewerProps {
  preview: ModelPreview;
  resourceType: string;
}

export function ModelViewer({ preview }: ModelViewerProps) {
  const [showFallback, setShowFallback] = useState(false);

  const hasGltf = preview.conversion.status === 'success' && preview.conversion.output_dir;
  const show3d = hasGltf && !showFallback;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4" />
          <h3 className="font-medium">3D 模型预览</h3>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{preview.status}</span>
        </div>
        {hasGltf && (
          <button
            onClick={() => setShowFallback((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showFallback ? '显示 3D' : '显示降级视图'}
          </button>
        )}
      </div>

      {!hasGltf && (
        <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>暂无可用的 glTF 模型，展示文件级元数据与贴图清单。转换状态：{preview.conversion.status}</p>
            {preview.conversion.error && <p className="mt-1 text-red-500">{preview.conversion.error}</p>}
          </div>
        </div>
      )}

      {show3d && (
        <div className="h-96 w-full rounded-md border">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <Grid infiniteGrid fadeDistance={25} />
            <PlaceholderModel />
            <OrbitControls />
          </Canvas>
          <p className="mt-2 text-xs text-muted-foreground">
            已加载占位模型；实际 glTF 路径：{preview.conversion.output_dir}
          </p>
        </div>
      )}

      {(showFallback || !hasGltf) && preview.metadata && (
        <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(preview.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PlaceholderModel() {
  return (
    <mesh rotation={[0.5, 0.5, 0]} scale={[1, 1, 1]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  );
}
