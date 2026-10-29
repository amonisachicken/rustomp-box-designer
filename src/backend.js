// 服务端暂存 API（与 rustomp-circuit-designer 的 designer.save/last 同语义）。
//
// 服务由 scripts/dev.sh 启动；静态托管（例如 GitHub Pages）时没有这个 API，
// 调用方用 try/catch 降级：按钮失败只在状态栏提示，不影响画图/导出。

const API = "/api/draft";

async function request(method, body) {
  const res = await fetch(API, {
    method,
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`服务端返回了非 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const draft = {
  /** 写服务端缓存：{name, doc} → {path, file, bytes} */
  save: (name, doc) => request("POST", { name, doc }),
  /** 上次暂存的设计：{name, file, path, bytes, doc} 或 null */
  last: () => request("GET"),
};
