import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { cn } from "@/shared/utils";
import { DBC_TABS } from "../../constants";
import { getTabData } from "../../lib/detail-helpers";

interface RawDataSectionProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  liveDbc: Record<string, unknown>;
  liveDb: Record<string, unknown>;
}

export function RawDataSection({
  activeTab,
  setActiveTab,
  liveDbc,
  liveDb,
}: RawDataSectionProps) {
  return (
    <SectionCard title="明细数据">
      <div className="card-body">
        <div className="tabs mb-5 px-0">
          {DBC_TABS.map((tab) => (
            <button
              key={tab.key}
              className={cn("tab", activeTab === tab.key && "active")}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <FormGroup label="原始 JSON 数据" className="full-width">
          <textarea
            className="form-textarea font-mono text-xs"
            rows={12}
            value={getTabData({ dbc: liveDbc, db: liveDb }, activeTab)}
            readOnly
          />
          <p className="form-hint">上方区域修改时，本明细会同步更新</p>
        </FormGroup>
      </div>
    </SectionCard>
  );
}
