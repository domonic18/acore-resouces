import { useMutation, useQueryClient } from "@tanstack/react-query";
import { obfuscateMpqArchive } from "@/shared/patches";

/** 对构建侧 MPQ 档案执行 basic 混淆（剥除档案内清单，不可逆） */
export function useObfuscateMpqArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archive: string) => obfuscateMpqArchive(archive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mpq", "archives"] });
    },
  });
}
