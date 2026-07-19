import { useQuery } from "@tanstack/react-query";
import { getResourceAssets } from "@/shared/resources";

export function useResourceAssets(
  resourceType: string,
  resourceId: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["assets", resourceType, resourceId],
    queryFn: () => getResourceAssets(resourceType, resourceId),
    enabled,
  });
}
