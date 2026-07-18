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
from typing import TypedDict
from urllib.parse import quote, unquote

from playwright.sync_api import Locator, Page, sync_playwright

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30000
WAIT_AFTER_GOTO = 3


class _ExpansionConfig(TypedDict):
    base_url: str
    spell_prefixes: list[str]
    item_prefixes: list[str]


EXPANSIONS: dict[str, _ExpansionConfig] = {
    "wotlk": {
        "base_url": "https://www.wowhead.com/wotlk",
        "spell_prefixes": ["/wotlk/cn/spell=", "/wotlk/spell="],
        "item_prefixes": ["/wotlk/cn/item=", "/wotlk/item="],
    },
    "retail": {
        "base_url": "https://www.wowhead.com",
        "spell_prefixes": ["/cn/spell=", "/spell="],
        "item_prefixes": ["/cn/item=", "/item="],
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
            return
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
        "item_id": None,
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
        "item_id": None,
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
                result["confidence"] = cn_result.get("confidence") or result.get("confidence")
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
