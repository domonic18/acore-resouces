import { useQuery } from "@tanstack/react-query";
import { listPatchJobs } from "@/shared/patches";

export function usePatchJobs(
  resourceType: string,
  resourceId: number | undefined,
) {
  return useQuery({
    queryKey: ["patch-jobs", resourceType, resourceId ?? "all"],
    queryFn: () =>
      listPatchJobs({
        resource_type: resourceType,
        resource_id: resourceId,
        page_size: 10,
      }),
    enabled: resourceType != null,
  });
}
