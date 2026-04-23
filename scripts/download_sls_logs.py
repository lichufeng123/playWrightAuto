import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_PROJECT = "k8s-log-custom-insight-test"
DEFAULT_LOGSTORE = "biz-log"
DEFAULT_QUERY = "service_name = MultiAgentServer"
DEFAULT_OUTPUT_DIR = "Log"


def load_env_file(file_path: Path) -> None:
    if not file_path.exists():
        return

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def env_value(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return default


def normalize_endpoint(endpoint: str) -> str:
    return endpoint.replace("https://", "").replace("http://", "").rstrip("/")


def parse_time(value: str) -> int:
    if value.isdigit():
        return int(value)

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ]
    for fmt in formats:
        try:
            return int(datetime.strptime(value, fmt).timestamp())
        except ValueError:
            continue

    raise ValueError(f"不支持的时间格式: {value}")


def build_time_range(args: argparse.Namespace) -> tuple[int, int]:
    if args.from_time and args.to_time:
        return parse_time(args.from_time), parse_time(args.to_time)

    to_time = int(time.time())
    from_time = int((datetime.now() - timedelta(minutes=args.last_minutes)).timestamp())
    return from_time, to_time


def import_sls_sdk():
    try:
        from aliyun.log import LogClient  # type: ignore
        return LogClient
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "缺少阿里云日志服务 Python SDK，请先执行: pip install aliyun-log-python-sdk"
        ) from exc


def log_item_to_dict(item: Any) -> dict[str, Any]:
    contents = getattr(item, "contents", None)
    if isinstance(contents, dict):
        return dict(contents)

    if isinstance(item, dict):
        return dict(item)

    if hasattr(item, "get_contents"):
        value = item.get_contents()
        if isinstance(value, dict):
            return dict(value)

    return {"raw": str(item)}


def download_logs(args: argparse.Namespace) -> dict[str, Any]:
    load_env_file(Path(args.env_file))

    access_key_id = env_value("ALIYUN_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID")
    access_key_secret = env_value("ALIYUN_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET")
    endpoint = env_value("ALIYUN_SLS_ENDPOINT", default=args.endpoint)
    project = env_value("ALIYUN_SLS_PROJECT", default=args.project)
    logstore = env_value("ALIYUN_SLS_LOGSTORE", default=args.logstore)
    query = args.query or env_value("ALIYUN_SLS_QUERY", default=DEFAULT_QUERY)

    missing = [
        name
        for name, value in {
            "ALIYUN_ACCESS_KEY_ID": access_key_id,
            "ALIYUN_ACCESS_KEY_SECRET": access_key_secret,
            "ALIYUN_SLS_ENDPOINT": endpoint,
            "ALIYUN_SLS_PROJECT": project,
            "ALIYUN_SLS_LOGSTORE": logstore,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"缺少必要配置: {', '.join(missing)}")

    from_time, to_time = build_time_range(args)
    if from_time >= to_time:
        raise ValueError(f"from_time 必须小于 to_time: from={from_time}, to={to_time}")

    LogClient = import_sls_sdk()
    client = LogClient(normalize_endpoint(endpoint), access_key_id, access_key_secret)

    records: list[dict[str, Any]] = []
    for item in client.get_log_all_v2(
        project,
        logstore,
        from_time,
        to_time,
        query=query,
        reverse=False,
    ):
        records.append(log_item_to_dict(item))

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "endpoint": endpoint,
        "project": project,
        "logstore": logstore,
        "from_time": from_time,
        "to_time": to_time,
        "query": query,
        "count": len(records),
        "logs": records,
    }


def build_output_path(output_dir: Path, from_time: int, to_time: int) -> Path:
    start = datetime.fromtimestamp(from_time).strftime("%Y%m%d_%H%M%S")
    end = datetime.fromtimestamp(to_time).strftime("%Y%m%d_%H%M%S")
    return output_dir / f"sls_logs_{start}_{end}.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="从阿里云 SLS 下载 MultiAgentServer 日志到本地 JSON 文件。")
    parser.add_argument("--env-file", default=".env.local", help="环境变量文件，默认读取 .env.local。")
    parser.add_argument("--endpoint", default="https://cn-guangzhou-intranet.log.aliyuncs.com")
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--logstore", default=DEFAULT_LOGSTORE)
    parser.add_argument("--query", default=None, help=f"默认: {DEFAULT_QUERY}")
    parser.add_argument("--from", dest="from_time", default=None, help="开始时间，支持 Unix 秒级时间戳或 YYYY-MM-DD HH:mm:ss。")
    parser.add_argument("--to", dest="to_time", default=None, help="结束时间，支持 Unix 秒级时间戳或 YYYY-MM-DD HH:mm:ss。")
    parser.add_argument("--last-minutes", type=int, default=30, help="未传 --from/--to 时，默认下载最近 N 分钟日志。")
    parser.add_argument("--output", default=None, help="输出 JSON 文件路径。")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="未传 --output 时的输出目录。")
    args = parser.parse_args()

    try:
        result = download_logs(args)
    except Exception as exc:
        print(f"下载 SLS 日志失败: {exc}", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output).resolve() if args.output else build_output_path(
        Path(args.output_dir).resolve(),
        result["from_time"],
        result["to_time"],
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"下载完成: {output_path}")
    print(f"日志条数: {result['count']}")
    print(f"时间范围: {result['from_time']} -> {result['to_time']}")
    print(f"查询语句: {result['query']}")


if __name__ == "__main__":
    main()
