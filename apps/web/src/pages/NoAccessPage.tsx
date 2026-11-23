import { KeyRound } from "lucide-react";

/** 无任何查看权限的账号落脚页：提示联系管理员。 */
export function NoAccessPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="empty-state">
        <KeyRound className="h-10 w-10 text-text-tertiary" />
        <h3>当前账号没有任何访问权限</h3>
        <p>请联系管理员在「账号权限」页为该账号分配查看权限。</p>
      </div>
    </div>
  );
}
