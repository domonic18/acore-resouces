"""Wowhead 坐骑数据查询服务。

提供基于 Playwright 的 Wowhead 查询能力，支持：
- WotLK 与零售版（retail）自动回退；
- 中文查询失败时使用英文原名查询，再回取中文版数据核对中文名称。
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import TypedDict, cast
from urllib.parse import quote, unquote

from playwright.sync_api import Locator, Page, sync_playwright

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30000
WAIT_AFTER_GOTO = 3


class _ExpansionConfig(TypedDict):
    base_url: str
    spell_prefixes: list[str]
    item_prefixes: list[str]
    npc_prefixes: list[str]


EXPANSIONS: dict[str, _ExpansionConfig] = {
    "wotlk": {
        "base_url": "https://www.wowhead.com/wotlk",
        "spell_prefixes": ["/wotlk/cn/spell=", "/wotlk/spell="],
        "item_prefixes": ["/wotlk/cn/item=", "/wotlk/item="],
        "npc_prefixes": ["/wotlk/cn/npc=", "/wotlk/npc="],
    },
    "retail": {
        "base_url": "https://www.wowhead.com",
        "spell_prefixes": ["/cn/spell=", "/spell="],
        "item_prefixes": ["/cn/item=", "/item="],
        "npc_prefixes": ["/cn/npc=", "/npc="],
    },
}


def _spell_path(expansion: str, locale: str) -> str:
    """根据版本与语言构造法术页路径前缀。"""
    if expansion == "wotlk":
        return "/wotlk/cn/spell=" if locale == "zh" else "/wotlk/spell="
    return "/cn/spell=" if locale == "zh" else "/spell="


def _item_path(expansion: str, locale: str) -> str:
    """根据版本与语言构造物品页路径前缀。"""
    if expansion == "wotlk":
        return "/wotlk/cn/item=" if locale == "zh" else "/wotlk/item="
    return "/cn/item=" if locale == "zh" else "/item="


def _spell_wowhead_url(spell_id: int | None, expansion: str, locale: str) -> str | None:
    """构造法术页 Wowhead URL。"""
    if not spell_id:
        return None
    return f"https://www.wowhead.com{_spell_path(expansion, locale)}{spell_id}"


def _item_wowhead_url(item_id: int | None, expansion: str, locale: str) -> str | None:
    """构造物品页 Wowhead URL。"""
    if not item_id:
        return None
    return f"https://www.wowhead.com{_item_path(expansion, locale)}{item_id}"


def _npc_path(expansion: str, locale: str) -> str:
    """根据版本与语言构造 NPC 页路径前缀。"""
    if expansion == "wotlk":
        return "/wotlk/cn/npc=" if locale == "zh" else "/wotlk/npc="
    return "/cn/npc=" if locale == "zh" else "/npc="


def _npc_wowhead_url(npc_id: int | None, expansion: str, locale: str) -> str | None:
    """构造 NPC 页 Wowhead URL。"""
    if not npc_id:
        return None
    return f"https://www.wowhead.com{_npc_path(expansion, locale)}{npc_id}"


def _build_search_url(query: str, expansion: str, locale: str) -> str:
    """构建带 locale 的搜索 URL。"""
    base_url = EXPANSIONS[expansion]["base_url"]
    return f"{base_url}/search?q={quote(query)}&locale={locale}"


def _extract_id_from_href(href: str, prefix: str) -> int | None:
    """从 Wowhead URL 中提取指定前缀的数字 ID。

    支持的格式：/cn/spell=12345/name、/spell=12345/name、
    /wotlk/cn/spell=12345/name 等。
    """
    if not href:
        return None
    decoded = unquote(href)
    match = re.search(rf"/{prefix}=(\d+)", decoded)
    if match:
        return int(match.group(1))
    return None


def _extract_english_name(body_text: str) -> str | None:
    """从页面文本中提取 '英语：English Name'。"""
    match = re.search(r"英语：\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()
    return None


def _extract_description(body_text: str) -> str | None:
    """从中文页面文本中提取坐骑描述。"""
    match = re.search(r"使用：\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()

    match = re.search(r"(召唤或解散[^\n]+)", body_text)
    if match:
        return match.group(1).strip()

    return None


def _extract_description_en(body_text: str) -> str | None:
    """从英文页面文本中提取坐骑描述。"""
    match = re.search(r"Use:\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()

    match = re.search(r"(Teaches you how to summon and dismiss[^\n]+)", body_text)
    if match:
        return match.group(1).strip()

    return None


def _extract_icon_name(body_text: str) -> str | None:
    """从中文页面文本中提取 '图标：icon_name'。"""
    match = re.search(r"图标：\s*([^\n\s]+)", body_text)
    if match:
        return match.group(1).strip()
    return None


def _extract_icon_name_en(body_text: str) -> str | None:
    """从英文页面文本中提取 'Icon: icon_name'。"""
    match = re.search(r"Icon:\s*([^\n\s]+)", body_text)
    if match:
        return match.group(1).strip()
    return None


def _extract_mount_id(body_text: str) -> int | None:
    """从中文页面文本中提取 '坐骑 ID：{id}'。"""
    match = re.search(r"坐骑 ID：\s*(\d+)", body_text)
    if match:
        return int(match.group(1))
    return None


def _extract_mount_id_en(body_text: str) -> int | None:
    """从英文页面文本中提取 'Mount ID: {id}'。"""
    match = re.search(r"Mount ID:\s*(\d+)", body_text)
    if match:
        return int(match.group(1))
    return None


def _extract_source(body_text: str) -> str | None:
    """从中文页面文本中提取掉落/来源信息。"""
    match = re.search(r"掉落于：\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()
    match = re.search(r"来源：\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()
    return None


def _extract_source_en(body_text: str) -> str | None:
    """从英文页面文本中提取掉落/来源信息。"""
    match = re.search(r"Dropped by:\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()
    match = re.search(r"Source:\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()
    return None


def _extract_item_description(body_text: str) -> str | None:
    """从中文物品页面文本中提取使用描述。"""
    match = re.search(r"使用[:：]\s*(.+?)(?=\n需要|\n掉落|\n来源|$)", body_text, re.DOTALL)
    if match:
        return re.sub(r"\s+", " ", match.group(1).strip())
    return None


def _extract_item_description_en(body_text: str) -> str | None:
    """从英文物品页面文本中提取使用描述。"""
    match = re.search(r"Use:\s*(.+?)(?=\nRequires|\nDropped by|\nSource|$)", body_text, re.DOTALL)
    if match:
        return re.sub(r"\s+", " ", match.group(1).strip())
    return None


_PATCH_BANNER_PATTERN = re.compile(r"增加于|Added in patch")


def _extract_flavor_text(body_text: str) -> str | None:
    """从页面文本中提取引号包裹的风味文本（含中文）。

    跳过补丁横幅行（如 `增加于 4.2 "[Rage of the Firelands]"`），此类引文
    是页面侧栏信息而非物品风味文本。
    """
    for line in body_text.splitlines():
        if _PATCH_BANNER_PATTERN.search(line):
            continue
        for match in re.finditer(r'"([^"]{10,})"', line):
            text = match.group(1)
            if re.search(r"[一-鿿]", text):
                return text.strip()
    return None


def _extract_flavor_text_en(body_text: str) -> str | None:
    """从页面文本中提取引号包裹的风味文本（英文）。"""
    for line in body_text.splitlines():
        if _PATCH_BANNER_PATTERN.search(line):
            continue
        for match in re.finditer(r'"([^"]{20,})"', line):
            text = match.group(1)
            if re.search(r"[a-zA-Z]", text):
                return text.strip()
    return None


_NPC_TYPE_CN_PATTERN = re.compile(
    r"(?:类型|种类)[:：]\s*(野兽|龙类|恶魔|元素|巨人|亡灵|人形生物|人形|小动物|机械|未指定)"
)
_NPC_TYPE_INTRO_PATTERN = re.compile(
    r"是[^。\n]{0,16}?(野兽|龙类|恶魔|元素|巨人|亡灵|人形生物|小动物|机械|未指定)"
)
_NPC_TYPE_EN_TO_CN = {
    "Humanoid": "人形生物",
    "Beast": "野兽",
    "Dragonkin": "龙类",
    "Demon": "恶魔",
    "Elemental": "元素",
    "Giant": "巨人",
    "Undead": "亡灵",
    "Critter": "小动物",
    "Mechanical": "机械",
    "Not specified": "未指定",
}


def _normalize_creature_type_cn(value: str) -> str:
    """页面措辞 '人形' 归一为词表值 '人形生物'。"""
    return "人形生物" if value == "人形" else value


def _extract_creature_type(body_text: str) -> str | None:
    """从中文 NPC 页面文本提取生物类型（映射到 NPC_TYPES 词表值）。"""
    match = _NPC_TYPE_CN_PATTERN.search(body_text)
    if match:
        return _normalize_creature_type_cn(match.group(1))

    match = _NPC_TYPE_INTRO_PATTERN.search(body_text)
    if match:
        return _normalize_creature_type_cn(match.group(1))
    return None


def _extract_creature_type_en(body_text: str) -> str | None:
    """从英文 NPC 页面文本提取生物类型，返回中文词表值。"""
    types = "|".join(_NPC_TYPE_EN_TO_CN)
    match = re.search(rf"Type[:：]\s*({types})", body_text, re.IGNORECASE)
    if match:
        return _NPC_TYPE_EN_TO_CN.get(match.group(1).title())

    match = re.search(rf"is a level[^.\n]{{0,40}}?({types})", body_text, re.IGNORECASE)
    if match:
        return _NPC_TYPE_EN_TO_CN.get(match.group(1).title())
    return None


def _safe_inner_text(locator: Locator) -> str | None:
    """安全地获取 locator 的 inner_text，不存在时返回 None。"""
    try:
        if locator.count() == 0:
            return None
        return locator.first.inner_text().strip()
    except Exception:  # noqa: BLE001
        return None


def _safe_href(locator: Locator) -> str | None:
    """安全地获取第一个匹配元素的 href。"""
    try:
        if locator.count() == 0:
            return None
        return locator.first.get_attribute("href")
    except Exception:  # noqa: BLE001
        return None


def _find_mount_spell_link(
    page: Page,
    query: str,
    prefixes: list[str],
) -> str | None:
    """在搜索结果页定位第一个坐骑法术链接。"""
    links = page.locator("a[href*='/spell=']").all()
    query_lower = query.lower()

    # 优先匹配链接文本包含查询词
    for link in links:
        href = link.get_attribute("href")
        if not href:
            continue
        if any(href.startswith(prefix) for prefix in prefixes):
            text = (link.inner_text() or "").strip()
            if query_lower in text.lower():
                return href

    # 其次返回第一个符合前缀的链接
    for link in links:
        href = link.get_attribute("href")
        if href and any(href.startswith(prefix) for prefix in prefixes):
            return href

    return None


def _find_mount_item_link(
    page: Page,
    query: str,
    prefixes: list[str],
) -> str | None:
    """在搜索结果页定位关联坐骑物品（缰绳）链接。"""
    links = page.locator("a[href*='/item=']").all()

    # 优先匹配“缰绳/Reins”文本
    for link in links:
        href = link.get_attribute("href")
        if not href:
            continue
        if any(href.startswith(prefix) for prefix in prefixes):
            text = (link.inner_text() or "").strip()
            if "缰绳" in text or "Reins" in text:
                return href

    # 其次匹配查询词
    query_lower = query.lower()
    for link in links:
        href = link.get_attribute("href")
        if not href:
            continue
        if any(href.startswith(prefix) for prefix in prefixes):
            text = (link.inner_text() or "").strip()
            if query_lower in text.lower():
                return href

    # 最后返回第一个符合前缀的链接
    for link in links:
        href = link.get_attribute("href")
        if href and any(href.startswith(prefix) for prefix in prefixes):
            return href

    return None


def _goto_with_retry(page: Page, url: str, retries: int = 2) -> None:
    """带重试的页面跳转，使用 domcontentloaded 策略。"""
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=REQUEST_TIMEOUT)
            page.wait_for_load_state("domcontentloaded", timeout=REQUEST_TIMEOUT)
            time.sleep(WAIT_AFTER_GOTO)
            title = page.title() or ""
            if "Static CDN Error" not in title:
                return
            # Wowhead 限流时返回可正常加载的 CDN 错误页，需等待后重试
            last_error = RuntimeError(f"Wowhead CDN 限流页: {url}")
            logger.warning("命中 Wowhead CDN 限流页，第 %d 次重试: %s", attempt + 1, url)
            time.sleep(10 * (attempt + 1))
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("页面加载失败，第 %d 次重试: %s", attempt + 1, exc)
            time.sleep(2)
    raise last_error or RuntimeError(f"无法打开页面: {url}")


def _parse_spell_page(
    page: Page,
    query: str,
    expansion: str,
    locale: str,
) -> dict[str, object]:
    """解析法术详情页，提取字段。"""
    body_text = page.inner_text("body")
    name = _safe_inner_text(page.locator("h1").first) or query
    spell_id = _extract_id_from_href(page.url, "spell")

    name_en = _extract_english_name(body_text)
    description = _extract_description(body_text)
    icon_name = _extract_icon_name(body_text)
    mount_id = _extract_mount_id(body_text)
    source = _extract_source(body_text)

    if locale == "en":
        description = _extract_description_en(body_text) or description
        icon_name = _extract_icon_name_en(body_text) or icon_name
        mount_id = _extract_mount_id_en(body_text) or mount_id
        source = _extract_source_en(body_text) or source
        name_en = name_en or name

    return {
        "name_zh": name if locale == "zh" else None,
        "name_en": name_en,
        "description": description,
        "icon_name": icon_name,
        "spell_id": spell_id,
        "mount_id": mount_id,
        "source": source,
    }


def _parse_item_page(page: Page, locale: str) -> dict[str, object]:
    """解析物品详情页，提取物品描述与风味文本。"""
    body_text = page.inner_text("body")

    item_description = _extract_item_description(body_text)
    flavor_text = _extract_flavor_text(body_text)

    if locale == "en":
        item_description = _extract_item_description_en(body_text) or item_description
        flavor_text = _extract_flavor_text_en(body_text) or flavor_text

    return {
        "item_description": item_description,
        "flavor_text": flavor_text,
    }


def _fetch_item_page(
    page: Page,
    item_id: int | None,
    expansion: str,
    locale: str,
) -> dict[str, object]:
    """根据 item_id 使用已有页面获取物品页面数据。"""
    result: dict[str, object] = {
        "item_description": None,
        "flavor_text": None,
    }
    if not item_id:
        return result

    url = f"https://www.wowhead.com{_item_path(expansion, locale)}{item_id}?locale={locale}"

    try:
        _goto_with_retry(page, url)
        result.update(_parse_item_page(page, locale))
    except Exception as exc:  # noqa: BLE001
        logger.warning("获取物品页面失败: %s", exc)

    return result


def _make_absolute_url(href: str, locale: str) -> str:
    """将搜索结果中的相对 href 补全为绝对 URL 并附加 locale。"""
    if href.startswith("/"):
        href = f"https://www.wowhead.com{href}"
    if "?" not in href:
        href = f"{href}?locale={locale}"
    elif f"locale={locale}" not in href:
        href = f"{href}&locale={locale}"
    return href


def _new_browser_page() -> Page:
    """启动浏览器并返回新页面。"""
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(
        viewport={"width": 1280, "height": 800},
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    )
    # 将 browser 与 playwright 实例绑定到 page，便于关闭
    page._browser = browser  # type: ignore[attr-defined]
    page._playwright = p  # type: ignore[attr-defined]
    return page


def _close_browser_page(page: Page) -> None:
    """关闭浏览器与 playwright 实例。"""
    try:
        page._browser.close()  # type: ignore[attr-defined]
        page._playwright.stop()  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass


def _search_mount_single(query: str, expansion: str, locale: str) -> dict:
    """单次查询：指定版本与语言。"""
    result: dict[str, object] = {
        "query": query,
        "expansion": expansion,
        "locale": locale,
        "url": None,
        "name_zh": None,
        "name_en": None,
        "description": None,
        "icon_name": None,
        "spell_id": None,
        "spell_wowhead_url": None,
        "item_id": None,
        "item_wowhead_url": None,
        "item_description": None,
        "flavor_text": None,
        "mount_id": None,
        "source": None,
        "confidence": "low",
        "error": None,
    }

    config = EXPANSIONS[expansion]
    spell_prefixes = config["spell_prefixes"] if locale == "zh" else [config["spell_prefixes"][-1]]
    item_prefixes = config["item_prefixes"] if locale == "zh" else [config["item_prefixes"][-1]]

    try:
        page = _new_browser_page()
        try:
            search_url = _build_search_url(query, expansion, locale)
            _goto_with_retry(page, search_url)

            mount_href = _find_mount_spell_link(page, query, spell_prefixes)
            if not mount_href:
                result["error"] = f"未在 {expansion} {locale} 搜索结果中找到坐骑法术链接"
                return result

            item_href = _find_mount_item_link(page, query, item_prefixes)
            item_id = _extract_id_from_href(item_href, "item") if item_href else None

            mount_href = _make_absolute_url(mount_href, locale)
            _goto_with_retry(page, mount_href)
            result["url"] = page.url

            parsed = _parse_spell_page(page, query, expansion, locale)
            result.update(parsed)
            result["item_id"] = item_id
            result["spell_wowhead_url"] = _spell_wowhead_url(
                cast(int | None, result.get("spell_id")),
                expansion,
                locale,
            )
            result["item_wowhead_url"] = _item_wowhead_url(
                item_id,
                expansion,
                locale,
            )

            item_page_data = _fetch_item_page(page, item_id, expansion, locale)
            result.update(item_page_data)

            confidence = "low"
            if result["name_en"] and result["description"]:
                confidence = "high"
            elif result["name_zh"] or result["name_en"]:
                confidence = "medium"
            result["confidence"] = confidence

        finally:
            _close_browser_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.exception("查询 Wowhead 时发生错误")
        result["error"] = f"查询异常: {exc}"

    return result


def _search_mount_by_id(spell_id: int, expansion: str, locale: str) -> dict:
    """根据 spell_id 直接获取法术页面数据。"""
    result: dict[str, object] = {
        "query": f"spell_id:{spell_id}",
        "expansion": expansion,
        "locale": locale,
        "url": None,
        "name_zh": None,
        "name_en": None,
        "description": None,
        "icon_name": None,
        "spell_id": spell_id,
        "spell_wowhead_url": None,
        "item_id": None,
        "item_wowhead_url": None,
        "mount_id": None,
        "source": None,
        "confidence": "low",
        "error": None,
    }

    url = f"https://www.wowhead.com{_spell_path(expansion, locale)}{spell_id}?locale={locale}"

    try:
        page = _new_browser_page()
        try:
            _goto_with_retry(page, url)
            result["url"] = page.url
            parsed = _parse_spell_page(page, "", expansion, locale)
            result.update(parsed)
            result["spell_wowhead_url"] = _spell_wowhead_url(
                cast(int | None, result.get("spell_id")),
                expansion,
                locale,
            )

            confidence = "low"
            if result["name_en"] and result["description"]:
                confidence = "high"
            elif result["name_zh"] or result["name_en"]:
                confidence = "medium"
            result["confidence"] = confidence

        finally:
            _close_browser_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.exception("查询 Wowhead 时发生错误")
        result["error"] = f"查询异常: {exc}"

    return result


def search_mount(query: str) -> dict:
    """查询 Wowhead 获取坐骑数据，自动回退版本与语言。

    回退顺序：
    1. WotLK 简体中文；
    2. 零售版简体中文；
    3. 零售版英文，若成功再用 spell_id 取回零售版中文数据核对中文名称。

    Args:
        query: 坐骑中文或英文名称。

    Returns:
        包含查询结果的字典；失败时包含 `error` 字段。
    """
    # 1. WotLK 中文
    result = _search_mount_single(query, "wotlk", "zh")
    if not result.get("error"):
        return result

    # 2. 零售版中文
    result = _search_mount_single(query, "retail", "zh")
    if not result.get("error"):
        return result

    # 3. 零售版英文
    result = _search_mount_single(query, "retail", "en")
    if not result.get("error"):
        spell_id = result.get("spell_id")
        item_id = result.get("item_id")
        if spell_id:
            cn_result = _search_mount_by_id(int(spell_id), "retail", "zh")
            if not cn_result.get("error"):
                # 英文结果保留英文原名，中文结果补全中文名称等字段
                result["name_zh"] = cn_result.get("name_zh") or result.get("name_zh")
                result["description"] = cn_result.get("description") or result.get("description")
                result["icon_name"] = cn_result.get("icon_name") or result.get("icon_name")
                result["mount_id"] = cn_result.get("mount_id") or result.get("mount_id")
                result["source"] = cn_result.get("source") or result.get("source")
                result["url"] = cn_result.get("url") or result.get("url")
                result["spell_wowhead_url"] = cn_result.get("spell_wowhead_url") or result.get(
                    "spell_wowhead_url"
                )
                result["item_wowhead_url"] = cn_result.get("item_wowhead_url") or result.get(
                    "item_wowhead_url"
                )
                result["confidence"] = cn_result.get("confidence") or result.get("confidence")
        if item_id:
            item_page = _new_browser_page()
            try:
                cn_item_data = _fetch_item_page(item_page, int(item_id), "retail", "zh")
                result["item_description"] = cn_item_data.get("item_description") or result.get(
                    "item_description"
                )
                result["flavor_text"] = cn_item_data.get("flavor_text") or result.get("flavor_text")
            finally:
                _close_browser_page(item_page)
        return result

    return result


def search_mount_json(query: str) -> str:
    """查询 Wowhead 并以 JSON 字符串返回结果。

    Args:
        query: 坐骑中文或英文名称。

    Returns:
        JSON 字符串，便于 CLI 直接打印。
    """
    return json.dumps(search_mount(query), ensure_ascii=False, indent=2)


def _find_pet_item_link(
    page: Page,
    query: str,
    prefixes: list[str],
) -> str | None:
    """在搜索结果页定位第一个宠物物品（学习物品）链接。"""
    links = page.locator("a[href*='/item=']").all()
    query_lower = query.lower()

    # 优先匹配链接文本包含查询词
    for link in links:
        href = link.get_attribute("href")
        if not href:
            continue
        if any(href.startswith(prefix) for prefix in prefixes):
            text = (link.inner_text() or "").strip()
            if query_lower in text.lower():
                return href

    # 其次匹配“教你学会召唤”/Teaches companion 等宠物物品提示
    for link in links:
        href = link.get_attribute("href")
        if not href:
            continue
        if any(href.startswith(prefix) for prefix in prefixes):
            text = (link.inner_text() or "").strip()
            if "companion" in text.lower() or "宠物" in text or "伙伴" in text:
                return href

    # 最后返回第一个符合前缀的链接
    for link in links:
        href = link.get_attribute("href")
        if href and any(href.startswith(prefix) for prefix in prefixes):
            return href

    return None


def _find_pet_npc_link(
    page: Page,
    query: str,
    prefixes: list[str],
) -> str | None:
    """在搜索结果页定位第一个宠物 NPC 链接。"""
    links = page.locator("a[href*='/npc=']").all()
    query_lower = query.lower()

    for link in links:
        href = link.get_attribute("href")
        if not href:
            continue
        # 搜索结果可能返回绝对/相对两种 URL，用子串匹配前缀
        if any(prefix in href for prefix in prefixes):
            text = (link.inner_text() or "").strip()
            if query_lower in text.lower():
                return href

    for link in links:
        href = link.get_attribute("href")
        if href and any(prefix in href for prefix in prefixes):
            return href

    return None


def _parse_pet_item_page(
    page: Page,
    query: str,
    expansion: str,
    locale: str,
) -> dict[str, object]:
    """解析宠物物品详情页，提取字段。"""
    body_text = page.inner_text("body")
    name = _safe_inner_text(page.locator("h1").first) or query
    item_id = _extract_id_from_href(page.url, "item")

    name_en = _extract_english_name(body_text)
    icon_name = _extract_icon_name(body_text)
    item_description = _extract_item_description(body_text)
    flavor_text = _extract_flavor_text(body_text)

    if locale == "en":
        icon_name = _extract_icon_name_en(body_text) or icon_name
        item_description = _extract_item_description_en(body_text) or item_description
        flavor_text = _extract_flavor_text_en(body_text) or flavor_text
        name_en = name_en or name

    # 尝试从物品页提取相关 spell/npc 信息
    spell_id: int | None = None
    npc_id: int | None = None
    for link in page.locator("a[href*='/spell=']").all():
        href = link.get_attribute("href")
        if href:
            spell_id = _extract_id_from_href(href, "spell")
            if spell_id:
                break
    for link in page.locator("a[href*='/npc=']").all():
        href = link.get_attribute("href")
        if href:
            npc_id = _extract_id_from_href(href, "npc")
            if npc_id:
                break

    return {
        "name_zh": name if locale == "zh" else None,
        "name_en": name_en,
        "icon_name": icon_name,
        "item_id": item_id,
        "item_wowhead_url": _item_wowhead_url(item_id, expansion, locale),
        "item_description": item_description,
        "flavor_text": flavor_text,
        "spell_id": spell_id,
        "spell_wowhead_url": _spell_wowhead_url(spell_id, expansion, locale),
        "npc_id": npc_id,
    }


def _parse_pet_npc_page(
    page: Page,
    locale: str,
) -> dict[str, object]:
    """解析宠物 NPC 详情页，补全图标与描述。"""
    body_text = page.inner_text("body")
    icon_name = _extract_icon_name(body_text)
    if locale == "en":
        icon_name = _extract_icon_name_en(body_text) or icon_name
    return {"icon_name": icon_name}


def _search_pet_single(query: str, expansion: str, locale: str) -> dict:
    """单次查询：指定版本与语言。"""
    result: dict[str, object] = {
        "query": query,
        "expansion": expansion,
        "locale": locale,
        "url": None,
        "name_zh": None,
        "name_en": None,
        "icon_name": None,
        "spell_id": None,
        "spell_wowhead_url": None,
        "npc_id": None,
        "item_id": None,
        "item_wowhead_url": None,
        "item_description": None,
        "flavor_text": None,
        "source": None,
        "confidence": "low",
        "error": None,
    }

    config = EXPANSIONS[expansion]
    item_prefixes = config["item_prefixes"] if locale == "zh" else [config["item_prefixes"][-1]]
    npc_prefixes = config["npc_prefixes"] if locale == "zh" else [config["npc_prefixes"][-1]]

    try:
        page = _new_browser_page()
        try:
            search_url = _build_search_url(query, expansion, locale)
            _goto_with_retry(page, search_url)

            item_href = _find_pet_item_link(page, query, item_prefixes)
            if not item_href:
                result["error"] = f"未在 {expansion} {locale} 搜索结果中找到宠物物品链接"
                return result

            item_href = _make_absolute_url(item_href, locale)
            _goto_with_retry(page, item_href)
            result["url"] = page.url

            parsed = _parse_pet_item_page(page, query, expansion, locale)
            result.update(parsed)

            # 若物品页图标缺失，尝试取 NPC 页补全
            if not result.get("icon_name"):
                npc_href = _find_pet_npc_link(page, query, npc_prefixes)
                if npc_href:
                    npc_href = _make_absolute_url(npc_href, locale)
                    _goto_with_retry(page, npc_href)
                    npc_data = _parse_pet_npc_page(page, locale)
                    if npc_data.get("icon_name"):
                        result["icon_name"] = npc_data["icon_name"]

            source = _extract_source(page.inner_text("body"))
            if locale == "en":
                source = _extract_source_en(page.inner_text("body")) or source
            result["source"] = source

            confidence = "low"
            if result["name_en"] and result["item_description"]:
                confidence = "high"
            elif result["name_zh"] or result["name_en"]:
                confidence = "medium"
            result["confidence"] = confidence

        finally:
            _close_browser_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.exception("查询 Wowhead 宠物时发生错误")
        result["error"] = f"查询异常: {exc}"

    return result


def _fetch_pet_item_cn(item_id: int) -> dict[str, object]:
    """根据 item_id 获取零售版中文物品页数据，用于补全中文名称。"""
    result: dict[str, object] = {
        "name_zh": None,
        "icon_name": None,
        "item_description": None,
        "flavor_text": None,
        "source": None,
        "url": None,
        "item_wowhead_url": None,
        "spell_wowhead_url": None,
        "error": None,
    }

    try:
        page = _new_browser_page()
        try:
            url = f"https://www.wowhead.com/cn/item={item_id}?locale=zh"
            _goto_with_retry(page, url)
            parsed = _parse_pet_item_page(page, "", "retail", "zh")
            result.update(parsed)
            result["url"] = page.url
            result["item_wowhead_url"] = _item_wowhead_url(item_id, "retail", "zh")
            result["source"] = _extract_source(page.inner_text("body")) or result.get("source")
        finally:
            _close_browser_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.warning("获取宠物中文物品页失败: %s", exc)
        result["error"] = f"查询异常: {exc}"

    return result


def search_pet(query: str) -> dict:
    """查询 Wowhead 获取宠物数据，自动回退版本与语言。

    回退顺序：
    1. WotLK 简体中文；
    2. 零售版简体中文；
    3. 零售版英文，若成功再用 item_id 取回零售版中文数据核对中文名称。

    Args:
        query: 宠物中文或英文名称。

    Returns:
        包含查询结果的字典；失败时包含 `error` 字段。
    """
    # 1. WotLK 中文
    result = _search_pet_single(query, "wotlk", "zh")
    if not result.get("error"):
        return result

    # 2. 零售版中文
    result = _search_pet_single(query, "retail", "zh")
    if not result.get("error"):
        return result

    # 3. 零售版英文
    result = _search_pet_single(query, "retail", "en")
    if not result.get("error"):
        item_id = result.get("item_id")
        if item_id:
            cn_data = _fetch_pet_item_cn(int(item_id))
            if not cn_data.get("error"):
                result["name_zh"] = cn_data.get("name_zh") or result.get("name_zh")
                result["icon_name"] = cn_data.get("icon_name") or result.get("icon_name")
                result["item_description"] = cn_data.get("item_description") or result.get(
                    "item_description"
                )
                result["flavor_text"] = cn_data.get("flavor_text") or result.get("flavor_text")
                result["url"] = cn_data.get("url") or result.get("url")
                result["item_wowhead_url"] = cn_data.get("item_wowhead_url") or result.get(
                    "item_wowhead_url"
                )
                result["spell_wowhead_url"] = cn_data.get("spell_wowhead_url") or result.get(
                    "spell_wowhead_url"
                )
                result["source"] = cn_data.get("source") or result.get("source")
        return result

    return result


def search_pet_json(query: str) -> str:
    """查询 Wowhead 宠物并以 JSON 字符串返回结果。

    Args:
        query: 宠物中文或英文名称。

    Returns:
        JSON 字符串，便于 CLI 直接打印。
    """
    return json.dumps(search_pet(query), ensure_ascii=False, indent=2)


def _clean_npc_display_name(raw: str) -> str:
    """清洗 NPC h1 装饰：去掉头衔 `<...>` 与未翻译方括号标记。"""
    text = re.sub(r"<[^>]*>", "", raw)
    return text.replace("[", "").replace("]", "").strip()


def _parse_npc_page(page: Page, query: str, expansion: str, locale: str) -> dict[str, object]:
    """解析 NPC 详情页，提取名称、ID 与生物类型。"""
    body_text = page.inner_text("body")
    name = _clean_npc_display_name(_safe_inner_text(page.locator("h1").first) or query)
    npc_id = _extract_id_from_href(page.url, "npc")

    name_en = _extract_english_name(body_text)
    creature_type = _extract_creature_type(body_text)
    if locale == "en":
        name_en = name_en or name
        creature_type = _extract_creature_type_en(body_text) or creature_type

    # 中文页 h1 无 CJK 时视为未翻译（Wowhead 方括号标记），名称归入英文
    name_zh = None
    if locale == "zh" and re.search(r"[一-鿿]", name):
        name_zh = name

    return {
        "name_zh": name_zh,
        "name_en": name_en,
        "npc_id": npc_id,
        "npc_wowhead_url": _npc_wowhead_url(npc_id, expansion, locale),
        "creature_type": creature_type,
    }


def _search_npc_single(query: str, expansion: str, locale: str) -> dict:
    """单次 NPC 查询：指定版本与语言。"""
    result: dict[str, object] = {
        "query": query,
        "expansion": expansion,
        "locale": locale,
        "url": None,
        "name_zh": None,
        "name_en": None,
        "npc_id": None,
        "npc_wowhead_url": None,
        "creature_type": None,
        "confidence": "low",
        "error": None,
    }

    config = EXPANSIONS[expansion]
    npc_prefixes = config["npc_prefixes"] if locale == "zh" else [config["npc_prefixes"][-1]]

    try:
        page = _new_browser_page()
        try:
            search_url = _build_search_url(query, expansion, locale)
            _goto_with_retry(page, search_url)

            # 大结果集的 listview 渲染可能超出固定等待，显式等锚点出现
            try:
                page.wait_for_selector("a[href*='/npc=']", timeout=10000)
            except Exception:  # noqa: BLE001
                pass

            npc_href = _find_pet_npc_link(page, query, npc_prefixes)
            if not npc_href:
                result["error"] = f"未在 {expansion} {locale} 搜索结果中找到 NPC 链接"
                return result

            npc_href = _make_absolute_url(npc_href, locale)
            _goto_with_retry(page, npc_href)
            result["url"] = page.url

            parsed = _parse_npc_page(page, query, expansion, locale)
            result.update(parsed)

            confidence = "low"
            if (result["name_zh"] or result["name_en"]) and result["creature_type"]:
                confidence = "high"
            elif result["name_zh"] or result["name_en"]:
                confidence = "medium"
            result["confidence"] = confidence

        finally:
            _close_browser_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.exception("查询 Wowhead NPC 时发生错误")
        result["error"] = f"查询异常: {exc}"

    return result


def _fetch_npc_cn(npc_id: int) -> dict[str, object]:
    """根据 npc_id 获取零售版中文 NPC 页数据，用于补全中文名称。"""
    result: dict[str, object] = {
        "name_zh": None,
        "creature_type": None,
        "url": None,
        "npc_wowhead_url": None,
        "error": None,
    }

    try:
        page = _new_browser_page()
        try:
            url = f"https://www.wowhead.com/cn/npc={npc_id}?locale=zh"
            _goto_with_retry(page, url)
            parsed = _parse_npc_page(page, "", "retail", "zh")
            result.update(parsed)
            result["url"] = page.url
            result["npc_wowhead_url"] = _npc_wowhead_url(npc_id, "retail", "zh")
        finally:
            _close_browser_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.warning("获取 NPC 中文页面失败: %s", exc)
        result["error"] = f"查询异常: {exc}"

    return result


def search_npc(query: str) -> dict:
    """查询 Wowhead 获取 NPC 官方数据，自动回退版本与语言。

    回退顺序：
    1. WotLK 简体中文；
    2. 零售版简体中文；
    3. 零售版英文，若成功再用 npc_id 取回零售版中文页面核对中文名称。

    Args:
        query: NPC 中文或英文名称。

    Returns:
        包含查询结果的字典；失败时包含 `error` 字段。
    """
    # 1. WotLK 中文（未拿到中文名时继续回退，说明该 NPC 中文未翻译）
    result = _search_npc_single(query, "wotlk", "zh")
    if not result.get("error") and result.get("name_zh"):
        return result

    # 2. 零售版中文
    result = _search_npc_single(query, "retail", "zh")
    if not result.get("error") and result.get("name_zh"):
        return result

    # 3. 零售版英文
    result = _search_npc_single(query, "retail", "en")
    if not result.get("error"):
        npc_id = result.get("npc_id")
        if npc_id:
            cn_data = _fetch_npc_cn(int(npc_id))
            if not cn_data.get("error"):
                result["name_zh"] = cn_data.get("name_zh") or result.get("name_zh")
                result["creature_type"] = cn_data.get("creature_type") or result.get(
                    "creature_type"
                )
                result["url"] = cn_data.get("url") or result.get("url")
                result["npc_wowhead_url"] = cn_data.get("npc_wowhead_url") or result.get(
                    "npc_wowhead_url"
                )
        return result

    return result


def search_npc_json(query: str) -> str:
    """查询 Wowhead NPC 并以 JSON 字符串返回结果。

    Args:
        query: NPC 中文或英文名称。

    Returns:
        JSON 字符串，便于 CLI 直接打印。
    """
    return json.dumps(search_npc(query), ensure_ascii=False, indent=2)
