import { useState } from "react";
import { DbcFileList } from "@/features/dbc/components/DbcFileList";
import { DbcRecordsPanel } from "@/features/dbc/components/DbcRecordsPanel";
import { DbcRecordDetailPane } from "@/features/dbc/components/DbcRecordDetailPane";
import { DbcCompareDialog } from "@/features/dbc/components/DbcCompareDialog";

export function DbcPage() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const clearCompare = () => {
    setCompareA(null);
    setCompareB(null);
    setCompareOpen(false);
  };

  const selectFile = (file: string) => {
    setSelectedFile((prev) => {
      if (prev !== file) {
        setSelectedRecordId(null);
        clearCompare();
      }
      return file;
    });
  };

  const toggleCompareMode = () => {
    setCompareMode((prev) => {
      if (prev) clearCompare();
      return !prev;
    });
  };

  // 对比模式点击行：点击已选槽位取消；A 空设 A；B 空设 B 并打开对比；均满替换 B
  const handleCompareRecord = (recordId: number) => {
    if (recordId === compareA) {
      setCompareA(null);
      return;
    }
    if (recordId === compareB) {
      setCompareB(null);
      return;
    }
    if (compareA == null) {
      setCompareA(recordId);
      return;
    }
    setCompareB(recordId);
    setCompareOpen(true);
  };

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">DBC 数据</h1>
        <div className="topbar-actions">
          <span className="badge badge-gray">只读查看器</span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_400px]">
        <DbcFileList selectedFile={selectedFile} onSelect={selectFile} />
        <DbcRecordsPanel
          file={selectedFile}
          selectedRecordId={selectedRecordId}
          onSelectRecord={setSelectedRecordId}
          compareMode={compareMode}
          compareA={compareA}
          compareB={compareB}
          onToggleCompareMode={toggleCompareMode}
          onCompareRecord={handleCompareRecord}
          onOpenCompare={() => setCompareOpen(true)}
          onClearCompare={clearCompare}
        />
        <DbcRecordDetailPane file={selectedFile} recordId={selectedRecordId} />
      </div>

      {compareOpen &&
        compareA != null &&
        compareB != null &&
        selectedFile != null && (
          <DbcCompareDialog
            file={selectedFile}
            recordAId={compareA}
            recordBId={compareB}
            onClose={() => setCompareOpen(false)}
          />
        )}
    </div>
  );
}
