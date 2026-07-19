import { useEffect, useRef, useState } from "react";
import { parseM2WithSkin } from "@/lib/m2/parser";
import { fetchM2Binary } from "@/shared/resources";
import type { ModelPreview } from "@/shared/types";
import type { ParsedM2 } from "@/lib/m2/types";

export function useM2Loader(preview: ModelPreview) {
  const [parsed, setParsed] = useState<ParsedM2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const m2BufferRef = useRef<ArrayBuffer | null>(null);

  const canRender =
    preview.status === "available" && preview.skin_files.length > 0;

  useEffect(() => {
    if (!canRender) {
      setParsed(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadModel() {
      try {
        const mainSkin = preview.skin_files[0];
        if (!mainSkin) {
          throw new Error("未找到 skin 文件");
        }

        const [m2Buffer, skinBuffer] = await Promise.all([
          fetchM2Binary(preview.main_m2),
          fetchM2Binary(mainSkin),
        ]);

        m2BufferRef.current = m2Buffer;
        const result = await parseM2WithSkin(m2Buffer, skinBuffer);
        if (!cancelled) {
          setParsed(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [preview.main_m2, preview.skin_files, canRender]);

  return { parsed, error, loading, m2BufferRef, canRender };
}
