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
            "请优先修复 Review 报告中指出的遗漏、不可执行、预期不清晰、PRD 不一致和优先级不合理等问题。\n"
            "如果 Review 报告与 PRD 或测试点冲突，以 PRD 和测试点为准。\n\n"
        )

    return (
        f"请基于 PRD 和本批测试点生成测试用例。本批次编号：{batch_index}。\n\n"
        "强制规则：\n"
        "1. 输入有几个测试点，就必须输出几条测试用例，不能少，不能合并。\n"
        "2. 每条测试用例只能覆盖一个测试点。\n"
        "3. 每条测试用例必须带 `_source_test_point_id`，值必须等于输入测试点的 id。\n"
        "4. `实际结果`、`状态`、`备注` 必须是空字符串。\n"
        "5. 导出表格只会使用中文 8 列，但 JSON 中必须保留 `_source_test_point_id` 供脚本校验。\n\n"
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


def generate_cases_from_testpoints(
    prd_text: str,
    testpoints_data: dict[str, Any],
    *,
    review_text: str | None = None,
) -> tuple[dict[str, Any], str]:
    all_testpoints = normalize_testpoint_ids(testpoints_data.get("test_points", []))
    if not all_testpoints:
        raise ValueError("测试点为空，无法生成测试用例。")

    all_cases: list[dict[str, Any]] = []
    raw_parts: list[str] = []
    for batch_index, chunk in enumerate(iter_chunks(all_testpoints, 8), start=1):
        user_prompt = build_testcase_prompt(prd_text, chunk, batch_index, review_text=review_text)
        content = openai_chat(testcase_generation_system_prompt(), user_prompt)
        raw_parts.append(f"===== batch {batch_index} =====\n{content}")
        batch_data = extract_json_object(content)
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
        "2. 不要重复已有测试点已经覆盖的正常流程。\n"
        "3. 重点补充异常、边界、老用户、过期、失败、已存在等 Review 提到的场景。\n"
        "4. 如果 Review 中某个建议缺少 PRD 支撑或需要产品确认，也要生成用例，但在 `备注` 中写明“需产品确认”。\n"
        "5. 每条补充用例必须带 `_source_test_point_id`，格式为 `REVIEW-001`、`REVIEW-002`。\n"
        "6. `实际结果`、`状态` 必须是空字符串。\n\n"
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
    data = extract_json_object(content)
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


def write_case_artifacts(run_dir: Path, data: dict[str, Any], raw_text: str, prefix: str) -> None:
    cases = data.get("cases", [])
    rows = cases_to_rows(cases)
    json_path = run_dir / f"{prefix}.json"
    csv_path = run_dir / f"{prefix}.csv"
    xlsx_path = run_dir / f"{prefix}.xlsx"
    raw_path = run_dir / f"{prefix}.raw.txt"
    write_text(raw_path, raw_text)
    write_json(json_path, data)
    write_csv(csv_path, rows)
    write_xlsx(xlsx_path, rows)

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


def write_xlsx(path: Path, rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet_rows: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for col_index, value in enumerate(row, start=1):
            cell_ref = f"{column_name(col_index)}{row_index}"
            cells.append(f'<c r="{cell_ref}" t="inlineStr"><is><t>{xml_escape(value)}</t></is></c>')
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
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", rels_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
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
    return json.loads(stripped[start : end + 1])


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


def command_xmind_to_testpoints(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
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


def command_testpoints_to_cases(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    prd_md = first_existing(Path(args.prd_md).resolve() if args.prd_md else run_dir / "01_prd_raw.md")
    testpoints_json = first_existing(
        Path(args.testpoints_json).resolve() if args.testpoints_json else run_dir / "04_test_points_reviewed.json",
        run_dir / "03_test_points_draft.json",
    )
    prd_text = prd_md.read_text(encoding="utf-8")
    testpoints = read_json(testpoints_json)
    data, raw_text = generate_cases_from_testpoints(prd_text, testpoints)
    data["source_test_points"] = str(testpoints_json)
    write_case_artifacts(run_dir, data, raw_text, "05_test_cases")


def command_review_cases(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
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

    system_prompt = skill + "\n\n请输出 Markdown Review 报告，不要输出代码块。"
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
    report_path = run_dir / "06_test_case_review.md"
    write_text(report_path, report)
    print(f"测试用例 Review 报告: {report_path}")


def command_revise_cases(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).resolve()
    prd_md = first_existing(Path(args.prd_md).resolve() if args.prd_md else run_dir / "01_prd_raw.md")
    testpoints_json = first_existing(
        Path(args.testpoints_json).resolve() if args.testpoints_json else run_dir / "04_test_points_reviewed.json",
        run_dir / "03_test_points_draft.json",
    )
    review_md = first_existing(Path(args.review_md).resolve() if args.review_md else run_dir / "06_test_case_review.md")

    prd_text = prd_md.read_text(encoding="utf-8")
    testpoints = read_json(testpoints_json)
    review_text = review_md.read_text(encoding="utf-8")

    data, raw_text = generate_cases_from_testpoints(prd_text, testpoints, review_text=review_text)
    supplement_cases, supplement_raw = generate_review_supplement_cases(prd_text, testpoints, review_text)
    data["cases"].extend(supplement_cases)
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI 测试用例生成流水线，支持按步骤手动执行。")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prd_to_xmind = subparsers.add_parser("prd-to-xmind", help="将 PRD docx 转换为 Markdown、原始 XMind JSON 和 XMind 文件。")
    prd_to_xmind.add_argument("--prd", default=str(DEFAULT_PRD), help="PRD docx 路径。")
    prd_to_xmind.add_argument("--run-dir", default=None, help="输出目录，默认 output/ai-testcase-generation/<PRD文件名>。")
    prd_to_xmind.set_defaults(func=command_prd_to_xmind)

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
