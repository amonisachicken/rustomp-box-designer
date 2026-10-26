import { test } from "node:test";
import assert from "node:assert/strict";
import { zipStore, crc32 } from "../src/zip.js";

const bytes = (s) => new TextEncoder().encode(s);

/** 极简 zip 解析：只读 EOCD + 中央目录，够验证"能被标准工具读" */
function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // 找 EOCD（从尾部往前扫）
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, "找不到 EOCD");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(off, true), 0x02014b50, "中央目录签名");
    const method = dv.getUint16(off + 10, true);
    const crc = dv.getUint32(off + 16, true);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    // 本地头里的数据
    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtra = dv.getUint16(lho + 28, true);
    const data = u8.subarray(lho + 30 + lNameLen + lExtra, lho + 30 + lNameLen + lExtra + size);
    out.push({ name, method, crc, size, data });
    off += 46 + nameLen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
  }
  return out;
}

test("crc32 与已知值一致（PNG 用的同一个多项式）", () => {
  assert.equal(crc32(bytes("123456789")), 0xcbf43926);
});

test("zip：条目名、内容、CRC 都对，且不压缩", () => {
  const files = [
    { name: "ui.toml", data: bytes("[ui]\nsvg_width = 60\n") },
    { name: "panel.svg", data: bytes("<svg/>") },
  ];
  const blob = zipStore(files);
  assert.equal(blob.type, "application/zip");
  return blob.arrayBuffer().then((buf) => {
    const entries = readZip(new Uint8Array(buf));
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => e.name), ["ui.toml", "panel.svg"]);
    for (const e of entries) {
      assert.equal(e.method, 0, "store");
      const orig = files.find((f) => f.name === e.name).data;
      assert.equal(e.size, orig.length);
      assert.equal(e.crc, crc32(orig));
      assert.deepEqual([...e.data], [...orig]);
    }
  });
});

test("zip：带空格的文件名会被拒绝（避免各家解压器差异）", () => {
  assert.throws(() => zipStore([{ name: "a b.toml", data: bytes("x") }]), /空格/);
});
