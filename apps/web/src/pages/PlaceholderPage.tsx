import { useNavigate } from "react-router-dom";
import { ArrowLeft, Box } from "lucide-react";

export function PlaceholderPage({ title }: { title: string }) {
  const navigate = useNavigate();

  return (
    <div className="content">
      <div className="empty-state">
        <Box className="h-16 w-16 text-text-tertiary" />
        <h3>{title}</h3>
        <p>该页面功能正在开发中，敬请期待。</p>
        <button onClick={() => navigate(-1)} className="btn mt-4">
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
      </div>
    </div>
  );
}
