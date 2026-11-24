"""载具 / 挂件 / 特性标签与构建产物的一致性校验。

从 validate_job 中按主题拆出：载具记录与座位槽位、商贩/修理/拍卖行挂件
标签、水面行走/水下骑乘特性第三效果三组校验，均围绕资源 YAML 的
special_features / vehicle 配置展开。
"""

from __future__ import annotations

from typing import Any

import app.services.mount_patch_builder as _facade
from app.schemas.resource import Mount
from app.schemas.vehicle import (
    OFFICIAL_AUCTIONEER_NPCS,
    OFFICIAL_MULTI_SEAT_VEHICLE_IDS,
    OFFICIAL_REPAIR_NPCS,
    OFFICIAL_VENDOR_NPCS,
    VehicleConfig,
)

from ._checks import ValidationResult, _find_sql_record


def _check_vehicle_consistency(
    resource: Mount,
    sql_plan: dict[str, Any],
    checks: list[ValidationResult],
) -> None:
    """校验载具 DBC/SQL 记录、座位槽位与登载法术（resource.vehicle 非空时调用）。"""
    vehicle = resource.vehicle
    if vehicle is None:
        return
    ct_entry = resource.db.creature_template.entry

    ct_sql_record = _find_sql_record(sql_plan, "creature_template") or {}
    checks.append(
        ValidationResult(
            name="vehicle_id_matches_creature_template_sql",
            passed=ct_sql_record.get("VehicleId") == vehicle.vehicle_id,
            expected=vehicle.vehicle_id,
            actual=ct_sql_record.get("VehicleId"),
            message="creature_template.VehicleId 必须与 vehicle.vehicle_id 一致",
        )
    )

    vehicle_record = _facade._record_by_id(_facade.WOW_DBC_DIR / "Vehicle.dbc", vehicle.vehicle_id)
    if vehicle.vehicle_id in OFFICIAL_MULTI_SEAT_VEHICLE_IDS:
        checks.append(
            ValidationResult(
                name="vehicle_dbc_record_matches_plan",
                passed=vehicle_record is not None,
                expected="官方多座载具记录存在",
                actual="存在" if vehicle_record is not None else "缺失",
                message="复用的官方 Vehicle.dbc 记录必须存在",
            )
        )
        official_seat_count = 2
    else:
        seat_plan = {
            f"SeatID_{index + 1}": seat_id for index, seat_id in enumerate(vehicle.seat_ids)
        }
        actual_seats = (
            {key: vehicle_record.get(key) for key in seat_plan}
            if vehicle_record is not None
            else None
        )
        checks.append(
            ValidationResult(
                name="vehicle_dbc_record_matches_plan",
                passed=vehicle_record is not None and actual_seats == seat_plan,
                expected=seat_plan,
                actual=actual_seats,
                message="自建 Vehicle.dbc 记录必须存在且 SeatID 槽位与计划一致",
            )
        )
        official_seat_count = 0

    expected_seats: int | None = None
    if "双人骑乘" in resource.special_features:
        expected_seats = 1
    if "三人骑乘" in resource.special_features:
        expected_seats = 2
    actual_seat_count = (
        official_seat_count
        if vehicle.vehicle_id in OFFICIAL_MULTI_SEAT_VEHICLE_IDS
        else len(vehicle.passenger_seat_ids)
    )
    if expected_seats is None:
        checks.append(
            ValidationResult(
                name="vehicle_seat_count_matches_special_features",
                passed=False,
                expected="special_features 标注 双人骑乘/三人骑乘",
                actual=resource.special_features,
                message="配置了 vehicle 但 special_features 未标注双人/三人骑乘",
                severity="warning",
            )
        )
    else:
        checks.append(
            ValidationResult(
                name="vehicle_seat_count_matches_special_features",
                passed=actual_seat_count == expected_seats,
                expected=expected_seats,
                actual=actual_seat_count,
                message="载具乘客座位数必须与 special_features 标注一致（双人=1，三人=2）",
            )
        )

    # 挂件座位须指向 Vehicle.dbc 记录中非零的 SeatID 槽位
    # （官方 312 乘客槽位在 SeatID_2/3，315 在 SeatID_1/2）
    for accessory in vehicle.accessories:
        seat_field = f"SeatID_{accessory.seat_id + 1}"
        seat_value = vehicle_record.get(seat_field) if vehicle_record else None
        checks.append(
            ValidationResult(
                name=f"vehicle_accessory_seat_in_range_{accessory.accessory_entry}",
                passed=bool(seat_value),
                expected=f"{seat_field} 非零",
                actual=seat_value,
                message=(
                    f"挂件 accessory_entry={accessory.accessory_entry} 的座位槽位 "
                    f"{seat_field} 必须在 Vehicle.dbc 记录中非零"
                ),
            )
        )

    spellclick_record = _facade._record_by_id(
        _facade.WOW_DBC_DIR / "Spell.dbc", vehicle.spellclick_spell_id
    )
    checks.append(
        ValidationResult(
            name="spellclick_spell_exists",
            passed=spellclick_record is not None,
            expected=vehicle.spellclick_spell_id,
            actual="存在" if spellclick_record is not None else "缺失",
            message="登载法术（npc_spellclick_spells.spell_id）必须存在于 Spell.dbc",
        )
    )

    sc_record = _find_sql_record(sql_plan, "npc_spellclick_spells") or {}
    checks.append(
        ValidationResult(
            name="npc_spellclick_sql_present",
            passed=(
                sc_record.get("npc_entry") == ct_entry
                and sc_record.get("spell_id") == vehicle.spellclick_spell_id
            ),
            expected={"npc_entry": ct_entry, "spell_id": vehicle.spellclick_spell_id},
            actual=sc_record or None,
            message="SQL 计划必须包含与 creature_template.entry 一致的 npc_spellclick_spells 记录",
        )
    )


