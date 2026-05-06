import argparse
import csv
import json
import os
import re
import sys
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import request
from xml.etree import ElementTree as ET


DEFAULT_PRD = Path("docs/V3.4需求PRD.docx")
DEFAULT_OUTPUT_ROOT = Path("output/ai-testcase-generation")
DEFAULT_BASE_URL_ENV = "AI_TESTGEN_BASE_URL"
DEFAULT_API_KEY_ENV = "AI_TESTGEN_API_KEY"
DEFAULT_MODEL_ENV = "AI_TESTGEN_MODEL"
DEFAULT_MODEL = "Qwen/Qwen3.5-397B-A17B-FP8"
SECTION_TITLE_RE = re.compile(r"^(?P<number>\d+(?:\.\d+)+)\s*(?P<title>.+)$")
GENERIC_TESTPOINT_ROOT_TITLES = {"测试点", "测试点总览", "测试点清单", "人工测试点", "人工测试点清单"}
GENERIC_NAME_PARTS = [
    "V",
    "PRD",
    "需求",
    "文档",
    "测试点",
    "人工",
    "用例",
    "xmind",
    "XMind",
]


def load_env_file(file_path: Path) -> None:
    if not file_path.exists():
        return

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def safe_stem(path: Path) -> str:
    stem = path.stem.strip()
    stem = re.sub(r'[<>:"/\\|?*\s]+', "_", stem)
    return stem.strip("_") or "prd"


def comparable_name(value: str) -> str:
    name = re.sub(r"\.[A-Za-z0-9]+$", "", value)
    name = re.sub(r"V\d+(?:\.\d+)*", "", name, flags=re.I)
    for part in GENERIC_NAME_PARTS:
        name = name.replace(part, "")
    name = re.sub(r"[\s_\-—–/\\|（）()【】\[\]：:；;,.，。]+", "", name)
    return name.strip()


def names_match(left: str, right: str) -> bool:
    left_name = comparable_name(left)
    right_name = comparable_name(right)
    if not left_name or not right_name:
        return True
    return left_name in right_name or right_name in left_name


def validate_manual_import_names(prd: Path, manual_xmind: Path, run_dir: Path, allow_mismatch: bool) -> None:
    if allow_mismatch:
        return

    mismatches: list[str] = []
    if not names_match(prd.stem, manual_xmind.stem):
        mismatches.append(f"PRD `{prd.name}` 与人工 XMind `{manual_xmind.name}` 名称不匹配")

    run_name = run_dir.name
    if run_name and not names_match(prd.stem, run_name):
        mismatches.append(f"PRD `{prd.name}` 与输出目录 `{run_name}` 名称不匹配")

    if mismatches:
        raise ValueError(
            "疑似选错 PRD，已停止执行。"
            + "；".join(mismatches)
            + "。如果你确认这是跨需求复用 PRD，请显式增加 `--allow-prd-mismatch`。"
        )


def validate_run_context(run_dir: Path) -> None:
    metadata_path = run_dir / "run_metadata.json"
    if not metadata_path.exists():
        return

    try:
        metadata = read_json(metadata_path)
    except Exception:
        return

    prd = str(metadata.get("prd") or "").strip()
    manual_xmind = str(metadata.get("manual_xmind") or "").strip()
    allow_mismatch = bool(metadata.get("allow_prd_mismatch"))
    if prd and manual_xmind:
        validate_manual_import_names(Path(prd), Path(manual_xmind), run_dir, allow_mismatch)


def default_run_dir(prd: Path) -> Path:
    return DEFAULT_OUTPUT_ROOT / safe_stem(prd)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def first_existing(*paths: Path) -> Path:
    for path in paths:
        if path.exists():
            return path
    raise FileNotFoundError("未找到输入文件: " + " / ".join(str(path) for path in paths))


def docx_paragraph_text(paragraph: ET.Element, ns: dict[str, str]) -> str:
    parts: list[str] = []
    for node in paragraph.findall(".//w:t", ns):
        if node.text:
            parts.append(node.text)
    return "".join(parts).strip()


def docx_paragraph_level(paragraph: ET.Element, ns: dict[str, str]) -> int | None:
    style = paragraph.find("./w:pPr/w:pStyle", ns)
    if style is None:
        return None

    value = style.attrib.get(f"{{{ns['w']}}}val", "")
    match = re.search(r"(?:Heading|标题)(\d+)", value, flags=re.IGNORECASE)
    if match:
        return min(max(int(match.group(1)), 1), 6)
    return None


def infer_numbered_heading_level(text: str) -> int | None:
    match = SECTION_TITLE_RE.match(text.strip())
    if not match:
        return None

    # PRD 常见编号会从 5.1.5 这种较深层级开始，导图里需要压缩成相对层级。
    dot_count = match.group("number").count(".")
    return max(1, dot_count - 1)


def is_subtitle_like(text: str) -> bool:
    value = text.strip()
    if not value:
        return False
    if infer_numbered_heading_level(value):
        return False
    if value.endswith(("：", ":")) and len(value) <= 40:
        return True
    if len(value) <= 16 and not re.search(r"[，,。；;（）()、\[\]“”\"']", value):
        return True
    return False


def display_path_title(value: str) -> str:
    return SECTION_TITLE_RE.sub(lambda match: match.group("title").strip(), value).strip()


def classify_paragraph(text: str, style_level: int | None) -> tuple[str, int | None]:
    if style_level:
        return "heading", style_level

    inferred_level = infer_numbered_heading_level(text)
    if inferred_level:
        return "heading", inferred_level

    if is_subtitle_like(text):
        return "subtitle", None

    return "paragraph", None


