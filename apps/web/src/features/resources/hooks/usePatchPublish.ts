import { useMutation } from "@tanstack/react-query";
import { publishPatches } from "@/shared/patches";

export function usePatchPublish() {
  return useMutation({
    mutationFn: (body: { start_number?: number; dry_run?: boolean }) =>
      publishPatches(body),
  });
}
