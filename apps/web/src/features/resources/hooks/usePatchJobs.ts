import { useQuery } from "@tanstack/react-query";
import { listPatchJobs } from "@/shared/patches";

export function usePatchJobs(
  status: string | undefined,
  page: number,
  building: boolean,
) {
  return useQuery({
    queryKey: ["patch-jobs", { status, page }],
    queryFn: () => listPatchJobs({ status, page, page_size: 20 }),
    refetchInterval: building ? 2000 : false,
  });
}
