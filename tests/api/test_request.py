import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pytest
import requests

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "InputData.json")
DEFAULT_LOG_DIR = os.path.join(BASE_DIR, "test-results", "api")
DEFAULT_URL = "https://gapi-test.idealead.com/game-ai-editor-center/api/v2/workflow/invoke"
DEFAULT_TOKEN = (
    "eyJ0eXAiOiJKV1QiLCJraWQiOiJwcml2YXRlLTIwMjUtMDktMDEiLCJhbGciOiJSUzI1NiJ9."
    "eyJpc3MiOiJ1c2VyLXNlcnZlciIsImF1ZCI6ImdhdGV3YXkiLCJzdWIiOiIxMDA0MzciLCJ1c2Vy"
    "SWQiOjEwMDQzNywiaWF0IjoxNzczMzgyOTk1LCJleHAiOjE3NzM5ODc3OTV9.hE-OrCeA8X4"
    "dP52Hw-V_6CpVAkn6mdqhTk0_-eWW1-Rhi3mxzLv2t2ZN9-fjBYd-VsZ30Dsag5X-loLG87P"
    "qBzzq1R8ARYm8z1OFcVF3otnz28N-s291zX_kWFPK49VOHVnPyzrVkrRG2_IwBjA6SNx0a"
    "I-oHd44KngSwEhUj-GUgPKFZFKip5pe8qsF6dp814udupDmWozvH0B_3CjBQA7zHEpZFiu"
    "BK3UFfwrrB5qSZe8sauUQIXQZSmGSY8Sxi1tZLF-2i8f0YYnMopVG34XygsCstRHS2pGJq"
    "3j6MKeSqxucB_mC2D-ttXJ0rHCnLYWWQ7LVP0YGtOyrJdWmlg"
)

_thread_local = threading.local()


def get_session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        _thread_local.session = session
    return session


def load_payloads(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError("InputData.json must be a JSON array")
    return data


def build_headers(token: str) -> Dict[str, str]:
    if not token:
        raise ValueError("Missing API token. Set API_TOKEN or edit DEFAULT_TOKEN.")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_log_path() -> str:
    log_path = os.getenv("LOG_FILE")
    if log_path:
        return log_path
    worker = os.getenv("PYTEST_XDIST_WORKER", "main")
    return os.path.join(DEFAULT_LOG_DIR, f"request_log_{worker}.jsonl")


def write_log(entry: Dict[str, Any], log_path: str) -> None:
    log_dir = os.path.dirname(log_path)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as log_handle:
        log_handle.write(json.dumps(entry, ensure_ascii=True) + "\n")


def post_one(
    index: int,
    payload: Dict[str, Any],
    url: str,
    headers: Dict[str, str],
    timeout: Tuple[float, float],
) -> Dict[str, Any]:
    session = get_session()
    start_perf = time.perf_counter()
    start_time = datetime.now().isoformat(timespec="milliseconds")
    response_data: Any = None
    status_code: Optional[int] = None
    error: Optional[str] = None
    preview = ""
    try:
        response = session.post(url, json=payload, headers=headers, timeout=timeout)
        status_code = response.status_code
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                response_data = response.json()
                preview = json.dumps(response_data, ensure_ascii=True)
            except ValueError:
                response_data = response.text
                preview = response.text
        else:
            response_data = response.text
            preview = response.text
    except Exception as exc:
        error = str(exc)
        preview = error

    preview = preview.replace("\r", " ").replace("\n", " ")
    if len(preview) > 300:
        preview = preview[:300] + "..."

    elapsed_ms = int((time.perf_counter() - start_perf) * 1000)
    end_time = datetime.now().isoformat(timespec="milliseconds")
    ok = status_code is not None and 200 <= status_code < 300

    return {
        "index": index,
        "url": url,
        "start_time": start_time,
        "end_time": end_time,
        "elapsed_ms": elapsed_ms,
        "status_code": status_code,
        "ok": ok,
        "payload": payload,
        "response": response_data,
        "error": error,
        "preview": preview,
    }


@pytest.mark.api
def test_workflow_invoke_concurrent() -> None:
    url = os.getenv("API_URL", DEFAULT_URL)
    token = os.getenv("API_TOKEN", DEFAULT_TOKEN)
    concurrency = int(os.getenv("CONCURRENCY", "10"))
    timeout_seconds = float(os.getenv("API_TIMEOUT", "60"))
    timeout = (10.0, timeout_seconds)

    payloads = load_payloads(DATA_FILE)
    assert payloads, "No payloads found in InputData.json"

    headers = build_headers(token)
    log_path = get_log_path()
    failures: List[str] = []
    max_workers = min(concurrency, len(payloads))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(post_one, index, payload, url, headers, timeout)
            for index, payload in enumerate(payloads)
        ]
        for future in as_completed(futures):
            entry = future.result()
            write_log(entry, log_path)
            if not entry["ok"]:
                failures.append(
                    f'index={entry["index"]} status={entry["status_code"]} error={entry["error"]}'
                )

    if failures:
        pytest.fail("Non-2xx responses: " + "; ".join(failures))