def _check_accessory_tag_consistency(
    resource: Mount,
    vehicle: VehicleConfig | None,
    checks: list[ValidationResult],
) -> None:
    """挂件能力与特性标签一致性（工作流 07/08）。

    商人/修理/拍卖行标签须有对应官方挂件（需先配置 vehicle）；
    未标注却挂官方商贩/拍卖师降级 warning。
    """
    accessory_entries = [a.accessory_entry for a in vehicle.accessories] if vehicle else []
    accessory_specs = [
        (
            "accessory_vendor_matches_special_features",
            "自带商人",
            OFFICIAL_VENDOR_NPCS | OFFICIAL_REPAIR_NPCS,
            "官方商贩挂件（杂货 32638/32642、材料/修理 32639/32641）",
            "商贩挂件",
        ),
        (
            "accessory_repair_matches_special_features",
            "修理",
            OFFICIAL_REPAIR_NPCS,
            "修理商挂件（材料/修理 32639/32641）",
            "修理商挂件",
        ),
        (
            "accessory_auctioneer_matches_special_features",
            "自带拍卖行",
            OFFICIAL_AUCTIONEER_NPCS,
            "拍卖师挂件（联盟 8670、部落 8673、中立 8661）",
            "拍卖师挂件",
        ),
    ]
    for check_name, tag, npc_pool, expected_text, label in accessory_specs:
        tagged = tag in resource.special_features
        matched = sorted({e for e in accessory_entries if e in npc_pool})
        checks.append(
            ValidationResult(
                name=check_name,
                passed=bool(matched) if tagged else not matched,
                expected=expected_text if tagged else f"无{label}",
                actual=matched or "缺失",
                message=(
                    f"{tag}标签要求载具挂载对应{label}（需先配置 vehicle）"
                    if tagged
                    else f"未标注「{tag}」却挂载了{label}"
                ),
                severity="error" if tagged else "warning",
            )
        )


def _check_spell_feature_effects(
    resource: Mount,
    checks: list[ValidationResult],
) -> None:
    """特性第三效果校验（工作流 03/04）。

    水面行走/水下骑乘标签必须体现在构建后的召唤法术记录上；
    未标注却出现对应光环降级为 warning 提示。
    """
    spell_id = resource.dbc.spell.id
    summon_record = (
        _facade._record_by_id(_facade.WOW_DBC_DIR / "Spell.dbc", spell_id) if spell_id else None
    )
    features = resource.special_features
    water_walk_tagged = "水面行走" in features
    water_walk_present = bool(
        summon_record
        and summon_record.get("Effect_3") == 6
        and summon_record.get("EffectAura_3") == 104
    )
    checks.append(
        ValidationResult(
            name="spell_water_walk_effect_matches_special_features",
            passed=water_walk_present if water_walk_tagged else not water_walk_present,
            expected=("Effect_3=6, EffectAura_3=104" if water_walk_tagged else "无水面行走光环"),
            actual="存在" if water_walk_present else "缺失",
            message="水面行走标签要求召唤法术第三效果为 WATER_WALK(104)",
            severity="error" if water_walk_tagged else "warning",
        )
    )

    swim_tagged = "水下骑乘" in features
    expected_swim_base_points = (resource.dbc.spell.swim_speed or 60) - 1
    swim_base_points = [
        summon_record.get(f"EffectBasePoints_{slot}")
        for slot in (1, 2, 3)
        if summon_record and summon_record.get(f"EffectAura_{slot}") == 58
    ]
    swim_ok = bool(swim_base_points) and all(
        bp == expected_swim_base_points for bp in swim_base_points
    )
    checks.append(
        ValidationResult(
            name="spell_swim_effect_matches_special_features",
            passed=swim_ok if swim_tagged else not swim_base_points,
            expected=(
                f"游泳光环(58) EffectBasePoints={expected_swim_base_points}"
                if swim_tagged
                else "无游泳速度光环"
            ),
            actual=swim_base_points or "缺失",
            message="水下骑乘标签要求召唤法术带游泳速度光环且数值与 swim_speed 一致",
            severity="error" if swim_tagged else "warning",
        )
    )
