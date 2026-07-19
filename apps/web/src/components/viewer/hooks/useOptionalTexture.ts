import { useEffect, useState } from "react";
import * as THREE from "three";

export function useOptionalTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    let cancelled = false;
    loader.load(
      url,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.flipY = false;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;

        console.log("[useOptionalTexture] loaded", url);
        setTexture(loaded);
      },
      undefined,
      (err) => {
        console.error("[useOptionalTexture] failed to load", url, err);
      },
    );

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
