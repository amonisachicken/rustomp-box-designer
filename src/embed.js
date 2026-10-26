// 素材 SVG → 可内联进面板 SVG 的片段（见 docs/00-decisions.md D-006）
//
// 素材是 Illustrator/Inkscape 导出的「pt 坐标 + viewBox + <defs><style> 类名」。
// 直接 <g transform> 贴上去会有三个坑：
//   1. path 的绝对坐标常在 viewBox 之外（label 甚至有 M253,393），必须用嵌套 <svg viewBox> 裁剪；
//   2. 每个素材都用 .cls-1 / .cls-2，内联多份会互相覆盖；
//   3. id="layer1" / "svg1" 会重名。
// 所以这里做三件事：**展开 CSS → 内联 style**、**删 id**、**去 defs**。

/** 把 `<style>` 里的规则解析成 { ".cls-1": "fill:#231815" } */
export function parseCss(svg) {
  const map = {};
  const styles = [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  for (const [, body] of styles) {
    for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = m[2].trim().replace(/;$/, "");
      for (const sel of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        map[sel] = map[sel] ? `${map[sel]};${decls}` : decls;
      }
    }
  }
  return map;
}

/** 展开类名 + 删 id；返回 { viewBox, inner } */
export function flatten(svg) {
  const vb = /viewBox="([-\d.\s]+)"/.exec(svg);
  if (!vb) throw new Error("素材缺少 viewBox");
  const css = parseCss(svg);

  const start = svg.indexOf(">", svg.search(/<svg\b/)) + 1;
  const end = svg.lastIndexOf("</svg>");
  let inner = svg.slice(start, end);

  // defs 里除了 style 有时还有渐变/裁剪路径；渐变要留（引用还在），style 已展开
  inner = inner.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  inner = inner.replace(/<([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*)>/g, (m, tag, attrs) => {
    let a = attrs;
    // 自闭合标签（<circle ... />）的属性尾部有 `/`，样式必须加在它**前面**
    const selfClose = /\/\s*$/.test(a);
    if (selfClose) a = a.replace(/\/\s*$/, "");
    const cls = /\bclass="([^"]*)"/.exec(a);
    if (cls) {
      const decls = cls[1]
        .split(/\s+/)
        .map((c) => css[`.${c}`])
        .filter(Boolean)
        .join(";");
      a = a.replace(/\s*\bclass="[^"]*"/, "");
      if (decls) a += ` style="${decls}"`;
    }
    a = a.replace(/\s*\bid="[^"]*"/g, "");
    a = a.replace(/\s*\bdata-name="[^"]*"/g, "");
    return `<${tag}${a}${selfClose ? "/" : ""}>`;
  });

  inner = inner.replace(/<defs>\s*<\/defs>/g, "");

  return { viewBox: vb[1].trim().split(/\s+/).join(" "), inner: inner.trim() };
}

const cache = new Map();

/** 素材 id → 扁平化结果（素材文本由调用方提供，浏览器/Node 都适用） */
export function asset(assetId, text) {
  if (cache.has(assetId)) return cache.get(assetId);
  const r = flatten(text);
  cache.set(assetId, r);
  return r;
}

const num = (v) => {
  const s = Number(v).toFixed(3);
  return s.replace(/\.?0+$/, "") || "0";
};

/** 把一个素材放进面板：左上角 (x,y) 毫米 + 目标尺寸（默认素材原尺寸） */
export function placeAsset({ assetId, text, x, y, w, h, rot = 0 }) {
  const a = asset(assetId, text);
  const vb = a.viewBox.split(" ").map(Number);
  const size = [w ?? vb[2] * (25.4 / 72), h ?? vb[3] * (25.4 / 72)];
  const t = rot ? ` transform="rotate(${num(rot)} ${num(x + size[0] / 2)} ${num(y + size[1] / 2)})"` : "";
  return (
    `<svg x="${num(x)}" y="${num(y)}" width="${num(size[0])}" height="${num(size[1])}" ` +
    `viewBox="${a.viewBox}"${t}>${a.inner}</svg>`
  );
}
