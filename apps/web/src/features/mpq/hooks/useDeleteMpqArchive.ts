import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteMpqArchive } from "@/shared/patches";

/** 删除一个 MPQ 档案（及其批次元数据） */
export function useDeleteMpqArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archive: string) => deleteMpqArchive(archive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mpq", "archives"] });
      queryClient.invalidateQueries({ queryKey: ["patch-batches"] });
      queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["distro-status"] });
    },
  });
}
