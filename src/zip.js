// 最小 ZIP 写入器（store，不压缩）。
//
// 为什么自己写：设计器是**零依赖**的（docs/00-decisions.md D-001），
// 而"导出时把素材打包下载"必须有个 zip。store 模式不需要 deflate，
// 代码 100 行就够，而且 PNG 本身已经压缩过，再压也省不了多少。

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function u16(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/**
 * @param {{name: string, data: Uint8Array}[]} files
 * @returns {Blob} application/zip
 */
export function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    if (/\s/.test(f.name)) throw new Error(`zip 条目名不能带空格：${f.name}`);
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    // 本地头（时间戳写 0：内容决定产物，不引入"运行时刻"变量）
    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800), // UTF-8 文件名
      ...u16(0), // store
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(f.data.length),
      ...u32(f.data.length),
      ...u16(name.length),
      ...u16(0),
    ];
    chunks.push(new Uint8Array(local), name, f.data);

    central.push({
      crc,
      size: f.data.length,
      name,
      offset,
    });
    offset += local.length + name.length + f.data.length;
  }

  const cdStart = offset;
  for (const c of central) {
    const head = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(c.crc),
      ...u32(c.size),
      ...u32(c.size),
      ...u16(c.name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(c.offset),
    ];
    chunks.push(new Uint8Array(head), c.name);
    offset += head.length + c.name.length;
  }

  const eocd = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(central.length),
    ...u16(central.length),
    ...u32(offset - cdStart),
    ...u32(cdStart),
    ...u16(0),
  ];
  chunks.push(new Uint8Array(eocd));

  return new Blob(chunks, { type: "application/zip" });
}
