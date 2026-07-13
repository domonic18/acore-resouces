import { useEffect, useRef, useMemo, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { M2Data, M2SkinData, ParsedM2 } from "@/lib/m2/types";

interface M2SceneProps {
  parsed: ParsedM2;
  textureUrls: Record<number, string>;
  wireframe?: boolean;
}

function resolveTextureUrl(
  m2: M2Data,
  batch: M2SkinData["batches"][number],
  textureUrls: Record<number, string>,
): string | null {
  const lookupIndex = batch.textureLookup;
  if (lookupIndex < 0 || lookupIndex >= m2.textureLookups.length) {
    return null;
  }
  const textureIndex = m2.textureLookups[lookupIndex];
  if (textureIndex < 0 || textureIndex >= m2.textures.length) {
    return null;
  }
  return textureUrls[textureIndex] ?? null;
}

function buildSubmeshGeometry(
  m2: M2Data,
  skin: M2SkinData,
  submeshIndex: number,
): THREE.BufferGeometry | null {
  const submesh = skin.submeshes[submeshIndex];
  if (!submesh || submesh.triangleCount === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const vertexSet = new Set<number>();
  const { startTriangle, triangleCount } = submesh;
  const endTriangle = startTriangle + triangleCount;

  for (let i = startTriangle; i < endTriangle; i += 3) {
    for (let j = 0; j < 3; j++) {
      const index = skin.triangles[i + j];
      vertexSet.add(index);
    }
  }

  if (vertexSet.size === 0) {
    return null;
  }

  const uniqueVertices = Array.from(vertexSet);
  const indexMap = new Map<number, number>();
  uniqueVertices.forEach((vertexIndex, newIndex) => {
    indexMap.set(vertexIndex, newIndex);
  });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const vertexIndex of uniqueVertices) {
    const vertex = m2.vertices[vertexIndex];
    if (!vertex) continue;
    positions.push(-vertex.position[0], -vertex.position[2], vertex.position[1]);
    normals.push(-vertex.normal[0], -vertex.normal[2], vertex.normal[1]);
    uvs.push(vertex.textureCoords[0][0], -vertex.textureCoords[0][1] + 1);
  }

  if (positions.length === 0) {
    return null;
  }

  const indices: number[] = [];
  for (let i = startTriangle; i < endTriangle; i += 3) {
    const a = indexMap.get(skin.triangles[i]) ?? 0;
    const b = indexMap.get(skin.triangles[i + 1]) ?? 0;
    const c = indexMap.get(skin.triangles[i + 2]) ?? 0;
    indices.push(a, b, c);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(normals, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (indices.length > 0) {
    geometry.setIndex(indices);
  }
  geometry.computeVertexNormals();

  return geometry;
}

function useOptionalTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    let cancelled = false;
    loader.load(url, (loaded) => {
      if (cancelled) {
        loaded.dispose();
        return;
      }
      loaded.flipY = false;
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.wrapT = THREE.RepeatWrapping;
      setTexture(loaded);
    });

    return () => {
      cancelled = true;
      setTexture((current) => {
        current?.dispose();
        return null;
      });
    };
  }, [url]);

  return texture;
}

function M2MaterialMesh({
  geometry,
  textureUrl,
  wireframe,
}: {
  geometry: THREE.BufferGeometry;
  textureUrl: string | null;
  wireframe: boolean;
}) {
  const texture = useOptionalTexture(textureUrl);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={0xffffff}
        roughness={0.7}
        metalness={0.1}
        side={THREE.DoubleSide}
        wireframe={wireframe}
        map={texture}
        transparent={textureUrl !== null}
      />
    </mesh>
  );
}

export function M2Scene({ parsed, textureUrls, wireframe = false }: M2SceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { m2, skin } = parsed;

  // eslint-disable-next-line no-console
  console.log("M2Scene render:", {
    vertices: m2.vertices.length,
    submeshes: skin.submeshes.length,
    batches: skin.batches.length,
    triangles: skin.triangles.length,
  });

  const submeshGeometries = useMemo(() => {
    const geometries: (THREE.BufferGeometry | null)[] = [];
    for (let i = 0; i < skin.submeshes.length; i++) {
      try {
        geometries.push(buildSubmeshGeometry(m2, skin, i));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Submesh ${i} geometry build failed:`, err);
        geometries.push(null);
      }
    }
    return geometries;
  }, [m2, skin]);

  useEffect(() => {
    return () => {
      submeshGeometries.forEach((geometry) => geometry?.dispose());
    };
  }, [submeshGeometries]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
    }
  });

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]}>
      {skin.submeshes.map((submesh, index) => {
        const geometry = submeshGeometries[index];
        if (!geometry || geometry.attributes.position?.count === 0) {
          return null;
        }

        const submeshBatches = skin.batches.filter(
          (batch) => batch.submeshIndex === index || batch.submeshIndex2 === index,
        );

        const batch = submeshBatches[0];
        const textureUrl = batch ? resolveTextureUrl(m2, batch, textureUrls) : null;

        return (
          <M2MaterialMesh
            key={submesh.partID}
            geometry={geometry}
            textureUrl={textureUrl}
            wireframe={wireframe}
          />
        );
      })}
    </group>
  );
}

export function centerCameraOnModel(
  camera: THREE.Camera,
  parsed: ParsedM2,
): void {
  const { skin } = parsed;
  if (skin.submeshes.length === 0) return;

  const box = new THREE.Box3();
  skin.submeshes.forEach((submesh) => {
    const center = new THREE.Vector3(
      submesh.centerMass[0],
      submesh.centerMass[2],
      -submesh.centerMass[1],
    );
    box.expandByPoint(center);
    box.expandByPoint(
      new THREE.Vector3(
        center.x + submesh.radius,
        center.y + submesh.radius,
        center.z + submesh.radius,
      ),
    );
    box.expandByPoint(
      new THREE.Vector3(
        center.x - submesh.radius,
        center.y - submesh.radius,
        center.z - submesh.radius,
      ),
    );
  });

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
  camera.lookAt(center);
}
