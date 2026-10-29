#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""本地开发服务器：静态文件 + 服务端暂存 API。

参照 rustomp-circuit-designer 的 `designer.save` / `designer.last` 语义：

    POST /api/draft  { "name": "...", "doc": { ... } }
        → 写 <repo>/.cache/designs/<name>.box.json + last 指针
        → { "path": "...", "file": "...", "bytes": N }

    GET  /api/draft
        → { "name", "file", "path", "bytes", "doc" } 或 null

零依赖（只用 Python 标准库）。`scripts/dev.sh` 用它替代 `python3 -m http.server`；
也可以 `BOXD_DATA=/tmp/boxd-drafts python3 scripts/server.py 8765`。
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("BOXD_DATA", ROOT / ".cache" / "designs")).expanduser()
API = "/api/draft"
MAX_BODY = 8 * 1024 * 1024  # 8 MB：设计稿远小于这个数


def safe_name(name: object) -> str:
    """名字只当文件名；去掉路径分隔符与危险字符（与 circuit-designer 同思路）。"""
    s = str(name or "")
    bad = '/\\:*?"<>|{}[]$#%&@!`\'~^+=,;'
    s = "".join("_" if (c in bad or ord(c) < 32) else c for c in s)
    s = s.strip().strip(".")
    if not s:
        s = "未命名面板"
    return s[:80]


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, path)


def save_draft(name: object, doc: dict) -> dict:
    file = f"{safe_name(name)}.box.json"
    path = DATA / file
    text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    atomic_write(path, text)
    atomic_write(DATA / "last", file)
    return {"path": str(path.resolve()), "file": file, "bytes": len(text.encode("utf-8"))}


def last_draft() -> dict | None:
    DATA.mkdir(parents=True, exist_ok=True)
    ptr = DATA / "last"
    file = ptr.read_text(encoding="utf-8").strip() if ptr.is_file() else ""
    if not file:
        # 指针缺失（例如功能上线前存的草稿）→ 取缓存里最新的一份，并补上指针
        candidates = [p for p in DATA.glob("*.box.json") if p.is_file()]
        if not candidates:
            return None
        newest = max(candidates, key=lambda p: p.stat().st_mtime)
        file = newest.name
        atomic_write(ptr, file)
    path = DATA / file
    if not path.is_file():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    name = doc.get("name") if isinstance(doc, dict) else None
    return {
        "name": str(name or Path(file).stem),
        "file": file,
        "path": str(path.resolve()),
        "bytes": path.stat().st_size,
        "doc": doc,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        # 改 src/*.js 后刷新即生效；与旧 dev.sh 的"本地开发不留缓存"一致
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status: int, obj: object) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == API:
            try:
                self._json(200, last_draft())
            except Exception as e:  # noqa: BLE001 - 开发服务，错误要原样回给前端
                self._json(500, {"error": f"读取暂存失败：{e}"})
            return
        # 缓存里是用户的草稿，不通过静态文件服务暴露
        if path.startswith("/.cache"):
            self._json(404, {"error": "not found"})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path != API:
            self._json(404, {"error": f"not found：{path}"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                raise ValueError("空请求体")
            if length > MAX_BODY:
                raise ValueError(f"请求体太大（{length} > {MAX_BODY}）")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("请求体必须是 JSON 对象")
            doc = payload.get("doc")
            if not isinstance(doc, dict):
                raise ValueError("doc 必须是对象")
            name = payload.get("name") or doc.get("name") or "未命名面板"
            self._json(200, save_draft(name, doc))
        except json.JSONDecodeError as e:
            self._json(400, {"error": f"JSON 解析失败：{e}"})
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": f"写入暂存失败：{e}"})

    def log_message(self, fmt: str, *args) -> None:
        # 静态请求太吵；只记录暂存 API
        if API in self.path:
            super().log_message(fmt, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("BOXD_PORT", "8765"))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(
        f"box-designer → http://127.0.0.1:{httpd.server_address[1]}/"
        f"  （暂存 API：{API}；数据目录：{DATA}）",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
