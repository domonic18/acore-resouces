"""Wowhead 页面文本提取函数的单元测试。"""

from app.services.wowhead import _extract_flavor_text, _extract_flavor_text_en


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
