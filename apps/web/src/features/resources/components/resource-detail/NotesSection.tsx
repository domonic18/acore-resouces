import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { cn } from "@/shared/utils";
import { markdownComponents } from "@/shared/markdown";
import type { FormState } from "../../hooks/useResourceForm";

interface NotesSectionProps {
  form: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  compact?: boolean;
}

export function NotesSection({ form, updateField, compact }: NotesSectionProps) {
  const [preview, setPreview] = useState(false);

  return (
    <SectionCard title="备注" compact={compact}>
      <FormGroup
        label="备注内容"
        compact={compact}
        hint={
          <span className="text-[10px] font-normal text-text-tertiary">
            支持 Markdown 与超链接，如 [Wowhead](https://...)
          </span>
        }
      >
        <div className="mb-1.5 flex justify-end gap-1">
          <button
            type="button"
            className={cn("btn btn-sm", !preview && "btn-primary")}
            onClick={() => setPreview(false)}
          >
            编辑
          </button>
          <button
            type="button"
            className={cn("btn btn-sm", preview && "btn-primary")}
            onClick={() => setPreview(true)}
          >
            预览
          </button>
        </div>
        {preview ? (
          <div className="form-textarea min-h-[120px] overflow-y-auto">
            {form.notes ? (
              <article className="markdown-body">
                <ReactMarkdown components={markdownComponents}>
                  {form.notes}
                </ReactMarkdown>
              </article>
            ) : (
              <p className="text-sm text-text-tertiary">暂无备注内容</p>
            )}
          </div>
        ) : (
          <textarea
            rows={6}
            className="form-textarea"
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="记录该资源的补充信息：官方出处版本、掉落来源、获取方式等"
          />
        )}
      </FormGroup>
    </SectionCard>
  );
}
