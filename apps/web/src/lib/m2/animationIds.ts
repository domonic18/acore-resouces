export type AnimationState = "stand" | "walk" | "run" | "flight";

export const ANIMATION_CANONICAL: Record<AnimationState, number> = {
  stand: 0,
  walk: 4,
  run: 5,
  flight: 229,
};

export const ANIMATION_RETRO_PORT: Partial<Record<AnimationState, number>> = {
  stand: 61,
  walk: 62,
  run: 62,
  flight: 97,
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

  return availableIds.has(0) ? 0 : null;
}