def extract_docx_blocks(docx_path: Path) -> list[dict[str, Any]]:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    blocks: list[dict[str, Any]] = []

    with zipfile.ZipFile(docx_path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    body = root.find("w:body", ns)
    if body is None:
        return blocks

    for child in body:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = docx_paragraph_text(child, ns)
            if not text:
                continue
            block_type, level = classify_paragraph(text, docx_paragraph_level(child, ns))
            blocks.append(
                {
                    "type": block_type,
                    "level": level,
                    "text": text,
                }
            )
        elif tag == "tbl":
            rows: list[list[str]] = []
            for tr in child.findall(".//w:tr", ns):
                cells: list[str] = []
                for tc in tr.findall("./w:tc", ns):
                    cell_parts = [docx_paragraph_text(p, ns) for p in tc.findall(".//w:p", ns)]
                    cells.append(" ".join(part for part in cell_parts if part).strip())
                if any(cells):
                    rows.append(cells)
            if rows:
                blocks.append({"type": "table", "rows": rows})

    return blocks


def blocks_to_markdown(title: str, blocks: list[dict[str, Any]]) -> str:
    lines = [f"# {title}", ""]
    current_section_level = 0
    for block in blocks:
        if block["type"] == "heading":
            level = int(block.get("level") or 1)
            current_section_level = level
            lines.append(f"{'#' * min(level + 1, 6)} {block['text']}")
            lines.append("")
        elif block["type"] == "subtitle":
            level = max(current_section_level + 1, 1)
            lines.append(f"{'#' * min(level + 1, 6)} {block['text']}")
            lines.append("")
        elif block["type"] == "paragraph":
            lines.append(block["text"])
            lines.append("")
        elif block["type"] == "table":
            rows: list[list[str]] = block["rows"]
            max_cols = max(len(row) for row in rows)
            normalized = [row + [""] * (max_cols - len(row)) for row in rows]
            header = normalized[0]
            lines.append("| " + " | ".join(header) + " |")
            lines.append("| " + " | ".join(["---"] * max_cols) + " |")
            for row in normalized[1:]:
                lines.append("| " + " | ".join(row) + " |")
            lines.append("")
    return "\n".join(lines).strip() + "\n"


def blocks_to_tree(title: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    root = {"title": title, "kind": "document", "children": []}
    stack: list[tuple[int, dict[str, Any]]] = [(0, root)]
    current_section_level = 0

    for block in blocks:
        if block["type"] == "heading":
            level = int(block.get("level") or 1)
            node = {"title": block["text"], "kind": "heading", "children": []}
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack[-1][1].setdefault("children", []).append(node)
            stack.append((level, node))
            current_section_level = level
        elif block["type"] == "subtitle":
            level = max(current_section_level + 1, 1)
            node = {"title": block["text"].rstrip("：:"), "kind": "subheading", "children": []}
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack[-1][1].setdefault("children", []).append(node)
            stack.append((level, node))
        elif block["type"] == "paragraph":
            text = block["text"]
            title_text = text if len(text) <= 90 else text[:87] + "..."
            stack[-1][1].setdefault("children", []).append({"title": title_text, "kind": "requirement", "text": text})
        elif block["type"] == "table":
            table_node = {"title": "表格", "kind": "table", "children": []}
            rows: list[list[str]] = block["rows"]
            for index, row in enumerate(rows, start=1):
                joined = " | ".join(cell for cell in row if cell)
                table_node["children"].append({"title": f"第{index}行：{joined[:120]}", "kind": "table-row"})
            stack[-1][1].setdefault("children", []).append(table_node)

    return root


def xmind_topic(node: dict[str, Any]) -> dict[str, Any]:
    topic: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "class": "topic",
        "title": str(node.get("title") or "未命名节点"),
    }
    children = node.get("children") or []
    if children:
        topic["children"] = {"attached": [xmind_topic(child) for child in children]}
    return topic


def write_xmind(path: Path, root_node: dict[str, Any], sheet_title: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = [
        {
            "id": str(uuid.uuid4()),
            "class": "sheet",
            "title": sheet_title or root_node.get("title") or "Sheet",
            "rootTopic": xmind_topic(root_node),
        }
    ]
    metadata = {
        "creator": {"name": "ai_testcase_pipeline.py"},
        "created": now_iso(),
        "modified": now_iso(),
    }
    manifest = {"file-entries": {"content.json": {}, "metadata.json": {}}}

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("content.json", json.dumps(content, ensure_ascii=False, indent=2))
        archive.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))


def xmind_children(topic: dict[str, Any]) -> list[dict[str, Any]]:
    children = topic.get("children") or {}
    if isinstance(children, dict):
        attached = children.get("attached") or []
        return [child for child in attached if isinstance(child, dict)]
    if isinstance(children, list):
        return [child for child in children if isinstance(child, dict)]
    return []


def xmind_title(topic: dict[str, Any]) -> str:
    return str(topic.get("title") or topic.get("text") or "").strip()


def xmind_note(topic: dict[str, Any]) -> str:
    notes = topic.get("notes") or {}
    if not isinstance(notes, dict):
        return ""
    plain = notes.get("plain")
    if isinstance(plain, dict):
        return str(plain.get("content") or "").strip()
    if isinstance(plain, str):
        return plain.strip()
    return ""


def strip_testpoint_prefix(title: str) -> str:
    return re.sub(r"^\s*(?:TP[-_ ]?\d+|T[-_ ]?\d+|\d+[.、．)]|[-*•])\s*", "", title).strip()


def read_xmind_content(path: Path) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as archive:
        if "content.json" not in archive.namelist():
            raise ValueError(
                "当前只支持新版 XMind 的 content.json 格式。"
                "如果你手里的文件是旧版 XMind，请先用 XMind 打开后另存为新版 .xmind。"
            )
        content = json.loads(archive.read("content.json").decode("utf-8"))

    if isinstance(content, list):
        return [sheet for sheet in content if isinstance(sheet, dict)]
    if isinstance(content, dict):
        sheets = content.get("sheets")
        if isinstance(sheets, list):
            return [sheet for sheet in sheets if isinstance(sheet, dict)]
        return [content]
    raise ValueError("XMind content.json 结构不符合预期，无法读取测试点。")


def manual_xmind_to_testpoints(xmind_path: Path, prd_path: Path | None = None) -> dict[str, Any]:
    sheets = read_xmind_content(xmind_path)
    test_points: list[dict[str, Any]] = []

    def visit(topic: dict[str, Any], module_path: list[str]) -> None:
        raw_title = xmind_title(topic)
        title = display_path_title(raw_title)
        children = xmind_children(topic)

        if children:
            next_path = module_path + [title] if title else module_path
            for child in children:
                visit(child, next_path)
            return

        test_point = strip_testpoint_prefix(title)
        if not test_point:
            return

        normalized_path = [display_path_title(part) for part in module_path if display_path_title(part)]
        normalized_path = normalized_path or ["未分类"]
        point_index = len(test_points) + 1
        note = xmind_note(topic)
        source = note or f"人工 XMind 测试点：{xmind_path.name}"
        if prd_path:
            source += f"；关联 PRD：{prd_path.name}"
        test_points.append(
            {
                "id": f"TP-{point_index:03d}",
                "module": normalized_path[0],
                "modulePath": normalized_path,
                "sourceTitle": normalized_path[-1],
                "testPoint": test_point,
                "source": source,
            }
        )

    for sheet in sheets:
        root_topic = sheet.get("rootTopic")
        if not isinstance(root_topic, dict):
            continue
        root_title = display_path_title(xmind_title(root_topic))
        root_path = [] if root_title in GENERIC_TESTPOINT_ROOT_TITLES else ([root_title] if root_title else [])
        children = xmind_children(root_topic)
        if children:
            for child in children:
                visit(child, root_path)
        else:
            visit(root_topic, [])

    if not test_points:
        raise ValueError("人工 XMind 中没有读取到叶子节点测试点，请确认测试点写在 XMind 的末级节点。")

    return {
        "summary": f"从人工 XMind 导入 {len(test_points)} 条测试点。",
        "source_xmind": str(xmind_path),
        "source_prd": str(prd_path) if prd_path else "",
        "generated_at": now_iso(),
        "test_points": test_points,
    }


