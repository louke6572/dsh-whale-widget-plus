/**
 * 把 lib/ui/*.js 拼成 lib/client.js（宿主只认单个 ./client 入口）。
 *
 * 为什么要拼：DSH 的浏览器模块系统按「一个包一个 client bundle」加载，
 * 不能同步 require 同包的其它相对文件。所以源码按功能拆开写，
 * 构建时按固定顺序拼进同一个 factory 闭包 —— 既保住可维护性，也满足宿主约束。
 *
 * 运行：node build.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(here, "lib", "ui");
const pagesDir = path.join(uiDir, "pages");

const css = fs.readFileSync(path.join(uiDir, "style.css"), "utf8");

// 纯逻辑（无 React 依赖）单独放 lib/ 下，方便单测；构建时去掉 `export ` 内联进来。
const pureModules = ["../setup-steps.js"];

const files = [
  "01-core.js",
  "fields.js",
  "02-shell.js",
  ...fs.readdirSync(pagesDir)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => `pages/${f}`),
  "99-whale-widget.js",
];

const body = [
  ...pureModules.map((f) => `\n/* ══ ${f} ══ */\n${fs.readFileSync(path.join(uiDir, f), "utf8").replace(/^export /gm, "")}`),
  ...files.map((f) => `\n/* ══ ${f} ══ */\n${fs.readFileSync(path.join(uiDir, f), "utf8")}`),
].join("\n");

const out = `/**
 * dsh-Dfy —— 设置界面（构建产物，请勿直接编辑）。
 * 源码：lib/ui/*.js；构建：node build.mjs
 */
window.__ModuleLoader__.load({
  id: "dsh-dfy",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createElement: h, useCallback, useEffect, useMemo, useRef, useState } = React;

    const API = "/dsh-surfcore/api";
    const CSS_TAG = "surfcore-next-style";
    const CSS = \`${css}\`;

${body}

    return module.exports;
  },
});
`;

const check = process.argv.includes("--check");
const outPath = path.join(here, "lib", "client.js");
if (check) {
  const current = fs.readFileSync(outPath, "utf8");
  if (current === out) {
    console.log(`✅ lib/client.js 与 lib/ui/* 一致（${files.length + pureModules.length} 个源文件，${out.length} 字符）`);
  } else {
    console.error(`❌ lib/client.js 已过期：改了 lib/ui/* 之后必须跑 node build.mjs 重新构建`);
    process.exit(1);
  }
} else {
  fs.writeFileSync(outPath, out, "utf8");
  console.log(`built lib/client.js ← ${files.length + pureModules.length} sources, ${out.length} chars`);
}
