// 浏览器端把 SVG 光栅化成 PNG（导出素材包时用）。
//
// 和 CLI 的分工：
// - **CLI**（scripts/export.mjs）用 Inkscape —— 这是"权威产物"，CI 用它；
// - **浏览器**用 canvas —— 让"下载素材包"一键拿到全套 PNG，不必装 Inkscape。
// 两条路的像素尺寸完全一致（mm × 12 px/mm），差异只在抗锯齿的极小细节。

import { num, panelSvg, spritePlan } from "./exporter.js";
import { flatten } from "./embed.js";
import { byId } from "./assets.gen.js";

/** 把 SVG 文本按指定像素尺寸画进 canvas，返回 PNG 字节 */
export async function svgToPng(svgText, pxW, pxH) {
  // 重写宽高属性（保留 viewBox，几何不变），让浏览器按目标像素栅格化
  const sized = svgText.replace(/<svg\b([^>]*)>/, (m, attrs) => {
    const rest = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    return `<svg${rest} width="${pxW}" height="${pxH}">`;
  });
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("SVG 光栅化失败（检查是否有外部引用）"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = pxW;
    canvas.height = pxH;
    // 透明底：素材贴图必须带 alpha
    canvas.getContext("2d").drawImage(img, 0, 0, pxW, pxH);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("canvas.toBlob 返回空");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 单张贴图 SVG（素材原尺寸，嵌套 viewBox 保证裁剪正确） */
function spriteSvg(assetId, assets, mm) {
  const text = assets[assetId];
  if (!text) throw new Error(`素材 ${assetId} 没有内容`);
  const { viewBox, inner } = flatten(text);
  const [w, h] = mm.map((v) => num(v));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
    `<svg x="0" y="0" width="${w}" height="${h}" viewBox="${viewBox}">${inner}</svg>` +
    `</svg>`
  );
}

/**
 * 生成"素材包"里的全部文件（不含 zip 打包本身）。
 * 与 CLI 的产物一一对应：panel.svg / panel.png / ui.toml / 各贴图 PNG / box.json
 */
export async function buildAssetBundle(doc, assets, { uiToml, boxJson }) {
  const px = doc.canvas.px_per_mm;
  const [W, H] = doc.canvas.canvas_mm;
  const files = [];

  const panelSvgText = panelSvg(doc, assets, { controls: false });
  files.push({ name: "panel.svg", data: new TextEncoder().encode(panelSvgText) });
  files.push({
    name: "panel.png",
    data: await svgToPng(panelSvgText, Math.round(W * px), Math.round(H * px)),
  });

  for (const item of spritePlan(doc)) {
    if (item.file === "panel.png") continue;
    const assetId = item.file.replace(/\.png$/, "");
    const svg = spriteSvg(assetId, assets, item.mm);
    files.push({
      name: item.file,
      data: await svgToPng(svg, Math.round(item.mm[0] * px), Math.round(item.mm[1] * px)),
    });
  }

  files.push({ name: "ui.toml", data: new TextEncoder().encode(uiToml) });
  files.push({ name: "panel.box.json", data: new TextEncoder().encode(boxJson) });
  return files;
}

export { byId };
