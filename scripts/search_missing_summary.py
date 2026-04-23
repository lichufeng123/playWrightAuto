import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PATTERN = re.compile(
    r"该session:\s*(?P<session_id>\d+)\s*没有数据提取summary:\s*Session\s+(?P=session_id)\s+not found!"
)


def iter_json_files(log_dir: Path) -> Iterable[Path]:
    yield from sorted(log_dir.rglob("*.json"))


def iter_json_objects(file_path: Path) -> Iterable[tuple[int, dict[str, Any]]]:
    text = file_path.read_text(encoding="utf-8")
    stripped = text.strip()
    if not stripped:
        return

    try:
        value = json.loads(stripped)
        if isinstance(value, list):
            for index, item in enumerate(value, start=1):
                if isinstance(item, dict):
                    yield index, item
        elif isinstance(value, dict):
            yield 1, value
        return
    except json.JSONDecodeError:
        pass

    for line_number, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            yield line_number, value


def search(log_dir: Path, output: Path) -> tuple[list[dict[str, Any]], int]:
    matches: list[dict[str, Any]] = []
    searched_file_count = 0

    for file_path in iter_json_files(log_dir):
        if file_path.resolve() == output.resolve():
            continue
        searched_file_count += 1
        for line_number, record in iter_json_objects(file_path):
            msg = record.get("msg")
            if not isinstance(msg, str):
                continue

            matched = PATTERN.search(msg)
            if not matched:
                continue

            matches.append(
                {
                    "session_id": matched.group("session_id"),
                    "file": str(file_path),
                    "line": line_number,
                    "time_stamp": record.get("time_stamp"),
                    "log_level": record.get("log_level"),
                    "msg": msg,
                }
            )

    return matches, searched_file_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="检索 Log 目录 json 文件中 msg 字段是否包含 session summary not found 信息。"
    )
    parser.add_argument(
        "--log-dir",
        default="Log",
        help="日志目录，默认是项目根目录下的 Log。",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="结果 JSON 文件路径，默认写入 <log-dir>/missing_summary_result.json。",
    )
    args = parser.parse_args()

    log_dir = Path(args.log_dir).resolve()
    if not log_dir.exists():
        raise FileNotFoundError(f"日志目录不存在: {log_dir}")

    output = Path(args.output).resolve() if args.output else log_dir / "missing_summary_result.json"
    matches, searched_file_count = search(log_dir, output)
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "log_dir": str(log_dir),
        "searched_file_count": searched_file_count,
        "match_count": len(matches),
        "session_ids": sorted({item["session_id"] for item in matches}),
        "matches": matches,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"扫描目录: {log_dir}")
    print(f"扫描文件数: {searched_file_count}")
    print(f"命中数量: {len(matches)}")
    print(f"结果文件: {output}")


if __name__ == "__main__":
    main()
