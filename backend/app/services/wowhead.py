"""Wowhead WotLK 坐骑数据查询服务。

提供基于 Playwright 的 Wowhead WotLK 简体中文页面查询能力，
用于补全坐骑的官方名称、英文原名、描述、图标、spell_id、item_id 等字段。
"""

from __future__ import annotations

import json
import logging
import re
import time
from urllib.parse import quote, unquote

from playwright.sync_api import Locator, Page, sync_playwright

logger = logging.getLogger(__name__)

BASE_URL = "https://www.wowhead.com/wotlk"
LOCALE_PARAM = "locale=zh"
REQUEST_TIMEOUT = 30000
WAIT_AFTER_GOTO = 3


def _build_search_url(query: str) -> str:
    """构建带 locale 的中文搜索 URL。"""
    return f"{BASE_URL}/search?q={quote(query)}&{LOCALE_PARAM}"


def _extract_id_from_href(href: str, prefix: str) -> int | None:
    """从 Wowhead URL 中提取指定前缀的数字 ID。

    支持的格式：/wotlk/cn/spell=12345/name 或 /wotlk/spell=12345/name。
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
    """从页面文本中提取坐骑描述。

    优先匹配 '使用：' 后面的文本；未命中时尝试法术描述常见模式。
    """
    match = re.search(r"使用：\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()

    match = re.search(r"(召唤或解散[^\n]+)", body_text)
    if match:
        return match.group(1).strip()

    return None


def _extract_icon_name(body_text: str) -> str | None:
    """从页面文本中提取 '图标：icon_name'。"""
    match = re.search(r"图标：\s*([^\n\s]+)", body_text)
    if match:
        return match.group(1).strip()
    return None


def _extract_mount_id(body_text: str) -> int | None:
    """从页面文本中提取 '坐骑 ID：{id}'。"""
    match = re.search(r"坐骑 ID：\s*(\d+)", body_text)
    if match:
        return int(match.group(1))
    return None


def _extract_source(body_text: str) -> str | None:
    """从页面文本中提取掉落/来源信息。

    优先匹配 '掉落于：' 或 '来源：' 片段。
    """
    match = re.search(r"掉落于：\s*([^\n]+)", body_text)
    if match:
        return match.group(1).strip()
    match = re.search(r"来源：\s*([^\n]+)", body_text)
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


def _find_mount_spell_link(page: Page, query: str) -> str | None:
    """在搜索结果页定位第一个坐骑法术链接。"""
    candidates = [
        page.locator("a[href*='/wotlk/cn/spell=']").filter(has_text=query).first,
        page.locator("a[href*='/wotlk/cn/spell=']").first,
        page.locator("a[href*='/wotlk/spell=']").filter(has_text=query).first,
        page.locator("a[href*='/wotlk/spell=']").first,
    ]
    for locator in candidates:
        href = _safe_href(locator)
        if href:
            return href
    return None


def _find_mount_item_link(page: Page, query: str) -> str | None:
    """在搜索结果页定位关联坐骑物品（缰绳）链接。"""
    candidates = [
        page.locator("a[href*='/wotlk/cn/item=']").filter(has_text=re.compile("缰绳")).first,
        page.locator("a[href*='/wotlk/item=']").filter(has_text=re.compile("缰绳")).first,
        page.locator("a[href*='/wotlk/cn/item=']").filter(has_text=query).first,
        page.locator("a[href*='/wotlk/item=']").filter(has_text=query).first,
        page.locator("a[href*='/wotlk/cn/item=']").first,
        page.locator("a[href*='/wotlk/item=']").first,
    ]
    for locator in candidates:
        href = _safe_href(locator)
        if href:
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


def search_mount(query: str) -> dict:
    """查询 Wowhead 获取坐骑数据。

    Args:
        query: 坐骑中文名称，如 "无敌"。

    Returns:
        包含查询结果的字典；失败时包含 `error` 字段。
    """
    result: dict[str, object] = {
        "query": query,
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

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )

            try:
                search_url = _build_search_url(query)
                _goto_with_retry(page, search_url)

                mount_href = _find_mount_spell_link(page, query)
                if not mount_href:
                    result["error"] = "未在 Wowhead 搜索结果中找到坐骑法术链接"
                    return result

                item_href = _find_mount_item_link(page, query)
                item_id = _extract_id_from_href(item_href, "item") if item_href else None

                if mount_href.startswith("/"):
                    mount_href = f"https://www.wowhead.com{mount_href}"
                if "?" not in mount_href:
                    mount_href = f"{mount_href}?{LOCALE_PARAM}"
                elif LOCALE_PARAM not in mount_href:
                    mount_href = f"{mount_href}&{LOCALE_PARAM}"

                _goto_with_retry(page, mount_href)
                result["url"] = page.url

                body_text = page.inner_text("body")
                name_zh = _safe_inner_text(page.locator("h1").first) or query
                name_en = _extract_english_name(body_text)
                description = _extract_description(body_text)
                icon_name = _extract_icon_name(body_text)
                mount_id = _extract_mount_id(body_text)
                source = _extract_source(body_text)
                spell_id = _extract_id_from_href(page.url, "spell")

                result.update(
                    {
                        "name_zh": name_zh,
                        "name_en": name_en,
                        "description": description,
                        "icon_name": icon_name,
                        "spell_id": spell_id,
                        "item_id": item_id,
                        "mount_id": mount_id,
                        "source": source,
                        "confidence": "high" if name_en and description else "medium",
                    }
                )
            finally:
                browser.close()

    except Exception as exc:  # noqa: BLE001
        logger.exception("查询 Wowhead 时发生错误")
        result["error"] = f"查询异常: {exc}"

    return result


def search_mount_json(query: str) -> str:
    """查询 Wowhead 并以 JSON 字符串返回结果。

    Args:
        query: 坐骑中文名称。

    Returns:
        JSON 字符串，便于 CLI 直接打印。
    """
    return json.dumps(search_mount(query), ensure_ascii=False, indent=2)
