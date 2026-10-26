#!/usr/bin/env bash
# 一条命令跑完 D0 的全部校验（不含浏览器交互）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/4 素材清单无漂移"
node scripts/gen-assets.mjs --check

echo "== 2/4 纯逻辑测试（模型 / 内联 / 导出）"
node --test "tests/*.test.mjs" 2>&1 | tail -6

echo "== 3/4 示例面板导出（SVG + PNG + ui.toml）"
OUT="${TMPDIR:-/tmp}/boxd-check"
rm -rf "$OUT"
node scripts/export.mjs examples/sparklin.box.json --out "$OUT" | tail -3

echo "== 4/4 产物尺寸校验（12 px/mm）"
KNOB_MM="$(node --input-type=module -e 'import {byId} from "./src/assets.gen.js"; const a=byId("knob_round_dark"); console.log(a.size_mm[0], a.size_mm[1]);')"
python3 - "$OUT" "$KNOB_MM" <<'PY'
import struct, sys, pathlib
out = pathlib.Path(sys.argv[1])
def png_size(p):
    d = p.read_bytes()[:33]
    w, h = struct.unpack(">II", d[16:24])
    return w, h
ok = True
knob = tuple(float(v) for v in sys.argv[2].split())
for name, mm in [("panel.png", (60, 112)), ("knob_round_dark.png", knob)]:
    p = out / name
    w, h = png_size(p)
    want = (round(mm[0] * 12), round(mm[1] * 12))
    good = abs(w - want[0]) <= 1 and abs(h - want[1]) <= 1
    ok &= good
    print(f"  {'✓' if good else '✗'} {name}: {w}×{h}（期望 ≈{want[0]}×{want[1]}）")
sys.exit(0 if ok else 1)
PY
echo "== 全部通过"
