import { useMemo, useState } from "react";
import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { FieldHint } from "@/components/form/FieldHint";
import { useFieldReference } from "@/features/resources/hooks/useFieldReference";
import { useLinkedFieldValue } from "../../hooks/useLinkedFieldValue";
import { isRequiredEmpty, REQUIRED_FIELD_HINT } from "../../requiredFields";
import { cn } from "@/shared/utils";
import type { Resource } from "@/shared/types";
import { IconEditor } from "./IconEditor";
import { LinkedIdField } from "./LinkedIdField";
import { IdOriginBadge } from "./IdOriginBadge";

interface SpellInfoSectionProps {
  spellIcon: string;
  setSpellIcon: (value: string) => void;
  spellWowheadUrl: string;
  setSpellWowheadUrl: (value: string) => void;
  setPickerTarget: (target: "item" | "spell") => void;
  iconNames: string[];
  spellDbc: Record<string, unknown>;
  setSpellDbc: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  spellDb: Record<string, unknown>;
  setSpellDb: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  resourceType: Resource["resource_type"];
  mountType: string;
  compact?: boolean;
}

export function SpellInfoSection({
  spellIcon,
  setSpellIcon,
  spellWowheadUrl,
  setSpellWowheadUrl,
  setPickerTarget,
  iconNames,
  spellDbc,
  setSpellDbc,
  spellDb,
  setSpellDb,
  resourceType,
  mountType,
  compact,
}: SpellInfoSectionProps) {
  const getReference = useFieldReference(resourceType);
  const iconRefValue = getReference("dbc.spell.icon_id")?.value ?? null;
  const minLevelRefValue =
    getReference("db.creature_template.minlevel")?.value ?? null;
  const maxLevelRefValue =
    getReference("db.creature_template.maxlevel")?.value ?? null;
  const speedRefValue = getReference("dbc.spell.speed")?.value ?? null;
  const flightSpeedRefValue =
    getReference("dbc.spell.flight_speed")?.value ?? null;
  const swimSpeedRefValue = getReference("dbc.spell.swim_speed")?.value ?? null;

  const isFlying = mountType === "飞行坐骑";
  const isWater = mountType === "水上坐骑";

  const [visualIdLocked, setVisualIdLocked] = useState(true);
  const spellIdInvalid = isRequiredEmpty(spellDbc.id);
  const creatureEntryInvalid = isRequiredEmpty(spellDb.entry);
  const creatureNameInvalid = isRequiredEmpty(spellDb.name);

  const liveCreatureEntry = useMemo(() => {
    const raw = spellDb.entry;
    const n = Number(raw);
    return raw !== null && raw !== undefined && raw !== "" && !Number.isNaN(n)
      ? n
      : null;
  }, [spellDb]);

  useLinkedFieldValue(
    visualIdLocked,
    liveCreatureEntry,
    "visual_id",
    setSpellDbc,
  );

  return (
    <SectionCard title="技能信息" compact={compact}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <IconEditor
            label="Spell 图标"
            value={spellIcon}
            iconNames={iconNames}
            onChange={setSpellIcon}
            onOpenPicker={() => setPickerTarget("spell")}
            compact
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <FormGroup
              label={
                <>
                  DBC ID{" "}
                  <IdOriginBadge
                    value={spellDbc.id}
                    type="spell"
                    wowheadUrl={spellWowheadUrl}
                  />
                </>
              }
              compact={compact}
              hint={
                <FieldHint description="自定义坐骑法术 ID，按 80000+资源ID 生成，注意避开官方法术段位" />
              }
              error={spellIdInvalid ? REQUIRED_FIELD_HINT : undefined}
            >
              <NumberInput
                value={spellDbc.id}
                onChange={(v) => setSpellDbc((prev) => ({ ...prev, id: v }))}
                compact={compact}
                invalid={spellIdInvalid}
              />
            </FormGroup>
            <FormGroup
              label={
                <>
                  DB entry
                </>
              }
              compact={compact}
              hint={
                <FieldHint description="数据库侧挂骑生物 entry（creature_template.entry），自定义段 9140000+资源ID，法术 Visual ID 默认跟随此值" />
              }
              error={creatureEntryInvalid ? REQUIRED_FIELD_HINT : undefined}
            >
              <NumberInput
                value={spellDb.entry}
                onChange={(v) => setSpellDb((prev) => ({ ...prev, entry: v }))}
                compact={compact}
                invalid={creatureEntryInvalid}
              />
            </FormGroup>
          </div>
        </div>

        <FormGroup
          label="Wowhead 法术页 URL"
          compact={compact}
          hint={
            <FieldHint description="官方法术页链接（wowhead.com/spell=ID），用于数据核对与官方信息补全" />
          }
        >
          <input
            type="text"
            className={cn(compact ? "form-input-compact" : "form-input")}
            value={spellWowheadUrl}
            onChange={(e) => setSpellWowheadUrl(e.target.value)}
            placeholder="https://www.wowhead.com/spell=..."
          />
        </FormGroup>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Spell DBC
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup
                label="Name"
                compact={compact}
                hint={
                  <FieldHint description="法术名称，客户端中显示；建议与基础信息中的官方译名一致" />
                }
              >
                <input
                  type="text"
                  className={cn(compact ? "form-input-compact" : "form-input")}
                  value={String(spellDbc.name ?? "")}
                  onChange={(e) =>
                    setSpellDbc((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </FormGroup>
              <FormGroup
                label="Icon ID"
                compact={compact}
                hint={
                  <FieldHint
                    description="法术图标在 SpellIcon.dbc 中的记录 ID，需要 icon_name → icon_id 映射；暂无可靠自动映射，可参考已添加坐骑的常见值"
                    reference={getReference("dbc.spell.icon_id")}
                    onApply={
                      iconRefValue !== null
                        ? () =>
                            setSpellDbc((prev) => ({
                              ...prev,
                              icon_id: Number(iconRefValue),
                            }))
                        : undefined
                    }
                  />
                }
              >
                <NumberInput
                  value={spellDbc.icon_id}
                  onChange={(v) =>
                    setSpellDbc((prev) => ({ ...prev, icon_id: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="Visual ID"
                compact={compact}
                hint={
                  <FieldHint description="挂骑生物的 creature entry（自定义段 9140000+资源ID），默认自动跟随下方生物 entry（creature_template.entry），解锁后可手动覆盖" />
                }
              >
                <LinkedIdField
                  value={visualIdLocked ? liveCreatureEntry : spellDbc.visual_id}
                  linkedLabel="生物 entry → creature_template.entry"
                  locked={visualIdLocked}
                  onToggleLock={() => setVisualIdLocked((prev) => !prev)}
                  onChange={(v) =>
                    setSpellDbc((prev) => ({ ...prev, visual_id: v }))
                  }
                  compact={compact}
                />
              </FormGroup>

              {!isWater && (
                <FormGroup
                  label="陆地移动速度 (%)"
                  compact={compact}
                  hint={
                    <FieldHint
                      description="地面移动速度百分比（100 为默认跑速），对应移动速度光环 EffectBasePoints；飞行坐骑陆上行走也用此值。留空使用模板默认 100"
                      reference={getReference("dbc.spell.speed")}
                      onApply={
                        speedRefValue !== null
                          ? () =>
                              setSpellDbc((prev) => ({
                                ...prev,
                                speed: Number(speedRefValue),
                              }))
                          : undefined
                      }
                    />
                  }
                >
                  <NumberInput
                    value={spellDbc.speed}
                    onChange={(v) => setSpellDbc((prev) => ({ ...prev, speed: v }))}
                    compact={compact}
                  />
                </FormGroup>
              )}

              {isFlying && (
                <FormGroup
                  label="飞行移动速度 (%)"
                  compact={compact}
                  hint={
                    <FieldHint
                      description="飞行状态移动速度百分比，官方档位 280/310。留空默认 280"
                      reference={getReference("dbc.spell.flight_speed")}
                      onApply={
                        flightSpeedRefValue !== null
                          ? () =>
                              setSpellDbc((prev) => ({
                                ...prev,
                                flight_speed: Number(flightSpeedRefValue),
                              }))
                          : undefined
                      }
                    />
                  }
                >
                  <NumberInput
                    value={spellDbc.flight_speed}
                    onChange={(v) =>
                      setSpellDbc((prev) => ({ ...prev, flight_speed: v }))
                    }
                    compact={compact}
                  />
                </FormGroup>
              )}

              {isWater && (
                <FormGroup
                  label="游泳移动速度 (%)"
                  compact={compact}
                  hint={
                    <FieldHint
                      description="游泳速度百分比（模板默认 60），仅在水中生效"
                      reference={getReference("dbc.spell.swim_speed")}
                      onApply={
                        swimSpeedRefValue !== null
                          ? () =>
                              setSpellDbc((prev) => ({
                                ...prev,
                                swim_speed: Number(swimSpeedRefValue),
                              }))
                          : undefined
                      }
                    />
                  }
                >
                  <NumberInput
                    value={spellDbc.swim_speed}
                    onChange={(v) =>
                      setSpellDbc((prev) => ({ ...prev, swim_speed: v }))
                    }
                    compact={compact}
                  />
                </FormGroup>
              )}

              <FormGroup
                label="法术描述"
                compact={compact}
                className="sm:col-span-2"
                hint={
                  <FieldHint description="游戏内法术悬停提示文本，导出写入 Description_Lang；留空时按坐骑类型自动生成（如「召唤或解散一只可供骑乘的XX。只能在外域或诺森德召唤这种坐骑。」）" />
                }
              >
                <textarea
                  rows={2}
                  className="form-textarea"
                  value={String(spellDbc.description ?? "")}
                  onChange={(e) =>
                    setSpellDbc((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </FormGroup>
            </div>
          </div>

          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Spell 数据库（creature_template）
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup
                label="name"
                compact={compact}
                hint={
                  <FieldHint description="坐骑生物在游戏中的名称，建议与官方译名一致" />
                }
                error={creatureNameInvalid ? REQUIRED_FIELD_HINT : undefined}
              >
                <input
                  type="text"
                  className={cn(
                    compact ? "form-input-compact" : "form-input",
                    creatureNameInvalid && "form-input-invalid",
                  )}
                  aria-invalid={creatureNameInvalid || undefined}
                  value={String(spellDb.name ?? "")}
                  onChange={(e) =>
                    setSpellDb((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </FormGroup>
              <FormGroup
                label="modelid1"
                compact={compact}
                hint={
                  <FieldHint description="生物主显示信息 ID，引用 CreatureDisplayInfo 记录（140000+资源ID 段）" />
                }
              >
                <NumberInput
                  value={spellDb.modelid1}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, modelid1: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="modelid2"
                compact={compact}
                hint={
                  <FieldHint description="生物备用显示信息 ID，无备选模型时留 0" />
                }
              >
                <NumberInput
                  value={spellDb.modelid2}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, modelid2: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="minlevel"
                compact={compact}
                hint={
                  <FieldHint
                    description="生物最低等级，坐骑模板常见值 1"
                    reference={getReference("db.creature_template.minlevel")}
                    onApply={
                      minLevelRefValue !== null
                        ? () =>
                            setSpellDb((prev) => ({
                              ...prev,
                              minlevel: Number(minLevelRefValue),
                            }))
                        : undefined
                    }
                  />
                }
              >
                <NumberInput
                  value={spellDb.minlevel}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, minlevel: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="maxlevel"
                compact={compact}
                hint={
                  <FieldHint
                    description="生物最高等级，坐骑模板常见值 2"
                    reference={getReference("db.creature_template.maxlevel")}
                    onApply={
                      maxLevelRefValue !== null
                        ? () =>
                            setSpellDb((prev) => ({
                              ...prev,
                              maxlevel: Number(maxLevelRefValue),
                            }))
                        : undefined
                    }
                  />
                }
              >
                <NumberInput
                  value={spellDb.maxlevel}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, maxlevel: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