def testpoints_to_tree(data: dict[str, Any]) -> dict[str, Any]:
    root: dict[str, Any] = {"title": "测试点总览", "children": []}
    path_nodes: dict[tuple[str, ...], dict[str, Any]] = {}
    point_counters: dict[tuple[str, ...], int] = {}

    def get_or_create_path(path: list[str]) -> dict[str, Any]:
        current = root
        current_key: list[str] = []
        for index, raw_part in enumerate(path):
            part = str(raw_part).strip()
            if not part:
                continue
            title = display_path_title(part)
            current_key.append(title)
            key = tuple(current_key)
            node = path_nodes.get(key)
            if node is None:
                node = {"title": title, "children": []}
                current.setdefault("children", []).append(node)
                path_nodes[key] = node
            current = node
        return current

    def normalize_path(item: dict[str, Any]) -> list[str]:
        module_path = item.get("modulePath") or item.get("module_path")
        if isinstance(module_path, list):
            path = [str(part).strip() for part in module_path if str(part).strip()]
        elif isinstance(module_path, str) and module_path.strip():
            path = [part.strip() for part in re.split(r">|/|｜|\|", module_path) if part.strip()]
        else:
            path = []

        module = str(item.get("module") or "").strip()
        source_title = str(item.get("sourceTitle") or item.get("source_title") or item.get("prdTitle") or "").strip()

        if not path and module:
            path.append(module)
        if source_title and source_title not in path:
            path.append(source_title)
        return path or ["未分类"]

    for item in data.get("test_points", []):
        path = normalize_path(item)
        parent_node = get_or_create_path(path)
        key = tuple(path)
        point_counters[key] = point_counters.get(key, 0) + 1
        test_point = str(item.get("testPoint") or item.get("test_point") or item.get("title") or "未命名测试点")
        test_point = re.sub(r"^\s*\d+[.、．]\s*", "", test_point).strip()
        parent_node.setdefault("children", []).append({"title": f"{point_counters[key]}. {test_point}"})

    root["children"] = root["children"] or [{"title": "未生成测试点"}]
    return root


def cases_to_rows(cases: list[dict[str, Any]]) -> list[list[str]]:
    headers = ["测试模块", "用例标题", "前提条件", "测试步骤", "预期结果", "实际结果", "状态", "备注"]
    rows = [headers]
    for case in cases:
        module = case.get("测试模块") or case.get("module") or case.get("模块") or ""
        title = case.get("用例标题") or case.get("title") or case.get("case_title") or ""
        precondition = case.get("前提条件") or case.get("precondition") or ""
        steps = case.get("测试步骤") or case.get("steps") or ""
        expected = case.get("预期结果") or case.get("expected_result") or case.get("expected") or ""
        actual = case.get("实际结果") or ""
        status = case.get("状态") or ""
        remark = case.get("备注") or case.get("remark") or ""

        values = [module, title, precondition, steps, expected, actual, status, remark]
        row: list[str] = []
        for value in values:
            if isinstance(value, list):
                value = "\n".join(str(item) for item in value)
            elif isinstance(value, dict):
                value = json.dumps(value, ensure_ascii=False)
            row.append(str(value))
        rows.append(row)
    return rows


def iter_chunks(items: list[dict[str, Any]], chunk_size: int) -> list[list[dict[str, Any]]]:
    return [items[index : index + chunk_size] for index in range(0, len(items), chunk_size)]


def testpoint_id(item: dict[str, Any], index: int) -> str:
    return str(
        item.get("_normalized_id")
        or item.get("id")
        or item.get("testPointId")
        or item.get("test_point_id")
        or f"TP-{index + 1:03d}"
    )


