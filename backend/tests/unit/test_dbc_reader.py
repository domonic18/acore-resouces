"""dbc_reader 通用只读读取服务单元测试。"""

from __future__ import annotations

import struct
from pathlib import Path

import pytest
from wow_dbc_tool import FieldDef, SchemaRegistry

from app.services import dbc_reader


def _write_dbc(
    path: Path, packed_records: list[bytes], string_block: bytes, record_size: int
) -> None:
    """手写 mini WDBC 文件（20B 头 + 记录区 + 字符串块）。"""
    header = b"WDBC" + struct.pack(
        "<4I", len(packed_records), record_size // 4, record_size, len(string_block)
    )
    path.write_bytes(header + b"".join(packed_records) + string_block)


def _make_string_block(*strings: str) -> tuple[bytes, dict[str, int]]:
    """构建字符串块，返回 (块, {字符串: 偏移})。"""
    block = bytearray(b"\x00")
    offsets: dict[str, int] = {"": 0}
    for s in strings:
        offsets[s] = len(block)
        block.extend(s.encode("utf-8") + b"\x00")
    return bytes(block), offsets


@pytest.fixture
def test_dbc_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """构造含 Test.dbc（ID/Name/Score）与 NoId.dbc（Ratio/Label）的临时 DBC 目录。"""
    dbc_dir = tmp_path / "dbc"
    dbc_dir.mkdir()

    block, offsets = _make_string_block("alpha", "beta", "gamma")
    records = [
        struct.pack("<IIf", 1, offsets["alpha"], 1.5),
        struct.pack("<IIf", 2, offsets["beta"], 2.5),
        struct.pack("<IIf", 3, offsets["gamma"], 3.5),
    ]
    _write_dbc(dbc_dir / "Test.dbc", records, block, record_size=12)

    no_id_block, no_id_offsets = _make_string_block("low", "high")
    no_id_records = [
        struct.pack("<fI", 0.25, no_id_offsets["low"]),
        struct.pack("<fI", 0.75, no_id_offsets["high"]),
    ]
    _write_dbc(dbc_dir / "NoId.dbc", no_id_records, no_id_block, record_size=8)

    SchemaRegistry.register(
        "Test.dbc",
        [
            FieldDef("ID", "uint32", 0),
            FieldDef("Name", "string", 4),
            FieldDef("Score", "float", 8),
        ],
    )
    SchemaRegistry.register(
        "NoId.dbc",
        [
            FieldDef("Ratio", "float", 0),
            FieldDef("Label", "string", 4),
        ],
    )

    monkeypatch.setattr(dbc_reader, "WOW_DBC_DIR", dbc_dir)
    dbc_reader._dbc_cache.clear()
    yield dbc_dir
    SchemaRegistry.clear_custom()
    dbc_reader._dbc_cache.clear()


def test_list_dbc_files(test_dbc_dir: Path) -> None:
    """文件列表含 header 信息与 schema 注册状态。"""
    result = dbc_reader.list_dbc_files()

    assert result["total"] == 2
    names = [item["name"] for item in result["items"]]
    assert names == ["NoId.dbc", "Test.dbc"]

    test_item = result["items"][1]
    assert test_item["schema_registered"] is True
    assert test_item["record_count"] == 3
    assert test_item["header"]["magic"] == "WDBC"
    assert test_item["header"]["field_count"] == 3
    assert test_item["header"]["record_size"] == 12
    assert test_item["size"] == 20 + 3 * 12 + test_item["header"]["string_block_size"]


def test_list_dbc_files_unregistered_schema(test_dbc_dir: Path) -> None:
    """未注册 schema 的文件仍列出且标记为未注册。"""
    _write_dbc(
        test_dbc_dir / "Unregistered.dbc",
        [struct.pack("<I", 7)],
        b"\x00",
        record_size=4,
    )
    result = dbc_reader.list_dbc_files()
    item = next(i for i in result["items"] if i["name"] == "Unregistered.dbc")
    assert item["schema_registered"] is False
    assert item["record_count"] == 1


def test_query_records_pagination(test_dbc_dir: Path) -> None:
    """分页查询返回字段元数据与记录标识。"""
    result = dbc_reader.query_records("Test.dbc", page=2, page_size=2)

    assert result["total"] == 3
    assert result["page"] == 2
    assert [item["_record_id"] for item in result["items"]] == [3]
    assert result["items"][0]["Name"] == "gamma"
    assert result["fields"] == [
        {"name": "ID", "type": "uint32"},
        {"name": "Name", "type": "string"},
        {"name": "Score", "type": "float"},
    ]


def test_query_records_filter_contains(test_dbc_dir: Path) -> None:
    """字符串 contains 过滤。"""
    result = dbc_reader.query_records("Test.dbc", field="Name", op="contains", value="am")
    assert result["total"] == 1
    assert result["items"][0]["Name"] == "gamma"


def test_query_records_filter_gt_numeric(test_dbc_dir: Path) -> None:
    """数值 gt 过滤按字段类型转换值。"""
    result = dbc_reader.query_records("Test.dbc", field="ID", op="gt", value="1")
    assert result["total"] == 2
    assert {item["ID"] for item in result["items"]} == {2, 3}


