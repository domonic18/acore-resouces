"""多人骑乘载具配置 schema。

对应 docs/workflows/02多人骑乘坐骑制作流程.md：坐骑 YAML 顶层 `vehicle` 块，
补丁管线据此生成 Vehicle.dbc 记录（自建）、creature_template.VehicleId、
npc_spellclick_spells 与 vehicle_template_accessory SQL。
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

OFFICIAL_MULTI_SEAT_VEHICLE_IDS = (312, 315)

DEFAULT_SPELLCLICK_SPELL_ID = 46598


class VehicleAccessory(BaseModel):
    """载具挂件 NPC（vehicle_template_accessory 行）。

    seat_id 为 Vehicle.dbc 的 SeatID 槽位下标（0 起，即 SeatID_{seat_id+1}）。
    """

    accessory_entry: int = Field(gt=0)
    seat_id: int = Field(ge=0, le=7)
    minion: int = 0
    summontype: int = 6
    summontimer: int = 30000


class VehicleConfig(BaseModel):
    """多人骑乘载具配置。

    vehicle_id 取 312/315 表示复用官方多座载具（零 DBC 改动）；
    其他值（项目号段 90000 起）表示自建 Vehicle.dbc 记录，此时 seat_ids 必填。
    """

    vehicle_id: int = Field(gt=0)
    seat_ids: list[int] = Field(default_factory=list)
    spellclick_spell_id: int = DEFAULT_SPELLCLICK_SPELL_ID
    accessories: list[VehicleAccessory] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_custom_seats(self) -> VehicleConfig:
        """自建载具记录必须声明乘客座位（复用官方 312/315 时忽略）。"""
        if self.vehicle_id in OFFICIAL_MULTI_SEAT_VEHICLE_IDS:
            return self
        if not self.seat_ids:
            raise ValueError("自建 Vehicle.dbc 记录必须提供 seat_ids（乘客座位 ID 列表）")
        if len(self.seat_ids) > 8:
            raise ValueError("seat_ids 最多 8 个（Vehicle.dbc SeatID_1..8）")
        return self
