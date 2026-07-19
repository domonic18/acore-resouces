import { useQuery } from "@tanstack/react-query";
import { getAllIcons } from "@/shared/resources";

export function useResourceIcons(enabled: boolean) {
  return useQuery({
    queryKey: ["icons"],
    queryFn: getAllIcons,
    enabled,
  });
}
