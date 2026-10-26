#!/usr/bin/env bash
# 本地起静态服务（浏览器不让 file:// 加载 ES modules）
# 用法：./scripts/dev.sh [端口]，默认 8765
set -euo pipefail
PORT="${1:-8765}"
cd "$(dirname "$0")/.."
echo "→ http://localhost:${PORT}/"
exec python3 -m http.server "${PORT}" --bind 127.0.0.1
