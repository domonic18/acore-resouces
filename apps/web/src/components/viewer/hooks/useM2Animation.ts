import { useEffect, useState } from "react";
import * as THREE from "three";
import { buildAnimationClip, buildAnimFileName } from "@/lib/m2/animation";
import type { AnimationState } from "@/lib/m2/animationIds";
import {
  ANIMATION_CANONICAL,
  ANIMATION_RETRO_PORT,
  resolveAnimationId,
} from "@/lib/m2/animationIds";
import {
  ANIM_FILE_EXTENSION,
  ANIM_ID_PADDING,
  SUB_ANIM_ID_PADDING,
} from "@/lib/m2/constants";
import { fetchAnimBinary } from "@/shared/resources";
import type { ParsedM2 } from "@/lib/m2/types";

function findAnimFilePath(
  animFiles: string[] | undefined,
  modelName: string,
  animId: number,
  subAnimId = 0,
): string | null {
  if (!animFiles || animFiles.length === 0) return null;

  const expectedName = buildAnimFileName(modelName, animId, subAnimId);
  const lowerExpected = expectedName.toLowerCase();
  const fullMatch = animFiles.find(function (path) {
    return path.toLowerCase().endsWith(lowerExpected);
  });
  if (fullMatch) return fullMatch;

  const baseName =
    modelName.replace(/\\/g, "/").split("/").pop()?.replace(/\.m2$/i, "") ?? "";
  const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const variationPattern =
    `${escapedBaseName}${String(animId).padStart(ANIM_ID_PADDING, "0")}-\\d{2}${ANIM_FILE_EXTENSION}`.toLowerCase();
  const variationRegex = new RegExp(`${variationPattern}$`);
  const variationMatch = animFiles.find(function (path) {
    return variationRegex.test(path.toLowerCase());
  });
  if (variationMatch) return variationMatch;

  const pattern =
    `${String(animId).padStart(ANIM_ID_PADDING, "0")}-${String(subAnimId).padStart(SUB_ANIM_ID_PADDING, "0")}${ANIM_FILE_EXTENSION}`.toLowerCase();
  return (
    animFiles.find(function (path) {
      return path.toLowerCase().endsWith(pattern);
    }) ?? null
  );
}

export function useM2Animation(
  parsed: ParsedM2 | null,
  animFiles: string[] | undefined,
  animationState: AnimationState,
  debugAnimId: number | null,
  m2BufferRef: React.MutableRefObject<ArrayBuffer | null>,
): THREE.AnimationClip | null {
  const [animationClip, setAnimationClip] =
    useState<THREE.AnimationClip | null>(null);

  useEffect(() => {
    if (!parsed) {
      setAnimationClip(null);
      return;
    }

    const currentParsed = parsed;
    let cancelled = false;

    async function loadAnimation() {
      const availableIds = new Set<number>();
      currentParsed.m2.animationLookup.forEach(
        function (sequenceIndex, animId) {
          if (
            sequenceIndex >= 0 &&
            sequenceIndex < currentParsed.m2.sequences.length
          ) {
            availableIds.add(animId);
          }
        },
      );
      currentParsed.m2.sequences.forEach(function (seq) {
        availableIds.add(seq.id);
      });

      console.log(
        "[animation] sequences:",
        currentParsed.m2.sequences
          .map(function (seq, idx) {
            return `[${idx}]id=${seq.id} sub=${seq.subId} len=${seq.length} flags=${seq.flags.toString(16)} alias=${seq.aliasNext}${
              (seq.flags & 0x40) !== 0 ? " ALIAS" : ""
            }`;
          })
          .join(", "),
        "lookup:",
        currentParsed.m2.animationLookup.slice(0, 256).join(","),
      );

      let animId: number | null;
      if (debugAnimId !== null) {
        animId = debugAnimId;
      } else {
        animId = resolveAnimationId(animationState, availableIds);
      }

      console.log(
        "[animation] state=",
        animationState,
        "resolved id=",
        animId,
        "debugAnimId=",
        debugAnimId,
      );
      if (animId === null) {
        setAnimationClip(null);
        return;
      }

      async function tryBuildClip(
        id: number,
      ): Promise<THREE.AnimationClip | null> {
        const animPath = findAnimFilePath(
          animFiles,
          currentParsed.m2.name,
          id,
          0,
        );

        console.log(
          "[animation] anim path=",
          animPath,
          "total anim files=",
          animFiles?.length ?? 0,
        );

        try {
          let animBuffer: ArrayBuffer | null = null;
          if (animPath) {
            animBuffer = await fetchAnimBinary(animPath);
          }
          if (cancelled) return null;

          const m2Buffer = m2BufferRef.current;
          if (!m2Buffer) return null;

          return buildAnimationClip(currentParsed, m2Buffer, id, animBuffer);
        } catch (err) {
          console.warn("Animation load failed:", err);
          return null;
        }
      }

      let clip = await tryBuildClip(animId);

      if (debugAnimId === null && (!clip || clip.tracks.length < 3)) {
        const alternateIds = [
          ANIMATION_CANONICAL[animationState],
          ANIMATION_RETRO_PORT[animationState],
        ].filter(function (id): id is number {
          return id !== undefined && id !== animId;
        });

        for (const altId of alternateIds) {
          if (!availableIds.has(altId)) continue;

          console.log(
            "[animation] resolved clip sparse, trying alternate id=",
            altId,
          );
          const altClip = await tryBuildClip(altId);
          if (altClip && altClip.tracks.length > (clip?.tracks.length ?? 0)) {
            clip = altClip;
          }
          if (clip && clip.tracks.length >= 3) break;
        }
      }

      console.log(
        "[animation] clip=",
        clip?.name,
        "duration=",
        clip?.duration,
        "tracks=",
        clip?.tracks.length,
      );
      if (!cancelled) {
        setAnimationClip(clip);
      }
    }

    loadAnimation();
    return () => {
      cancelled = true;
    };
  }, [parsed, animationState, debugAnimId, animFiles, m2BufferRef]);

  return animationClip;
}
