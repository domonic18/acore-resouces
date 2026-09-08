import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAiConfig,
  testAiConfig,
  updateAiConfig,
} from "@/shared/settings";
import type { AiConfigUpdateRequest } from "@/shared/types";

export function useAiConfig() {
  return useQuery({
    queryKey: ["ai-config"],
    queryFn: getAiConfig,
    staleTime: 60 * 1000,
  });
}

export function useUpdateAiConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AiConfigUpdateRequest) => updateAiConfig(body),
    onSuccess: (data) => {
      queryClient.setQueryData(["ai-config"], data);
    },
  });
}

export function useTestAiConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => testAiConfig(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config"] });
    },
  });
}
