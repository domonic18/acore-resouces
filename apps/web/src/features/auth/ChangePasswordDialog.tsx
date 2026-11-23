import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Dialog } from "@/shared/components/ui/Dialog";
import { changeMyPassword } from "@/shared/auth";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  }

  function handleClose() {
    if (submitting) return;
    resetForm();
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    changeMyPassword(oldPassword, newPassword)
      .then(() => {
        // 改密后旧令牌仍有效（JWT 无状态），重新登录换取新会话更稳妥
        resetForm();
        onClose();
        navigate("/login", { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "修改失败，请稍后重试");
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <Dialog open={open} onClose={handleClose} title="修改密码" subtitle="修改成功后需重新登录" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="form-label" htmlFor="old-password">旧密码</label>
          <input
            id="old-password"
            className="form-input"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="form-label" htmlFor="new-password">新密码</label>
          <input
            id="new-password"
            className="form-input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 8 位"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="form-label" htmlFor="confirm-password">确认新密码</label>
          <input
            id="confirm-password"
            className="form-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary justify-center"
          disabled={submitting || !oldPassword || !newPassword || !confirmPassword}
        >
          <KeyRound className="h-4 w-4" />
          {submitting ? "提交中…" : "修改密码"}
        </button>
      </form>
    </Dialog>
  );
}
