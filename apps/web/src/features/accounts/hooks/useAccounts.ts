import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  resetAccountPassword,
  setAccountPermissions,
  setAccountRole,
  type AccountCreateInput,
  type LocalAccount,
} from "@/shared/auth";

export function useAccounts(search: string) {
  return useQuery({
    queryKey: ["accounts", search],
    queryFn: () => listAccounts(search, 100),
    staleTime: 30 * 1000,
  });
}

export function useSetAccountRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, role }: { accountId: number; role: "admin" | "viewer" }) =>
      setAccountRole(accountId, role),
    onSuccess: (updated: LocalAccount) => {
      queryClient.setQueryData<LocalAccount[]>(
        ["accounts", ""],
        (old) =>
          old?.map((a) => (a.account_id === updated.account_id ? updated : a)) ?? old,
      );
    },
  });
}

export function useSetAccountPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, permissions }: { accountId: number; permissions: string[] }) =>
      setAccountPermissions(accountId, permissions),
    onSuccess: (updated: LocalAccount) => {
      queryClient.setQueryData<LocalAccount[]>(
        ["accounts", ""],
        (old) =>
          old?.map((a) => (a.account_id === updated.account_id ? updated : a)) ?? old,
      );
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountCreateInput) => createAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useResetAccountPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, password }: { accountId: number; password: string }) =>
      resetAccountPassword(accountId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: number) => deleteAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
