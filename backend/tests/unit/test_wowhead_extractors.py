"""Wowhead 页面文本提取函数的单元测试。"""

from app.services.wowhead import (
    _clean_npc_display_name,
    _extract_creature_type,
    _extract_creature_type_en,
    _extract_flavor_text,
    _extract_flavor_text_en,
)


def test_npc_display_name_strips_title_and_brackets() -> None:
    assert _clean_npc_display_name("[Alexstrasza] <[The Life-Binder]>") == "Alexstrasza"
    assert _clean_npc_display_name("格罗布鲁斯") == "格罗布鲁斯"
    assert _clean_npc_display_name("阿努巴拉克 <蜘蛛之王>") == "阿努巴拉克"


def test_flavor_skips_patch_banner_cn() -> None:
    body = "增加于 4.2 \"[Rage of the Firelands]\"\n使用: 教你学会召唤这种小伙伴。"
    assert _extract_flavor_text(body) is None


def test_flavor_skips_patch_banner_en() -> None:
    body = 'Added in patch 4.0.3 "The Shattering"\nUse: Teaches you how to summon this companion.'
    assert _extract_flavor_text_en(body) is None


def test_flavor_finds_cjk_quote() -> None:
    body = "使用: 召唤小伙伴。\n\"虽然体型变小了，小拉格依然是一团暴躁的破坏之力。\"\n需要等级 1"
    assert _extract_flavor_text(body) == "虽然体型变小了，小拉格依然是一团暴躁的破坏之力。"


def test_flavor_finds_english_quote() -> None:
    body = 'Use: Teaches you how to summon this companion.\n"A tiny ball of fiery rage."\nRequires level 1'
    assert _extract_flavor_text_en(body) == "A tiny ball of fiery rage."


def test_flavor_missing_returns_none() -> None:
    assert _extract_flavor_text("没有任何引文的内容") is None
    assert _extract_flavor_text_en("plain text without quotes") is None


def test_creature_type_infobox_cn() -> None:
    body = "阿莱克丝塔萨\n等级：??\n类型：龙类\n这个NPC能在诺森德找到。"
    assert _extract_creature_type(body) == "龙类"


def test_creature_type_infobox_humanoid_normalized() -> None:
    body = "卫兵\n等级：85\n类型：人形\n暴风城卫兵是85级人形生物。"
    assert _extract_creature_type(body) == "人形生物"


def test_creature_type_intro_sentence_cn() -> None:
    body = "水之魂图腾是1级元素，可以在杜隆塔尔找到。"
    assert _extract_creature_type(body) == "元素"


def test_creature_type_missing_returns_none_cn() -> None:
    assert _extract_creature_type("这个页面没有任何类型信息") is None


def test_creature_type_en() -> None:
    assert _extract_creature_type_en("Type: Humanoid\nHar'koa is a level 82 NPC.") == "人形生物"
    assert (
        _extract_creature_type_en("Frostwolf Pup is a level 30 Critter that can be found.")
        == "小动物"
    )


def test_creature_type_en_case_insensitive() -> None:
    assert _extract_creature_type_en("is a level 77 - 82 undead") == "亡灵"


def test_creature_type_missing_returns_none_en() -> None:
    assert _extract_creature_type_en("no type information here at all") is None