def normalize_testpoint_ids(testpoints: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(testpoints):
        copied = dict(item)
        copied["_normalized_id"] = testpoint_id(copied, index)
        normalized.append(copied)
    return normalized


def clean_module_path(item: dict[str, Any]) -> str:
    module_path = item.get("modulePath") or item.get("module_path")
    if isinstance(module_path, list):
        return "/".join(display_path_title(str(part).strip()) for part in module_path if str(part).strip())
    if isinstance(module_path, str) and module_path.strip():
        parts = [part.strip() for part in re.split(r">|/|｜|\|", module_path) if part.strip()]
        return "/".join(display_path_title(part) for part in parts)
    return display_path_title(str(item.get("module") or "未分类"))


def normalize_module_text(value: str) -> str:
    parts = [part.strip() for part in re.split(r">|/|｜|\|", value) if part.strip()]
    normalized_parts = [display_path_title(part) for part in parts if display_path_title(part)]
    return "/".join(normalized_parts)


def known_testpoint_module_paths(testpoints_data: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    seen: set[str] = set()
    for item in testpoints_data.get("test_points", []):
        path = normalize_module_text(clean_module_path(item))
        if path and path not in seen:
            paths.append(path)
            seen.add(path)
    return paths


def best_known_module_path(current: str, known_paths: list[str]) -> str:
    current = normalize_module_text(current)
    if not current:
        return current
    if current in known_paths:
        return current

    current_parts = current.split("/")
    for known in known_paths:
        known_parts = known.split("/")
        if len(current_parts) <= len(known_parts) and known_parts[-len(current_parts) :] == current_parts:
            return known

    # Review 补充用例常只返回“二级模块/子模块”，这里根据已知测试点补齐根模块。
    for known in known_paths:
        known_parts = known.split("/")
        for index, part in enumerate(known_parts):
            if part == current_parts[0]:
                return "/".join(known_parts[:index] + current_parts)

    return current


def normalize_case_modules(cases: list[dict[str, Any]], testpoints_data: dict[str, Any]) -> None:
    known_paths = known_testpoint_module_paths(testpoints_data)
    for case in cases:
        module = case.get("测试模块") or case.get("module") or case.get("模块") or ""
        normalized = best_known_module_path(str(module), known_paths)
        if normalized:
            case["测试模块"] = normalized


def build_testcase_prompt(
    prd_text: str,
    testpoints: list[dict[str, Any]],
    batch_index: int,
    review_text: str | None = None,
) -> str:
    compact_testpoints = []
    for index, item in enumerate(testpoints):
        source_id = testpoint_id(item, index)
        compact_testpoints.append(
            {
                "id": source_id,
                "测试模块": clean_module_path(item),
                "测试点": item.get("testPoint") or item.get("test_point") or item.get("title"),
                "PRD依据": item.get("source") or "",
            }
        )

    review_section = ""
    if review_text:
        review_section = (
            "【测试用例 Review 报告】\n"
            f"{review_text}\n\n"
            "请优先修复 Review 报告中指出的遗漏、不可执行、预期不清晰和 PRD 不一致等问题。\n"
            "必须读取 Review 表格中的“审核意见”列：\n"
            "- 审核意见为“忽略”时，不要按该建议修改用例。\n"
            "- 审核意见为“修改”或“已处理”时，按修复建议修改对应用例。\n"
            "- 审核意见为“暂定”或“需产品确认”时，不要编造规则；如果该建议关联到本批测试点/用例，请在对应用例的“备注”中写清问题说明和待确认原因。\n"
            "暂定备注示例：审核意见：暂定；问题说明：缺少权益叠加的具体验证方式，PRD 中“最大级别权益”定义模糊，需产品确认权益叠加规则，补充具体权益项的验证用例待人工审核。\n"
            "如果 Review 报告与 PRD 或测试点冲突，以 PRD 和测试点为准。\n\n"
        )

    return (
        f"请基于 PRD 和本批测试点生成测试用例。本批次编号：{batch_index}。\n\n"
        "强制规则：\n"
        "1. 输入有几个测试点，就必须输出几条测试用例，不能少，不能合并。\n"
        "2. 每条测试用例只能覆盖一个测试点。\n"
        "3. 每条测试用例必须带 `_source_test_point_id`，值必须等于输入测试点的 id。\n"
        "4. `实际结果`、`状态` 必须是空字符串；无 Review 待处理意见时 `备注` 为空字符串。\n"
        "5. 如果 Review 审核意见为“暂定”或“需产品确认”，且关联到当前测试点，对应用例的 `备注` 必须写清问题说明和待确认原因。\n"
        "6. 导出表格只会使用中文 8 列，但 JSON 中必须保留 `_source_test_point_id` 供脚本校验。\n\n"
        "JSON 格式要求：\n"
        "1. 只输出一个合法 JSON 对象，不要输出 Markdown 代码块、解释文字或注释。\n"
        "2. 字符串里的双引号必须转义，数组和对象最后一项不能有尾逗号。\n\n"
        "输出 JSON 格式如下，字段名必须完全一致：\n"
        "{\n"
        '  "summary": "简要说明",\n'
        '  "cases": [\n'
        "    {\n"
        '      "_source_test_point_id": "TP-001",\n'
        '      "测试模块": "模块/标题路径",\n'
        '      "用例标题": "用例标题",\n'
        '      "前提条件": "前提条件，没有则写无",\n'
        '      "测试步骤": ["步骤1", "步骤2"],\n'
        '      "预期结果": "预期结果",\n'
        '      "实际结果": "",\n'
        '      "状态": "",\n'
        '      "备注": ""\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "【PRD Markdown】\n"
        f"{prd_text}\n\n"
        f"{review_section}"
        "【本批测试点 JSON】\n"
        f"{json.dumps(compact_testpoints, ensure_ascii=False, indent=2)}"
    )


def validate_case_coverage(testpoints: list[dict[str, Any]], cases: list[dict[str, Any]]) -> None:
    expected_ids = {testpoint_id(item, index) for index, item in enumerate(testpoints)}
    actual_ids = {str(case.get("_source_test_point_id")) for case in cases if case.get("_source_test_point_id")}
    missing_ids = sorted(expected_ids - actual_ids)
    if missing_ids:
        raise ValueError(
            "测试用例覆盖不完整，以下测试点没有生成对应用例: "
            + ", ".join(missing_ids)
            + "。请重新执行 testpoints-to-cases，或缩小每批测试点数量。"
        )


def testcase_json_schema_text() -> str:
    return (
        "{\n"
        '  "summary": "简要说明",\n'
        '  "cases": [\n'
        "    {\n"
        '      "_source_test_point_id": "TP-001",\n'
        '      "测试模块": "模块/标题路径",\n'
        '      "用例标题": "用例标题",\n'
        '      "前提条件": "前提条件，没有则写无",\n'
        '      "测试步骤": ["步骤1", "步骤2"],\n'
        '      "预期结果": "预期结果",\n'
        '      "实际结果": "",\n'
        '      "状态": "",\n'
        '      "备注": ""\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def repair_json_with_ai(raw_text: str, schema_text: str) -> str:
    system_prompt = (
        "你是 JSON 修复器。只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释。"
        "必须保留原始内容语义，只修复 JSON 语法问题，例如缺逗号、尾逗号、未转义引号、代码块包裹。"
    )
    user_prompt = (
        "请把下面的模型返回内容修复成合法 JSON。\n\n"
        "必须符合这个 JSON 结构：\n"
        f"{schema_text}\n\n"
        "原始内容：\n"
        f"{raw_text}"
    )
    return openai_chat(system_prompt, user_prompt, temperature=0)


def parse_json_with_ai_repair(raw_text: str, *, repair_path: Path | None = None) -> Any:
    try:
        return extract_json_object(raw_text)
    except Exception as first_exc:
        repaired_text = repair_json_with_ai(raw_text, testcase_json_schema_text())
        if repair_path:
            write_text(repair_path, repaired_text)
        try:
            return extract_json_object(repaired_text)
        except Exception as second_exc:
            raise ValueError(f"原始 JSON 解析失败: {first_exc}; AI 修复后仍解析失败: {second_exc}") from second_exc


def generate_cases_from_testpoints(
    prd_text: str,
    testpoints_data: dict[str, Any],
    *,
    review_text: str | None = None,
    debug_dir: Path | None = None,
    debug_prefix: str = "test_cases",
) -> tuple[dict[str, Any], str]:
    all_testpoints = normalize_testpoint_ids(testpoints_data.get("test_points", []))
    if not all_testpoints:
        raise ValueError("测试点为空，无法生成测试用例。")

    all_cases: list[dict[str, Any]] = []
    raw_parts: list[str] = []
    for batch_index, chunk in enumerate(iter_chunks(all_testpoints, 8), start=1):
        user_prompt = build_testcase_prompt(prd_text, chunk, batch_index, review_text=review_text)
        content = openai_chat(testcase_generation_system_prompt(), user_prompt)
        batch_raw_path: Path | None = None
        if debug_dir:
            batch_raw_path = debug_dir / f"{debug_prefix}.batch_{batch_index:02d}.raw.txt"
            write_text(batch_raw_path, content)
        raw_parts.append(f"===== batch {batch_index} =====\n{content}")
        repair_path = debug_dir / f"{debug_prefix}.batch_{batch_index:02d}.repaired.txt" if debug_dir else None
        try:
            batch_data = parse_json_with_ai_repair(content, repair_path=repair_path)
        except Exception as exc:
            message = f"第 {batch_index} 批 AI 返回不是合法 JSON"
            if batch_raw_path:
                message += f"，原始返回已保存到: {batch_raw_path}"
            if repair_path and repair_path.exists():
                message += f"，AI 修复返回已保存到: {repair_path}"
            raise ValueError(message + f"。原始错误: {exc}") from exc
        if isinstance(batch_data, list):
            batch_data = {"summary": "", "cases": batch_data}
        batch_cases = batch_data.get("cases", [])
        validate_case_coverage(chunk, batch_cases)
        all_cases.extend(batch_cases)

    validate_case_coverage(all_testpoints, all_cases)
    mode = "结合 Review 报告重新生成" if review_text else "生成"
    return (
        {
            "summary": f"{mode}：基于 {len(all_testpoints)} 个测试点生成 {len(all_cases)} 条测试用例。",
            "generated_at": now_iso(),
            "cases": all_cases,
        },
        "\n\n".join(raw_parts),
    )


def build_review_supplement_prompt(prd_text: str, testpoints_data: dict[str, Any], review_text: str) -> str:
    return (
        "请基于测试用例 Review 报告，补充生成 Review 明确指出缺失的测试用例。\n\n"
        "强制规则：\n"
        "1. 只生成 Review 报告中明确指出缺失或需要新增的场景。\n"
        "1.1 必须读取 Review 表格中的“审核意见”列：审核意见为“忽略”的问题不生成补充用例；审核意见为“暂定”或“需产品确认”的补充用例必须在备注中写清待确认原因。\n"
        "2. 不要重复已有测试点已经覆盖的正常流程。\n"
        "3. 重点补充异常、边界、老用户、过期、失败、已存在等 Review 提到的场景。\n"
        "4. 如果 Review 中某个建议缺少 PRD 支撑或需要产品确认，也要生成用例，但在 `备注` 中写明“需产品确认”。\n"
        "5. 每条补充用例必须带 `_source_test_point_id`，格式为 `REVIEW-001`、`REVIEW-002`。\n"
        "6. `实际结果`、`状态` 必须是空字符串。\n\n"
        "7. `测试模块` 必须优先复用测试点 JSON 中的完整模块路径；不要直接使用带编号的 PRD 标题，例如不要写 `5.1.6.1 套餐定制留资/留资资料`，应写 `会员订阅付费系统/套餐定制留资/留资资料`。\n\n"
        "备注要求：\n"
        "1. `备注` 必须写清楚为什么补充这个用例，不能只写“补充来源：Review 报告 严重问题 3”。\n"
        "2. `备注` 必须包含 Review 报告中的章节/问题位置、问题标题、原因摘要。\n"
        "3. 推荐格式：补充来源：Review 报告 严重问题 3：缺少关键异常场景（链接过期），PRD 提到支持“有效期配置”（TP-021），但测试用例中没有任何一条验证“链接过期后点击”的场景。\n\n"
        "输出 JSON 格式如下，字段名必须完全一致：\n"
        "{\n"
        '  "summary": "简要说明",\n'
        '  "cases": [\n'
        "    {\n"
        '      "_source_test_point_id": "REVIEW-001",\n'
        '      "测试模块": "模块/标题路径",\n'
        '      "用例标题": "用例标题",\n'
        '      "前提条件": "前提条件，没有则写无",\n'
        '      "测试步骤": ["步骤1", "步骤2"],\n'
        '      "预期结果": "预期结果",\n'
        '      "实际结果": "",\n'
        '      "状态": "",\n'
        '      "备注": "补充来源：Review 报告 严重问题 3：缺少关键异常场景（链接过期），PRD 提到支持“有效期配置”（TP-021），但测试用例中没有任何一条验证“链接过期后点击”的场景。"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "【PRD Markdown】\n"
        f"{prd_text}\n\n"
        "【测试点 JSON】\n"
        f"{json.dumps(testpoints_data, ensure_ascii=False)}\n\n"
        "【测试用例 Review 报告】\n"
        f"{review_text}"
    )


def validate_supplement_remark(case: dict[str, Any]) -> None:
    remark = str(case.get("备注") or "").strip()
    too_generic_patterns = [
        r"^补充来源[:：]\s*Review\s*报告\s*(严重问题|覆盖遗漏|最终建议)?\s*\d*\s*$",
        r"^补充来源[:：]\s*Review\s*报告\s*$",
    ]
    if len(remark) < 40 or not any(keyword in remark for keyword in ["缺少", "遗漏", "补充", "PRD", "没有", "未覆盖"]):
        raise ValueError(f"补充用例备注不够明确，请写清楚补充原因: {remark}")
    for pattern in too_generic_patterns:
        if re.search(pattern, remark, flags=re.I):
            raise ValueError(f"补充用例备注过于笼统，请包含 Review 问题标题和原因摘要: {remark}")


def generate_review_supplement_cases(
    prd_text: str,
    testpoints_data: dict[str, Any],
    review_text: str,
) -> tuple[list[dict[str, Any]], str]:
    user_prompt = build_review_supplement_prompt(prd_text, testpoints_data, review_text)
    content = openai_chat(review_supplement_system_prompt(), user_prompt, temperature=0.1)
    data = parse_json_with_ai_repair(content)
    if isinstance(data, list):
        data = {"summary": "", "cases": data}

    cases = data.get("cases", [])
    if re.search(r"缺少|遗漏|补充|新增", review_text) and not cases:
        raise ValueError("Review 报告中存在遗漏/补充建议，但模型没有生成任何补充用例。")

    for index, case in enumerate(cases, start=1):
        if not case.get("_source_test_point_id"):
            case["_source_test_point_id"] = f"REVIEW-{index:03d}"
        case.setdefault("实际结果", "")
        case.setdefault("状态", "")
        if not case.get("备注"):
            case["备注"] = "补充来源：Review 报告，原因：模型未返回具体补充原因，请重新生成并补充 Review 问题标题和原因摘要。"
        validate_supplement_remark(case)
    return cases, content


def build_revision_summary_prompt(
    review_text: str,
    original_cases: dict[str, Any] | None,
    revised_cases: dict[str, Any],
) -> str:
    return (
        "请基于 Review 报告、原始测试用例和修订后测试用例，生成本次修订总结报告。\n\n"
        "输出 Markdown，不要输出代码块。\n"
        "必须包含以下章节：\n"
        "## 总体结论\n"
        "## 已修改项\n"
        "## 新增用例\n"
        "## 未修改项\n"
        "## 按审核意见处理情况\n"
        "## 仍需人工确认\n\n"
        "规则：\n"
        "1. 说明哪些 Review 建议已落实。\n"
        "2. 说明哪些建议因为审核意见为“忽略”没有处理。\n"
        "3. 说明哪些建议因为审核意见为“暂定”或“需产品确认”只在备注中保留问题说明。\n"
        "4. 如果新增了 REVIEW-xxx 用例，列出新增原因。\n"
        "5. 不要编造不存在的修改。\n\n"
        "【Review 报告】\n"
        f"{review_text}\n\n"
        "【原始测试用例 JSON】\n"
        f"{json.dumps(original_cases or {}, ensure_ascii=False)}\n\n"
        "【修订后测试用例 JSON】\n"
        f"{json.dumps(revised_cases, ensure_ascii=False)}"
    )


def generate_revision_summary(
    review_text: str,
    original_cases: dict[str, Any] | None,
    revised_cases: dict[str, Any],
) -> str:
    system_prompt = "你是测试用例修订记录员。请输出准确、可追溯的 Markdown 修订总结，不要输出代码块。"
    return openai_chat(system_prompt, build_revision_summary_prompt(review_text, original_cases, revised_cases), temperature=0.1)


def write_case_artifacts(run_dir: Path, data: dict[str, Any], raw_text: str, prefix: str) -> None:
    cases = data.get("cases", [])
    rows = cases_to_rows(cases)
    highlighted_rows = {
        index + 2
        for index, case in enumerate(cases)
        if str(case.get("_source_test_point_id") or "").startswith("REVIEW-")
    }
    json_path = run_dir / f"{prefix}.json"
    csv_path = run_dir / f"{prefix}.csv"
    xlsx_path = run_dir / f"{prefix}.xlsx"
    raw_path = run_dir / f"{prefix}.raw.txt"
    write_text(raw_path, raw_text)
    write_json(json_path, data)
    write_csv(csv_path, rows)
    write_xlsx(xlsx_path, rows, highlighted_rows=highlighted_rows)

    print(f"AI 原始返回: {raw_path}")
    print(f"测试用例 JSON: {json_path}")
    print(f"测试用例 CSV: {csv_path}")
    print(f"测试用例 XLSX: {xlsx_path}")


def write_csv(path: Path, rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerows(rows)


def xml_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def write_xlsx(path: Path, rows: list[list[str]], highlighted_rows: set[int] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    highlighted_rows = highlighted_rows or set()
    sheet_rows: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for col_index, value in enumerate(row, start=1):
            cell_ref = f"{column_name(col_index)}{row_index}"
            style = ' s="1"' if row_index in highlighted_rows else ""
            cells.append(f'<c r="{cell_ref}"{style} t="inlineStr"><is><t>{xml_escape(value)}</t></is></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(sheet_rows)}</sheetData>"
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="测试用例" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )
    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="3">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>'
        '</fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>'
        '</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", rels_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        archive.writestr("xl/styles.xml", styles_xml)
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)


def column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def read_skill(skill_name: str) -> str:
    path = Path("skills") / skill_name / "SKILL.md"
    return path.read_text(encoding="utf-8")


def openai_chat(system_prompt: str, user_prompt: str, *, temperature: float = 0.2) -> str:
    load_env_file(Path(".env.local"))

    api_key = os.environ.get(DEFAULT_API_KEY_ENV)
    base_url = os.environ.get(DEFAULT_BASE_URL_ENV)
    model = os.environ.get(DEFAULT_MODEL_ENV, DEFAULT_MODEL)

    if not api_key or not base_url:
        raise RuntimeError(
            "缺少 AI 模型配置。请先设置环境变量: "
            f"{DEFAULT_API_KEY_ENV}, {DEFAULT_BASE_URL_ENV}, {DEFAULT_MODEL_ENV}"
        )

    endpoint = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with request.urlopen(req, timeout=300) as response:
        data = json.loads(response.read().decode("utf-8"))

    return data["choices"][0]["message"]["content"]


def extract_json_object(text: str) -> Any:
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", stripped, flags=re.S | re.I)
    if fence:
        stripped = fence.group(1).strip()

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    start_candidates = [index for index in [stripped.find("{"), stripped.find("[")] if index >= 0]
    if not start_candidates:
        raise ValueError("AI 返回内容中没有 JSON 对象或数组。")
    start = min(start_candidates)
    end = max(stripped.rfind("}"), stripped.rfind("]"))
    if end <= start:
        raise ValueError("AI 返回内容中的 JSON 边界不完整。")
    candidate = stripped[start : end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        repaired = re.sub(r",\s*([}\]])", r"\1", candidate)
        if repaired != candidate:
            try:
                return json.loads(repaired)
            except json.JSONDecodeError:
                pass
        line = candidate.splitlines()[exc.lineno - 1] if exc.lineno <= len(candidate.splitlines()) else ""
        snippet = line[max(exc.colno - 60, 0) : exc.colno + 60]
        raise ValueError(
            f"{exc.msg}: line {exc.lineno} column {exc.colno} (char {exc.pos}); near: {snippet}"
        ) from exc


def command_prd_to_xmind(args: argparse.Namespace) -> None:
    prd = Path(args.prd).resolve()
    if not prd.exists():
        raise FileNotFoundError(f"PRD 文件不存在: {prd}")
    run_dir = Path(args.run_dir).resolve() if args.run_dir else default_run_dir(prd).resolve()
    title = prd.stem

    blocks = extract_docx_blocks(prd)
    markdown = blocks_to_markdown(title, blocks)
    tree = blocks_to_tree(title, blocks)

    markdown_path = run_dir / "01_prd_raw.md"
    json_path = run_dir / "02_prd_mindmap.json"
    xmind_path = run_dir / "02_prd_mindmap.xmind"
    metadata_path = run_dir / "run_metadata.json"

    write_text(markdown_path, markdown)
    write_json(json_path, {"title": title, "source": str(prd), "generated_at": now_iso(), "tree": tree})
    write_xmind(xmind_path, tree, sheet_title=title)
    write_json(
        metadata_path,
        {
            "prd": str(prd),
            "run_dir": str(run_dir),
            "generated_at": now_iso(),
            "steps": {"prd_to_xmind": True},
        },
    )

    print(f"PRD Markdown: {markdown_path}")
    print(f"原始 XMind JSON: {json_path}")
    print(f"原始 XMind 文件: {xmind_path}")


def command_import_manual_xmind(args: argparse.Namespace) -> None:
    prd = Path(args.prd).resolve()
    manual_xmind = Path(args.xmind).resolve()
    if not prd.exists():
        raise FileNotFoundError(f"PRD 文件不存在: {prd}")
    if not manual_xmind.exists():
        raise FileNotFoundError(f"人工测试点 XMind 文件不存在: {manual_xmind}")

    run_dir = Path(args.run_dir).resolve() if args.run_dir else default_run_dir(prd).resolve()
    validate_manual_import_names(prd, manual_xmind, run_dir, bool(args.allow_prd_mismatch))
    title = prd.stem

    blocks = extract_docx_blocks(prd)
    markdown = blocks_to_markdown(title, blocks)
    testpoints = manual_xmind_to_testpoints(manual_xmind, prd_path=prd)

    markdown_path = run_dir / "01_prd_raw.md"
    json_path = run_dir / "04_test_points_reviewed.json"
    xmind_path = run_dir / "04_test_points_reviewed.xmind"
    metadata_path = run_dir / "run_metadata.json"

    write_text(markdown_path, markdown)
    write_json(json_path, testpoints)
    write_xmind(xmind_path, testpoints_to_tree(testpoints), sheet_title="人工测试点")
    write_json(
        metadata_path,
        {
            "prd": str(prd),
            "manual_xmind": str(manual_xmind),
            "run_dir": str(run_dir),
            "generated_at": now_iso(),
            "allow_prd_mismatch": bool(args.allow_prd_mismatch),
            "steps": {"import_manual_xmind": True},
        },
    )

    print(f"PRD Markdown: {markdown_path}")
    print(f"人工测试点 JSON: {json_path}")
    print(f"人工测试点 XMind: {xmind_path}")
    print("下一步可执行: python scripts/ai_testcase_pipeline.py testpoints-to-cases --run-dir " + f'"{run_dir}"')


def command_xmind_to_testpoints(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    validate_run_context(run_dir)
    prd_md = first_existing(Path(args.prd_md).resolve() if args.prd_md else run_dir / "01_prd_raw.md")
    source_json = first_existing(
        Path(args.source_json).resolve() if args.source_json else run_dir / "02_prd_mindmap.json"
    )
    skill = read_skill("prd-xmind-testpoint-refactor")
    prd_text = prd_md.read_text(encoding="utf-8")
    source_data = read_json(source_json)

    system_prompt = skill + "\n\n你必须只输出 JSON，不要输出 Markdown 代码块，不要输出解释。"
    user_prompt = (
        "请将以下 PRD 和原始思维导图精炼为原子测试点清单。\n"
        "要求：保留原始 XMind 的标题层级；把每个标题下的需求句拆成多个短测试点；"
        "不要生成测试用例，不要输出前提条件、测试步骤、预期结果、优先级、类型。\n\n"
        "【PRD Markdown】\n"
        f"{prd_text}\n\n"
        "【原始思维导图 JSON】\n"
        f"{json.dumps(source_data, ensure_ascii=False)}"
    )
    content = openai_chat(system_prompt, user_prompt)
    data = extract_json_object(content)
    if isinstance(data, list):
        data = {"summary": "", "test_points": data}
    data.setdefault("generated_at", now_iso())

    json_path = run_dir / "03_test_points_draft.json"
    xmind_path = run_dir / "03_test_points_draft.xmind"
    raw_path = run_dir / "03_test_points_draft.raw.txt"
    write_text(raw_path, content)
    write_json(json_path, data)
    write_xmind(xmind_path, testpoints_to_tree(data), sheet_title="测试点总览")

    print(f"AI 原始返回: {raw_path}")
    print(f"测试点 JSON: {json_path}")
    print(f"测试点 XMind: {xmind_path}")


def testcase_generation_system_prompt() -> str:
    return (
        "你是资深测试架构师，负责根据 PRD 和测试点生成可执行测试用例。"
        "要求：只输出 JSON；不得编造 PRD 未出现的按钮、字段、接口；不确定内容标记为“需确认”；"
        "一条用例只验证一个核心目标；步骤必须可执行；预期结果必须可判断；"
        "测试用例字段必须严格使用：测试模块、用例标题、前提条件、测试步骤、预期结果、实际结果、状态、备注；"
        "必须为每一个输入测试点生成且只生成一条测试用例，禁止合并多个测试点。"
    )


def review_supplement_system_prompt() -> str:
    return (
        "你是资深测试负责人，负责把测试用例 Review 报告中的遗漏场景转成补充测试用例。"
        "只输出 JSON；不得忽略 Review 中明确要求补充的异常、边界、老用户、过期、失败、已存在等场景；"
        "补充用例字段必须严格使用：测试模块、用例标题、前提条件、测试步骤、预期结果、实际结果、状态、备注；"
        "备注必须说明补充原因，包含 Review 报告中的问题位置、问题标题和原因摘要。"
    )


def normalize_review_report(review_text: str) -> str:
    system_prompt = (
        "你是测试 Review 报告整理器。请输出 Markdown，不要输出代码块。"
        "你的任务是去重、规范表格、保留有效问题，不要新增未经原报告支持的问题。"
    )
    user_prompt = (
        "请整理下面的测试用例 Review 报告：\n\n"
        "强制规则：\n"
        "1. 删除“优先级调整建议”章节及所有 P0/P1/P2 调整内容。\n"
        "2. 对跨章节重复问题去重；同一关联用例/测试点 + 同一核心问题只能出现一次。\n"
        "3. 如果同一问题同时像 PRD 不一致和不可执行，保留在更贴近根因的章节，并在问题说明中合并原因。\n"
        "4. 以下章节必须是 Markdown 表格，且包含“审核意见”列：严重问题、覆盖遗漏、PRD 不一致或疑似编造、不可执行/预期不可判断、重复或可合并用例、自动化建议。\n"
        "5. 审核意见默认写“待人工审核”。\n"
        "6. 保留总体结论和最终建议。\n\n"
        "原始 Review 报告：\n"
        f"{review_text}"
    )
    return openai_chat(system_prompt, user_prompt, temperature=0.1)


def command_testpoints_to_cases(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    validate_run_context(run_dir)
    prd_md = first_existing(Path(args.prd_md).resolve() if args.prd_md else run_dir / "01_prd_raw.md")
    testpoints_json = first_existing(
        Path(args.testpoints_json).resolve() if args.testpoints_json else run_dir / "04_test_points_reviewed.json",
        run_dir / "03_test_points_draft.json",
    )
    prd_text = prd_md.read_text(encoding="utf-8")
    testpoints = read_json(testpoints_json)
    data, raw_text = generate_cases_from_testpoints(
        prd_text,
        testpoints,
        debug_dir=run_dir,
        debug_prefix="05_test_cases",
    )
    normalize_case_modules(data.get("cases", []), testpoints)
    data["source_test_points"] = str(testpoints_json)
    write_case_artifacts(run_dir, data, raw_text, "05_test_cases")


def command_review_cases(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    validate_run_context(run_dir)
    prd_md = first_existing(Path(args.prd_md).resolve() if args.prd_md else run_dir / "01_prd_raw.md")
    testpoints_json = first_existing(
        Path(args.testpoints_json).resolve() if args.testpoints_json else run_dir / "04_test_points_reviewed.json",
        run_dir / "03_test_points_draft.json",
    )
    cases_json = first_existing(Path(args.cases_json).resolve() if args.cases_json else run_dir / "05_test_cases.json")

    skill = read_skill("testcase-reviewer")
    prd_text = prd_md.read_text(encoding="utf-8")
    testpoints = read_json(testpoints_json)
    cases = read_json(cases_json)

    system_prompt = (
        skill
        + "\n\n请输出 Markdown Review 报告，不要输出代码块。"
        + "不要输出“优先级调整建议”章节。"
        + "需要人工介入的章节必须使用 Markdown 表格，并包含“审核意见”列，默认值写“待人工审核”。"
    )
    user_prompt = (
        "请基于 PRD、测试点和测试用例进行 Review。\n\n"
        "【PRD Markdown】\n"
        f"{prd_text}\n\n"
        "【测试点 JSON】\n"
        f"{json.dumps(testpoints, ensure_ascii=False)}\n\n"
        "【测试用例 JSON】\n"
        f"{json.dumps(cases, ensure_ascii=False)}"
    )
    report = openai_chat(system_prompt, user_prompt, temperature=0.1)
    raw_report_path = run_dir / "06_test_case_review.raw.md"
    write_text(raw_report_path, report)
    report = normalize_review_report(report)
    report_path = run_dir / "06_test_case_review.md"
    write_text(report_path, report)
    print(f"原始 Review 报告: {raw_report_path}")
    print(f"测试用例 Review 报告: {report_path}")


def command_revise_cases(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    validate_run_context(run_dir)
    prd_md = first_existing(Path(args.prd_md).resolve() if args.prd_md else run_dir / "01_prd_raw.md")
    testpoints_json = first_existing(
        Path(args.testpoints_json).resolve() if args.testpoints_json else run_dir / "04_test_points_reviewed.json",
        run_dir / "03_test_points_draft.json",
    )
    review_md = first_existing(Path(args.review_md).resolve() if args.review_md else run_dir / "06_test_case_review.md")

    prd_text = prd_md.read_text(encoding="utf-8")
    testpoints = read_json(testpoints_json)
    review_text = review_md.read_text(encoding="utf-8")
    original_cases_path = run_dir / "05_test_cases.json"
    original_cases = read_json(original_cases_path) if original_cases_path.exists() else None

    data, raw_text = generate_cases_from_testpoints(
        prd_text,
        testpoints,
        review_text=review_text,
        debug_dir=run_dir,
        debug_prefix="07_test_cases_revised",
    )
    supplement_cases, supplement_raw = generate_review_supplement_cases(prd_text, testpoints, review_text)
    data["cases"].extend(supplement_cases)
    normalize_case_modules(data.get("cases", []), testpoints)
    data["summary"] = (
        f"{data['summary']} 另根据 Review 报告补充 {len(supplement_cases)} 条额外测试用例。"
    )
    data["source_test_points"] = str(testpoints_json)
    data["source_review"] = str(review_md)
    write_case_artifacts(
        run_dir,
        data,
        raw_text + "\n\n===== review supplement =====\n" + supplement_raw,
        "07_test_cases_revised",
    )
    summary = generate_revision_summary(review_text, original_cases, data)
    summary_path = run_dir / "08_revision_summary.md"
    write_text(summary_path, summary)
    print(f"修订总结报告: {summary_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI 测试用例生成流水线，支持按步骤手动执行。")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prd_to_xmind = subparsers.add_parser("prd-to-xmind", help="将 PRD docx 转换为 Markdown、原始 XMind JSON 和 XMind 文件。")
    prd_to_xmind.add_argument("--prd", default=str(DEFAULT_PRD), help="PRD docx 路径。")
    prd_to_xmind.add_argument("--run-dir", default=None, help="输出目录，默认 output/ai-testcase-generation/<PRD文件名>。")
    prd_to_xmind.set_defaults(func=command_prd_to_xmind)

    import_manual_xmind = subparsers.add_parser(
        "import-manual-xmind",
        help="导入人工编写的测试点 XMind，并结合 PRD docx 生成 01_prd_raw.md 与 04_test_points_reviewed.json。",
    )
    import_manual_xmind.add_argument("--prd", required=True, help="PRD docx 路径。")
    import_manual_xmind.add_argument("--xmind", required=True, help="人工编写的测试点 XMind 文件路径。")
    import_manual_xmind.add_argument("--run-dir", default=None, help="输出目录，默认 output/ai-testcase-generation/<PRD文件名>。")
    import_manual_xmind.add_argument(
        "--allow-prd-mismatch",
        action="store_true",
        help="允许 PRD、人工 XMind、run-dir 名称不一致。默认不允许，用于防止复制错 PRD。",
    )
    import_manual_xmind.set_defaults(func=command_import_manual_xmind)

    xmind_to_testpoints = subparsers.add_parser("xmind-to-testpoints", help="调用 AI 将原始 XMind 重构为测试点。")
    xmind_to_testpoints.add_argument("--run-dir", required=True, help="流水线输出目录。")
    xmind_to_testpoints.add_argument("--prd-md", default=None, help="PRD Markdown 路径，默认 run-dir/01_prd_raw.md。")
    xmind_to_testpoints.add_argument("--source-json", default=None, help="原始思维导图 JSON，默认 run-dir/02_prd_mindmap.json。")
    xmind_to_testpoints.set_defaults(func=command_xmind_to_testpoints)

    testpoints_to_cases = subparsers.add_parser("testpoints-to-cases", help="调用 AI 根据测试点和 PRD 生成测试用例。")
    testpoints_to_cases.add_argument("--run-dir", required=True, help="流水线输出目录。")
    testpoints_to_cases.add_argument("--prd-md", default=None, help="PRD Markdown 路径，默认 run-dir/01_prd_raw.md。")
    testpoints_to_cases.add_argument("--testpoints-json", default=None, help="测试点 JSON，默认优先使用 04_reviewed，其次使用 03_draft。")
    testpoints_to_cases.set_defaults(func=command_testpoints_to_cases)

    review_cases = subparsers.add_parser("review-cases", help="调用 AI Review 测试用例。")
    review_cases.add_argument("--run-dir", required=True, help="流水线输出目录。")
    review_cases.add_argument("--prd-md", default=None, help="PRD Markdown 路径，默认 run-dir/01_prd_raw.md。")
    review_cases.add_argument("--testpoints-json", default=None, help="测试点 JSON，默认优先使用 04_reviewed，其次使用 03_draft。")
    review_cases.add_argument("--cases-json", default=None, help="测试用例 JSON，默认 run-dir/05_test_cases.json。")
    review_cases.set_defaults(func=command_review_cases)

    revise_cases = subparsers.add_parser("revise-cases", help="结合 Review 报告、PRD 和测试点重新生成测试用例。")
    revise_cases.add_argument("--run-dir", required=True, help="流水线输出目录。")
    revise_cases.add_argument("--prd-md", default=None, help="PRD Markdown 路径，默认 run-dir/01_prd_raw.md。")
    revise_cases.add_argument("--testpoints-json", default=None, help="测试点 JSON，默认优先使用 04_reviewed，其次使用 03_draft。")
    revise_cases.add_argument("--review-md", default=None, help="Review 报告路径，默认 run-dir/06_test_case_review.md。")
    revise_cases.set_defaults(func=command_revise_cases)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        print(f"执行失败: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
