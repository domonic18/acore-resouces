export type AnimationState = "stand" | "walk" | "run" | "flight";

// Standard WoW animation IDs for the high-level states we expose in the UI.
const ANIMATION_ID_STAND = 0;
const ANIMATION_ID_WALK = 4;
const ANIMATION_ID_RUN = 5;
const ANIMATION_ID_FLIGHT = 229;

// IDs observed in local retro-ported assets.
const ANIMATION_ID_RETRO_STAND = 61;
const ANIMATION_ID_RETRO_WALK = 62;
const ANIMATION_ID_RETRO_FLIGHT = 97;
// Retro-port models reuse the walk ID for running.
const ANIMATION_ID_RETRO_RUN = ANIMATION_ID_RETRO_WALK;

export const ANIMATION_CANONICAL: Record<AnimationState, number> = {
  stand: ANIMATION_ID_STAND,
  walk: ANIMATION_ID_WALK,
  run: ANIMATION_ID_RUN,
  flight: ANIMATION_ID_FLIGHT,
};

export const ANIMATION_RETRO_PORT: Partial<Record<AnimationState, number>> = {
  stand: ANIMATION_ID_RETRO_STAND,
  walk: ANIMATION_ID_RETRO_WALK,
  run: ANIMATION_ID_RETRO_RUN,
  flight: ANIMATION_ID_RETRO_FLIGHT,
};

export function resolveAnimationId(
  state: AnimationState,
  availableIds: Set<number>,
): number | null {
  const candidates = [
    ANIMATION_CANONICAL[state],
    ANIMATION_RETRO_PORT[state],
  ].filter((id): id is number => id !== undefined);

  for (const id of candidates) {
    if (availableIds.has(id)) return id;
  }

  return availableIds.has(ANIMATION_ID_STAND) ? ANIMATION_ID_STAND : null;
}
