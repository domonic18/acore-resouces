import { useQuery } from "@tanstack/react-query";
import { getPatchJobAudit } from "@/shared/patches";

export function usePatchJobAudit(jobId: string | null) {
  return useQuery({
    queryKey: ["patch-job-audit", jobId],
    queryFn: () => getPatchJobAudit(jobId as string),
    enabled: !!jobId,
  });
}
