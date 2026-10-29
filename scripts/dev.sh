#!/usr/bin/env bash
# 本地起开发服务（静态文件 + 暂存 API）
# 用法：./scripts/dev.sh [端口]，默认 8765
# 暂存目录默认 <repo>/.cache/designs，可用 BOXD_DATA 覆盖
set -euo pipefail
PORT="${1:-8765}"
cd "$(dirname "$0")/.."
exec python3 scripts/server.py "${PORT}"
