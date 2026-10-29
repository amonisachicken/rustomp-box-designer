// 服务端暂存 API 的端到端测试：起一个真的 Python 服务，POST → 文件/指针 → GET。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PY = process.env.PYTHON || "python3";

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(PY, ["scripts/server.py", "0"], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    const timer = setTimeout(() => reject(new Error(`服务端启动超时：${out}`)), 5000);
    child.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ child, port: Number(m[1]) });
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`服务端退出（code=${code}）：${out}`));
    });
  });
}

test("暂存 API：POST 落盘 + last 指针 + GET 恢复", async (t) => {
  const data = await mkdtemp(join(tmpdir(), "boxd-draft-"));
  const { child, port } = await startServer({ BOXD_DATA: data });
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    if (child.exitCode === null) {
      await new Promise((res) => {
        child.once("exit", res);
        child.kill("SIGTERM");
      });
    }
    await rm(data, { recursive: true, force: true });
  });

  const empty = await fetch(`${base}/api/draft`);
  assert.equal(empty.status, 200);
  assert.equal(await empty.json(), null);

  const doc = {
    version: 1,
    name: "测试面板",
    canvas: { background: "#123456" },
    elements: [],
  };
  const res = await fetch(`${base}/api/draft`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "测试/面板", doc }),
  });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.file, "测试_面板.box.json"); // 路径分隔符被清洗
  assert.ok(saved.bytes > 0);

  const files = (await readdir(data)).sort();
  assert.deepEqual(files, ["last", "测试_面板.box.json"].sort());
  assert.equal((await readFile(join(data, "last"), "utf8")).trim(), "测试_面板.box.json");
  assert.match(await readFile(join(data, "测试_面板.box.json"), "utf8"), /"background": "#123456"/);

  const last = await (await fetch(`${base}/api/draft`)).json();
  assert.equal(last.name, "测试面板");
  assert.equal(last.doc.canvas.background, "#123456");
});

test("暂存 API：坏请求返回 JSON 错误而不是崩服务", async (t) => {
  const data = await mkdtemp(join(tmpdir(), "boxd-draft-bad-"));
  const { child, port } = await startServer({ BOXD_DATA: data });
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    if (child.exitCode === null) {
      await new Promise((res) => {
        child.once("exit", res);
        child.kill("SIGTERM");
      });
    }
    await rm(data, { recursive: true, force: true });
  });

  const res = await fetch(`${base}/api/draft`, { method: "POST", body: "not-json" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /JSON/);
  // 服务还活着
  assert.equal((await fetch(`${base}/api/draft`)).status, 200);
});
