import { useQuery } from "@tanstack/react-query";
import { getResource } from "@/shared/resources";

export function useResourceDetail(
  resourceType: string,
  resourceId: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["resource", resourceType, resourceId],
    queryFn: () => getResource(resourceType, resourceId),
    enabled,
  });
}
