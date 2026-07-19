export type AnimationState = "stand" | "walk" | "run" | "flight";

// Standard WoW animation IDs for the high-level states we expose in the UI.
const ANIMATION_ID_STAND = 0;
const ANIMATION_ID_WALK = 4;
const ANIMATION_ID_RUN = 5;
const ANIMATION_ID_FLIGHT = 229;

// IDs observed in local retro-ported assets. These are used only for states
// where the canonical ID resolves to an internal stub sequence.
const ANIMATION_ID_RETRO_RUN = 62;
const ANIMATION_ID_RETRO_FLIGHT = 97;

export const ANIMATION_CANONICAL: Record<AnimationState, number> = {
  stand: ANIMATION_ID_STAND,
  walk: ANIMATION_ID_WALK,
  run: ANIMATION_ID_RUN,
  flight: ANIMATION_ID_FLIGHT,
};

export const ANIMATION_RETRO_PORT: Partial<Record<AnimationState, number>> = {
  run: ANIMATION_ID_RETRO_RUN,
  flight: ANIMATION_ID_RETRO_FLIGHT,
};

export function resolveAnimationId(
  state: AnimationState,
  availableIds: Set<number>,
): number | null {
  // Prefer the canonical ID when it is available. Retro-ported assets sometimes
  // keep real animation data on the canonical internal sequence (e.g. run=5)
  // and only use external retro IDs as alternates. If the canonical ID is
  // missing, fall back to the retro-port ID.
  const candidates = [
    ANIMATION_CANONICAL[state],
    ANIMATION_RETRO_PORT[state],
  ].filter((id): id is number => id !== undefined);

  for (const id of candidates) {
    if (availableIds.has(id)) return id;
  }

  return availableIds.has(ANIMATION_ID_STAND) ? ANIMATION_ID_STAND : null;
}