def test_query_records_unknown_field(test_dbc_dir: Path) -> None:
    """未知字段抛非法查询异常。"""
    with pytest.raises(dbc_reader.DbcInvalidQueryError, match="字段不存在"):
        dbc_reader.query_records("Test.dbc", field="NoSuch", op="eq", value="1")


def test_query_records_invalid_op(test_dbc_dir: Path) -> None:
    """非法操作符抛非法查询异常。"""
    with pytest.raises(dbc_reader.DbcInvalidQueryError, match="不支持的操作符"):
        dbc_reader.query_records("Test.dbc", field="ID", op="gte", value="1")


def test_query_records_value_type_mismatch(test_dbc_dir: Path) -> None:
    """数值字段收到非数值过滤值抛非法查询异常。"""
    with pytest.raises(dbc_reader.DbcInvalidQueryError, match="不接受值"):
        dbc_reader.query_records("Test.dbc", field="ID", op="gt", value="abc")


def test_query_records_missing_value(test_dbc_dir: Path) -> None:
    """有字段无值抛非法查询异常。"""
    with pytest.raises(dbc_reader.DbcInvalidQueryError, match="不能为空"):
        dbc_reader.query_records("Test.dbc", field="ID", op="eq", value="")


def test_get_record_by_id(test_dbc_dir: Path) -> None:
    """按 ID 值取记录，返回全字段名称/类型/值。"""
    result = dbc_reader.get_record("Test.dbc", 2)

    assert result is not None
    assert result["record_id"] == 2
    assert result["index"] == 2
    assert result["fields"] == [
        {"name": "ID", "type": "uint32", "value": 2},
        {"name": "Name", "type": "string", "value": "beta"},
        {"name": "Score", "type": "float", "value": pytest.approx(2.5)},
    ]


def test_get_record_not_found(test_dbc_dir: Path) -> None:
    """未命中返回 None。"""
    assert dbc_reader.get_record("Test.dbc", 999) is None


def test_get_record_row_number_fallback(test_dbc_dir: Path) -> None:
    """无 ID 字段的表按 1-based 行号取记录。"""
    result = dbc_reader.get_record("NoId.dbc", 2)

    assert result is not None
    assert result["index"] == 2
    assert result["fields"][1]["value"] == "high"
    assert result["fields"][0]["value"] == pytest.approx(0.75)


def test_query_records_row_number_fallback(test_dbc_dir: Path) -> None:
    """无 ID 字段的表 _record_id 回退为行号。"""
    result = dbc_reader.query_records("NoId.dbc", page=1, page_size=10)
    assert [item["_record_id"] for item in result["items"]] == [1, 2]


def test_file_name_rejected() -> None:
    """路径穿越/非法文件名抛文件不存在异常。"""
    with pytest.raises(dbc_reader.DbcFileNotFoundError, match="非法"):
        dbc_reader.query_records("../evil.dbc")
    with pytest.raises(dbc_reader.DbcFileNotFoundError, match="非法"):
        dbc_reader.get_record("sub/Spell.dbc", 1)


def test_file_missing() -> None:
    """合法命名但文件不存在抛文件不存在异常。"""
    with pytest.raises(dbc_reader.DbcFileNotFoundError, match="不存在"):
        dbc_reader.get_record("NotOnDisk.dbc", 1)


def test_string_sanitize(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """字符串中的不可打印字符转义为 \\xNN。"""
    dbc_dir = tmp_path / "dbc"
    dbc_dir.mkdir()
    block, offsets = _make_string_block("bad\x01string")
    _write_dbc(
        dbc_dir / "Sanitize.dbc",
        [struct.pack("<II", 1, offsets["bad\x01string"])],
        block,
        record_size=8,
    )
    SchemaRegistry.register(
        "Sanitize.dbc",
        [FieldDef("ID", "uint32", 0), FieldDef("Name", "string", 4)],
    )
    monkeypatch.setattr(dbc_reader, "WOW_DBC_DIR", dbc_dir)
    dbc_reader._dbc_cache.clear()

    result = dbc_reader.query_records("Sanitize.dbc")
    assert result["items"][0]["Name"] == "bad\\x01string"


def test_cache_reloads_on_file_change(test_dbc_dir: Path) -> None:
    """文件变化（mtime/size 变更）后缓存自动重载。"""
    first = dbc_reader.query_records("Test.dbc")
    assert first["total"] == 3

    block, offsets = _make_string_block("alpha", "beta", "gamma", "delta")
    records = [
        struct.pack("<IIf", 1, offsets["alpha"], 1.5),
        struct.pack("<IIf", 2, offsets["beta"], 2.5),
        struct.pack("<IIf", 3, offsets["gamma"], 3.5),
        struct.pack("<IIf", 4, offsets["delta"], 4.5),
    ]
    _write_dbc(test_dbc_dir / "Test.dbc", records, block, record_size=12)

    second = dbc_reader.query_records("Test.dbc")
    assert second["total"] == 4
