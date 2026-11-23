"""多人骑乘载具配置 schema。

对应 docs/workflows/02多人骑乘坐骑制作流程.md：坐骑 YAML 顶层 `vehicle` 块，
补丁管线据此生成 Vehicle.dbc 记录（自建）、creature_template.VehicleId、
npc_spellclick_spells 与 vehicle_template_accessory SQL。
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

OFFICIAL_MULTI_SEAT_VEHICLE_IDS = (312, 315)

DEFAULT_SPELLCLICK_SPELL_ID = 46598

# 官方挂件 NPC（docs/workflows/07 §3.1 / 08 §1 实测，本地 acore_world 核对）。
# 杂货商卖弹药/食物，材料/修理商含 REPAIR；拍卖师 faction 决定连接的拍卖行。
OFFICIAL_VENDOR_NPCS = frozenset({32638, 32642})  # Hakmud of Argus（联盟）/ Mojodishu（部落）
OFFICIAL_REPAIR_NPCS = frozenset({32639, 32641})  # Gnimo（联盟）/ Drix Blackwrench（部落）
OFFICIAL_AUCTIONEER_NPCS = frozenset({8670, 8673, 8661})  # 联盟 / 部落 / 中立（藏宝海湾系）


class VehicleAccessory(BaseModel):
    """载具挂件 NPC（vehicle_template_accessory 行）。

    seat_id 为 Vehicle.dbc 的 SeatID 槽位下标（0 起，即 SeatID_{seat_id+1}）。
    """

    accessory_entry: int = Field(gt=0)
    seat_id: int = Field(ge=0, le=7)
    minion: int = 0
    summontype: int = 6
    summontimer: int = 30000


class VehicleSeatSpec(BaseModel):
    """自建 VehicleSeat.dbc 记录（乘客位的挂点）。

    attachment_id 为模型骨骼索引；官方座位只覆盖到骨骼 21，
    而载具模型的骨骼可以到 50+，想挂在模型后半段必须自建记录。
    offset_x/y/z 是相对挂点的偏移（米），可用来微调座位落点。
    """

    id: int = Field(gt=0)
    attachment_id: int = Field(ge=-1)
    offset_x: float = 0.0
    offset_y: float = 0.0
    offset_z: float = 0.0


class VehicleConfig(BaseModel):
    """多人骑乘载具配置。

    vehicle_id 取 312/315 表示复用官方多座载具（零 DBC 改动）；
    其他值（项目号段 90000 起）表示自建 Vehicle.dbc 记录，此时 seat_ids 必填。
    """

    vehicle_id: int = Field(gt=0)
    seat_ids: list[int] = Field(default_factory=list)
    spellclick_spell_id: int = DEFAULT_SPELLCLICK_SPELL_ID
    accessories: list[VehicleAccessory] = Field(default_factory=list)
    seats: list[VehicleSeatSpec] = Field(
        default_factory=list, description="自建 VehicleSeat.dbc 记录（座位挂点）"
    )

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

    @property
    def passenger_seat_ids(self) -> list[int]:
        """乘客座位 ID 列表。

        seat_ids 按 Vehicle.dbc 的 SeatID_1..8 顺序排列，元素 0 表示该槽位留空
        （官方 312 就是这个形态：SeatID_1=0，驾驶位没有独立的 VehicleSeat 记录，
        玩家骑在载具本体上）。因此乘客位数 = 非零槽位数。
        """
        return [seat_id for seat_id in self.seat_ids if seat_id]
