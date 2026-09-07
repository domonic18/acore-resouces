import { useState } from "react";
import { MpqArchiveList } from "@/features/mpq/components/MpqArchiveList";
import { MpqFileTree } from "@/features/mpq/components/MpqFileTree";
import { MpqContentPanel } from "@/features/mpq/components/MpqContentPanel";

export function MpqPage() {
  const [selectedArchive, setSelectedArchive] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const selectArchive = (relPath: string) => {
    setSelectedArchive((prev) => {
      if (prev !== relPath) {
        setSelectedPath(null);
      }
      return relPath;
    });
  };

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">MPQ 查看</h1>
        <div className="topbar-actions">
          <span className="badge badge-gray">只读查看器</span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[300px_320px_minmax(0,1fr)]">
        <MpqArchiveList selected={selectedArchive} onSelect={selectArchive} />
        <MpqFileTree
          archive={selectedArchive}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
        />
        <MpqContentPanel archive={selectedArchive} path={selectedPath} />
      </div>
    </div>
  );
}
