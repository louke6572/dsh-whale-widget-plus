/**
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
    const CSS = `/* ── dsh-Dfy 设置 · 设计系统 v3 ─────────────────────────────────────────────
   结构：头部（身份 + 三盏状态灯）/ 导航（组 + 页签）/ 内容（列表卡）/ 底部（保存）。
   内容一律单列；卡片 = 列表组；行 =「左标题 · 右控件」；状态 = 圆点 + 文字。
   不使用渐变、不使用大面积色块、不在行尾堆状态文本。
   宿主设置弹窗内宽约 420–520px，所有排版按这个宽度优先设计。 */
.qbw-app{
  --qbw-bd:var(--dsw-alias-border-l2,rgba(127,127,127,.25));
  --qbw-t1:var(--dsw-alias-label-primary,#1d2129);
  --qbw-t2:var(--dsw-alias-label-secondary,#5c6470);
  --qbw-t3:var(--dsw-alias-label-tertiary,#8a919c);
  --qbw-bg:var(--dsw-alias-bg-primary,#fff);
  --qbw-accent:var(--dsw-alias-brand-primary,#2f6fed);
  --qbw-sunken:rgba(127,127,127,.07);
  display:flex;flex-direction:column;min-height:0;
  max-height:min(76vh,820px);
  color:var(--qbw-t1);font-size:13px;line-height:19px;
  background:transparent;border:0;border-radius:0;overflow:hidden;
}

/* 深色适配：宿主深色时 --dsw-alias-bg-primary 在设置弹窗里不一定有值，
   会回落到 #fff（表现就是文字已经变浅、卡片还是白底）。这里按 DSH 的主题标记
   显式覆盖整套 surface/text token，卡片/导航/输入框统一跟随。 */
html[data-ds-theme-source="dark"] .qbw-app,
body[data-ds-dark-theme] .qbw-app{
  --qbw-bd:rgba(255,255,255,.14);
  --qbw-t1:#f5f6f8;
  --qbw-t2:#c3c7cf;
  --qbw-t3:#9aa1ad;
  --qbw-bg:#181b22;
  --qbw-accent:#4d8dff;
  --qbw-sunken:rgba(255,255,255,.06);
}
html[data-ds-theme-source="dark"] .qbw-app .qbw-card,
body[data-ds-dark-theme] .qbw-app .qbw-card{background:var(--qbw-bg)}
html[data-ds-theme-source="dark"] .qbw-app .qbw-nav-groups button.on,
body[data-ds-dark-theme] .qbw-app .qbw-nav-groups button.on{background:var(--qbw-bg);color:var(--qbw-t1)}
.qbw-app *{box-sizing:border-box}
.qbw-app button{font-family:inherit}

/* 头部 */
.qbw-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:0 1px 8px}
.qbw-kicker{display:none}
.qbw-title{margin:0;font-size:14px;font-weight:650;line-height:22px;display:flex;align-items:center;gap:6px}
.qbw-sub{display:none}
.qbw-dots{margin-left:auto;display:inline-flex;align-items:center;gap:10px}
.qbw-dot{display:inline-flex;align-items:center;gap:5px;font-size:11px;line-height:16px;color:var(--qbw-t3);background:none;padding:0;border-radius:0;white-space:nowrap}
.qbw-dot i{width:5px;height:5px;border-radius:50%;background:var(--qbw-t3);display:inline-block;flex:0 0 auto}
.qbw-dot.ok{color:var(--qbw-t2)}
.qbw-dot.ok i{background:#22b573}
.qbw-dot.warn i{background:#e0a336}
.qbw-dot.bad i{background:#d9383d}

/* 导航：一组胶囊 + 组内下划线页签 */
.qbw-nav{flex:0 0 auto;display:flex;flex-direction:column;padding:0 1px}
.qbw-nav-groups{display:flex;gap:2px;padding:2px;border:1px solid var(--qbw-bd);border-radius:8px;background:var(--qbw-sunken);overflow-x:auto;scrollbar-width:none}
.qbw-nav-groups::-webkit-scrollbar{display:none}
.qbw-nav-groups button{flex:1 1 0;min-width:0;border:0;background:none;color:var(--qbw-t2);font-size:12px;line-height:24px;padding:0 6px;border-radius:6px;cursor:pointer;white-space:nowrap;font-family:inherit}
.qbw-nav-groups button:hover{color:var(--qbw-t1)}
.qbw-nav-groups button.on{background:var(--qbw-bg);color:var(--qbw-t1);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.qbw-seg{display:flex;gap:16px;padding:8px 2px 0;border-bottom:1px solid var(--qbw-bd);overflow-x:auto;scrollbar-width:none}
.qbw-seg::-webkit-scrollbar{display:none}
.qbw-seg button{border:0;background:none;color:var(--qbw-t3);font-size:12px;line-height:20px;padding:0 0 7px;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;white-space:nowrap;font-family:inherit}
.qbw-seg button:hover{color:var(--qbw-t1)}
.qbw-seg button.on{color:var(--qbw-t1);font-weight:600;border-bottom-color:var(--qbw-accent)}

/* 内容区 */
.qbw-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px 1px 4px;overscroll-behavior:contain}
.qbw-body::-webkit-scrollbar{width:8px}
.qbw-body::-webkit-scrollbar-thumb{background:rgba(127,127,127,.28);border-radius:4px}

/* 卡片 = 列表组 */
.qbw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:8px}
.qbw-cols{display:grid;grid-template-columns:1fr;gap:10px}
.qbw-card{border:1px solid var(--qbw-bd);border-radius:10px;background:var(--qbw-bg);padding:10px 12px;margin:0 0 8px}
.qbw-card>h4{margin:0 0 4px;font-size:12.5px;font-weight:650;line-height:18px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.qbw-card>h4>span{display:inline-flex;align-items:center}
.qbw-card p{margin:0;color:var(--qbw-t3);font-size:11.5px;line-height:17px}

/* 键值行 */
.qbw-kv{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0;border-bottom:1px solid var(--qbw-bd);font-size:12px;line-height:18px}
.qbw-kv:last-child{border-bottom:0}
.qbw-kv>span:first-child{color:var(--qbw-t3);flex:0 1 auto;min-width:0}
.qbw-kv>span:last-child{color:var(--qbw-t1);text-align:right;min-width:0;overflow-wrap:anywhere}

/* 表单行：标题在左，控件在右；窄屏自动换行后控件占满 */
.qbw-row{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;padding:7px 0;border-bottom:1px solid var(--qbw-bd);flex-wrap:wrap}
.qbw-row:last-child{border-bottom:0}
.qbw-row>div:first-child{flex:1 1 150px;min-width:0}
.qbw-label{font-size:12.5px;line-height:18px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.qbw-hint{color:var(--qbw-t3);font-size:11px;line-height:16px;margin-top:2px}
.qbw-group{margin:12px 0 6px;font-size:12px;font-weight:600;color:var(--qbw-t2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.qbw-group small{font-weight:400;color:var(--qbw-t3);font-size:11px}
.qbw-rows{display:flex;flex-direction:column}

/* 输入 */
.qbw-app .qbw-input,.qbw-app .qbw-select,.qbw-app .qbw-textarea{
  font-family:inherit;font-size:12.5px;color:var(--qbw-t1);background:var(--qbw-bg);
  border:1px solid var(--qbw-bd);border-radius:7px;height:30px;padding:0 8px;
  outline:none;min-width:0;flex:0 1 180px;transition:border-color .12s;
}
.qbw-app .qbw-input:hover,.qbw-app .qbw-select:hover{border-color:var(--qbw-t3)}
.qbw-app .qbw-input:focus,.qbw-app .qbw-select:focus,.qbw-app .qbw-textarea:focus{border-color:var(--qbw-accent);box-shadow:0 0 0 2px rgba(47,111,237,.16)}
.qbw-app .qbw-input.wide{flex-basis:100%;width:100%}
.qbw-app .qbw-textarea{height:auto;min-height:88px;padding:7px 8px;line-height:17px;width:100%;flex:1 1 100%;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}
.qbw-app .qbw-textarea.card{min-height:340px}
.qbw-app .qbw-switch{width:15px;height:15px;accent-color:var(--qbw-accent);margin:0;flex:0 0 auto;cursor:pointer}
.qbw-check{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--qbw-t2);cursor:pointer;white-space:nowrap}
.qbw-check input{accent-color:var(--qbw-accent);margin:0}

/* 按钮 */
.qbw-app .qbw-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  height:30px;padding:0 12px;border-radius:7px;border:1px solid transparent;
  background:var(--qbw-accent);color:#fff;font-size:12.5px;font-weight:550;line-height:1;
  cursor:pointer;white-space:nowrap;flex:0 0 auto;margin:0;
}
.qbw-app .qbw-btn:hover:not(:disabled){filter:brightness(1.06)}
.qbw-app .qbw-btn:disabled{opacity:.45;cursor:default}
.qbw-app .qbw-btn2{background:transparent;border-color:var(--qbw-bd);color:var(--qbw-t1)}
.qbw-app .qbw-btn2:hover:not(:disabled){border-color:var(--qbw-accent);color:var(--qbw-accent);filter:none}
.qbw-app .qbw-btn3{background:transparent;border-color:transparent;color:var(--qbw-t3);padding:0 8px}
.qbw-app .qbw-btn3:hover:not(:disabled){color:var(--qbw-t1);background:var(--qbw-sunken);filter:none}
.qbw-app .qbw-btn.danger{background:#d9383d;border-color:transparent}
.qbw-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--qbw-bd)}

/* 底部 */
.qbw-foot{flex:0 0 auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 1px 0;border-top:1px solid var(--qbw-bd)}
.qbw-foot .spacer{flex:1 1 0}

/* 状态行（概览专用）：标题 + 圆点 + 按钮同一行，明细另起一行小字 */
.qbw-sitem{padding:8px 0;border-bottom:1px solid var(--qbw-bd)}
.qbw-sitem:last-child{border-bottom:0}
.qbw-srow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0;border-bottom:0}
.qbw-srow-main{display:flex;align-items:center;gap:7px;min-width:0;flex:1 1 auto;flex-wrap:nowrap}
.qbw-srow-title{font-size:12.5px;font-weight:650;line-height:18px;white-space:nowrap}
.qbw-srow-plain{font-size:12px;line-height:18px;color:#94a3b8;white-space:nowrap}
.qbw-srow-acts{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.qbw-srow-meta{padding:3px 0 0;font-size:11px;line-height:16px;color:var(--qbw-t3);display:flex;flex-wrap:wrap;gap:2px 12px}
.qbw-srow-meta b{color:var(--qbw-t2);font-weight:600}
.qbw-meta{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:11px;line-height:17px;color:var(--qbw-t3)}
.qbw-meta b{color:var(--qbw-t2);font-weight:600}

/* 徽标 / 提示 / 状态色 */
.qbw-badge{display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:4px;font-size:10.5px;line-height:17px;font-weight:500;background:var(--qbw-sunken);color:var(--qbw-t3);vertical-align:middle}
.qbw-badge.ok{background:rgba(34,181,115,.14);color:#1a8f5c}
.qbw-badge.warn{background:rgba(224,163,54,.16);color:#a06a12}
.qbw-badge.bad{background:rgba(217,56,61,.13);color:#c0353a}
.qbw-infobox{border:0;border-left:2px solid var(--qbw-bd);border-radius:0;background:transparent;padding:0 0 0 8px;margin:0 0 10px;font-size:11.5px;line-height:17px;color:var(--qbw-t3)}
.qbw-warnbox,.qbw-dangerbox{border:0;border-left:3px solid var(--qbw-accent);border-radius:0;background:transparent;padding:0 0 0 8px;margin:0 0 10px;font-size:11.5px;line-height:17px;color:var(--qbw-t2)}
.qbw-warnbox{border-left-color:#e0a336}
.qbw-dangerbox{border-left-color:#d9383d}
.qbw-ok{color:#1a8f5c;font-size:11.5px}
.qbw-dirty{color:#a06a12;font-size:11.5px}
.qbw-err{color:#c0353a;font-size:11.5px;line-height:17px}
.qbw-warn{color:#9a6b00;font-size:11.5px;line-height:17px}

/* 管理员 / 别名 */
.qbw-admin{border:1px solid var(--qbw-bd);border-radius:10px;background:var(--qbw-bg);padding:10px 12px;margin:0 0 8px}
.qbw-admin-head{display:flex;flex-direction:column;align-items:stretch;gap:2px}
.qbw-admin-title{font-size:12.5px;font-weight:650;line-height:18px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.qbw-admin-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px}
.qbw-admin-field{display:flex;flex-direction:column;gap:3px;font-size:12px}
.qbw-admin-field small{color:var(--qbw-t3);font-size:10.5px;line-height:15px}
.qbw-admin-field .qbw-input{flex:1 1 auto;width:100%}
.qbw-admin-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--qbw-bd)}
.qbw-admin-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
.qbw-alias{border:1px solid var(--qbw-bd);border-left:3px solid #e07a9a;border-radius:8px;background:var(--qbw-bg);padding:9px 10px;margin:0 0 8px}
.qbw-alias-title{font-size:12.5px;font-weight:650;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.qbw-alias .qbw-input{width:100%;flex:1 1 auto;margin-top:6px}

/* 列表项 / 建议项 */
.qbw-list{display:flex;flex-direction:column}
.qbw-item{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid var(--qbw-bd)}
.qbw-item:last-child{border-bottom:0}
.qbw-item>div:first-child{flex:1 1 160px;min-width:0}
.qbw-rec{border:1px solid var(--qbw-bd);border-radius:8px;background:var(--qbw-sunken);padding:8px 10px;margin:0 0 6px;display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
.qbw-rec>div:first-child{flex:1 1 160px;min-width:0}
.qbw-rec-title{font-size:12.5px;font-weight:600;line-height:18px}
.qbw-rec-text{font-size:11.5px;color:var(--qbw-t2);line-height:17px;word-break:break-word}
.qbw-rec-actions{display:flex;gap:6px;flex-wrap:wrap}
/* 记忆记录可点击进入编辑：悬停高亮，避免用户以为只能看 */
.qbw-rec-edit{cursor:pointer;transition:border-color .15s}
.qbw-rec-edit:hover{border-color:var(--qbw-accent)}
.qbw-rec-edit:focus-visible{outline:none;border-color:var(--qbw-accent)}

/* 标签胶囊 */
.qbw-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.qbw-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--qbw-bd);border-radius:999px;padding:1px 8px;font-size:11px;line-height:18px;color:var(--qbw-t2);background:transparent;margin:0}
.qbw-chip.on{background:rgba(34,181,115,.12);border-color:rgba(34,181,115,.45);color:#1a8f5c}
.qbw-chip.warn{background:rgba(224,163,54,.12);border-color:rgba(224,163,54,.45);color:#a06a12}
.qbw-chip.bad{background:rgba(217,56,61,.10);border-color:rgba(217,56,61,.4);color:#c0353a}

/* 进度 / 计量 */
.qbw-progress{height:4px;border-radius:2px;background:var(--qbw-sunken);overflow:hidden}
.qbw-progress>i{display:block;height:100%;background:var(--qbw-accent);transition:width .3s ease}
.qbw-progress.indet>i{width:35%!important;animation:qbw-indet 1.1s ease-in-out infinite}
@keyframes qbw-indet{0%{transform:translateX(-110%)}100%{transform:translateX(310%)}}
.qbw-meter{height:6px;border-radius:3px;background:var(--qbw-sunken);overflow:hidden;margin:8px 0 5px}
.qbw-meter>i{display:block;height:100%;border-radius:3px;background:#22b573;transition:width .3s ease}
.qbw-meter.warn>i{background:#e0a336}
.qbw-meter.bad>i{background:#d9383d}
.qbw-meter-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
.qbw-meter-head b{font-size:15px;font-weight:650}

/* 表格 / 代码 / 输出 */
.qbw-table{width:100%;border-collapse:collapse;font-size:11.5px}
.qbw-table th,.qbw-table td{text-align:left;padding:5px 4px;border-bottom:1px solid var(--qbw-bd);vertical-align:top}
.qbw-table th{color:var(--qbw-t3);font-weight:500;font-size:11px}
.qbw-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:var(--qbw-sunken);border-radius:4px;padding:1px 5px}
.qbw-out{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;color:var(--qbw-t2);background:var(--qbw-sunken);border-radius:8px;padding:8px 10px;max-height:260px;overflow:auto;margin-top:8px}
.qbw-scroll{max-height:240px;overflow:auto;border:1px solid var(--qbw-bd);border-radius:8px;padding:8px 10px}
.qbw-scroll pre{margin:0;white-space:pre-wrap;font-size:11px;line-height:16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}

/* 抽屉入口 / 分类 / 搜索 / 小胶囊 */
.qbw-area-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:1px solid var(--qbw-bd);border-radius:8px;background:var(--qbw-bg);padding:9px 11px;margin:0 0 6px;cursor:pointer;color:var(--qbw-t1);text-align:left;font:inherit}
.qbw-area-btn:hover{border-color:var(--qbw-accent)}
.qbw-area-title{font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.qbw-area-arrow{font-size:16px;color:var(--qbw-t3);line-height:1}
.qbw-category{margin:8px 0 2px}
.qbw-category-title{margin:0 0 4px;font-size:11.5px;font-weight:600;color:var(--qbw-t3)}
.qbw-search{display:flex;gap:6px;align-items:center;margin:0 0 8px;flex-wrap:wrap}
.qbw-search .qbw-input{flex:1 1 180px}
.qbw-pill{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--qbw-bd);border-radius:999px;padding:1px 8px;font-size:11px;color:var(--qbw-t2)}

/* 弹窗：跟随宿主主题，不再固定深色 */
.qbw-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;padding:18px}
.qbw-modal{width:100%;max-width:460px;max-height:86vh;overflow:auto;background:var(--qbw-bg);color:var(--qbw-t1);border:1px solid var(--qbw-bd);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.24);padding:16px}
.qbw-modal h3{margin:0 0 6px;font-size:15px;line-height:22px;display:flex;align-items:center;gap:6px}
.qbw-modal p{margin:0 0 8px;font-size:12.5px;line-height:19px;color:var(--qbw-t2)}
.qbw-modal input.qbw-input{flex:1 1 auto}

/* Token 额度页 */
.qbw-budget-summary{border:1px solid var(--qbw-bd);border-radius:10px;background:var(--qbw-bg);padding:10px 12px;margin:0 0 8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}
.qbw-budget-big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:2px 0 3px}
.qbw-budget-big b{font-size:22px;line-height:28px;font-weight:700}
.qbw-budget-big span{font-size:12px;color:var(--qbw-t2)}
.qbw-budget-status{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.qbw-budget-grid{display:grid;grid-template-columns:1fr;gap:8px}
.qbw-budget-card{padding:10px 12px}
.qbw-budget-card.total{grid-column:1/-1;order:-1}
.qbw-budget-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-bottom:6px}
.qbw-budget-head h4{margin:0 0 2px}
.qbw-budget-head p{margin:0;color:var(--qbw-t3);font-size:11px;line-height:16px}
.qbw-budget-today{display:flex;flex-direction:column;align-items:flex-end;gap:1px;font-size:11px;color:var(--qbw-t3)}
.qbw-budget-today b{font-size:16px;line-height:21px;color:var(--qbw-t1)}
.qbw-budget-lines{display:flex;flex-direction:column;gap:6px}
.qbw-budget-line{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--qbw-bd)}
.qbw-budget-field{display:flex;flex-direction:column;gap:3px;font-size:11.5px;min-width:150px;flex:1}
.qbw-budget-field>span{color:var(--qbw-t3);font-size:11px}
.qbw-budget-field .qbw-input{flex:1 1 auto;width:100%}
.qbw-budget-field small{color:var(--qbw-t3);font-size:10.5px;line-height:15px}
.qbw-budget-meters{display:grid;grid-template-columns:1fr;gap:10px;margin-top:6px}
.qbw-budget-meter-empty{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--qbw-t3);padding:4px 0}
.qbw-budget-meter .qbw-meter-head{font-size:11px}
.qbw-budget-meter .qbw-meter-head b{font-size:12px}
.qbw-budget-extra{margin-top:8px;padding-top:7px;border-top:1px solid var(--qbw-bd)}
.qbw-budget-quick{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.qbw-budget-note{display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;padding-top:9px;border-top:1px solid var(--qbw-bd)}
.qbw-budget-note .qbw-btn{flex:0 0 auto}
.qbw-budget-platforms{display:flex;flex-direction:column;gap:7px;margin-top:10px;padding-top:8px;border-top:1px solid var(--qbw-bd)}
.qbw-budget-platform-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--qbw-t3)}
.qbw-budget-platform-head b{font-size:12px;color:var(--qbw-t1);font-weight:650;min-width:28px}
.qbw-budget-platform-head span:nth-child(2){color:var(--qbw-t2);font-weight:600}
.qbw-budget-remain{color:var(--qbw-t2);font-size:11px}
.qbw-budget-meters + .qbw-chips{margin-top:8px}

/* 选择卡（载体 / 形态） */
.qbw-picks{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.qbw-pick{border:1px solid var(--qbw-bd);border-radius:8px;background:transparent;padding:8px 10px;cursor:pointer}
.qbw-pick:hover{border-color:var(--qbw-t3)}
.qbw-pick.on{border-color:var(--qbw-accent);background:rgba(47,111,237,.06)}
.qbw-pick-title{font-size:12.5px;font-weight:600;line-height:18px}
.qbw-swt{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--qbw-bd);border-radius:7px;background:var(--qbw-sunken)}
.qbw-swt button{border:0;background:none;color:var(--qbw-t2);font:inherit;font-size:12px;line-height:22px;padding:0 10px;border-radius:5px;cursor:pointer}
.qbw-swt button:hover{color:var(--qbw-t1)}
.qbw-swt button.on{background:var(--qbw-bg);color:var(--qbw-t1);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.1)}
.qbw-admin.ok{border-left:3px solid #22b573}
.qbw-admin.danger{border-left:3px solid #d9383d}
.qbw-stat{flex:1 1 92px;min-width:92px;padding:7px 9px;border:1px solid var(--qbw-bd);border-radius:8px}
.qbw-stat>div:first-child{font-size:11px;color:var(--qbw-t3);line-height:16px}
.qbw-stat>div:nth-child(2){font-weight:600;font-size:15px;line-height:21px}
.qbw-stat>div:nth-child(3){font-size:11px;color:var(--qbw-t3);line-height:16px}

/* 参数行悬浮说明 */
.qbw-row[data-tip]{position:relative}
.qbw-row[data-tip]:hover::after{content:attr(data-tip);position:absolute;left:0;top:100%;z-index:80;max-width:420px;margin-top:4px;padding:7px 9px;border-radius:8px;background:#18202c;color:#f4f7fb;font-size:11.5px;line-height:16px;box-shadow:0 8px 24px rgba(0,0,0,.28);white-space:normal;pointer-events:none}

.qbw-path{display:block;padding:6px 0;border-bottom:1px solid var(--qbw-bd)}
.qbw-path:last-child{border-bottom:0}
.qbw-path>span{display:block;color:var(--qbw-t3);font-size:11px;line-height:15px}
.qbw-path>code{display:block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;line-height:17px;color:var(--qbw-t1);word-break:break-all;margin-top:1px}

.qbw-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.qbw-unit{color:var(--qbw-t3);font-size:11px;font-weight:400}
.qbw-vtitle{display:block;min-width:0;font-size:12.5px;font-weight:600;line-height:18px;color:var(--qbw-t1);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.qbw-vtitle:hover{color:var(--qbw-accent)}
.qbw-srow-main>.qbw-vtitle{flex:0 1 auto}

/* ── 无障碍：分区标题行现在带 role=button（可 Tab / Enter / 空格展开） ──
   没有焦点环的话键盘用户看不出焦点停在哪，所以补一条可见焦点样式。 */
.qbw-app .qbw-group[role="button"]:focus-visible,
.qbw-app .qbw-sitem:focus-visible{outline:2px solid var(--qbw-accent);outline-offset:2px;border-radius:6px}

/* ── 窄屏：宿主设置弹窗在窄窗口 / 手机浏览器里会缩到 360px 上下 ──
   状态行标题原本 nowrap，会顶掉右侧按钮或被容器直接裁掉（看不出被截断）；
   这里允许换行，并让动作区独占一行靠右。 */
@media (max-width: 420px){
  .qbw-head{flex-wrap:wrap;row-gap:4px}
  .qbw-dots{width:100%;margin-left:0;flex-wrap:wrap;gap:8px}
  .qbw-srow{flex-wrap:wrap}
  .qbw-srow-main{flex-wrap:wrap}
  .qbw-srow-title{white-space:normal;overflow-wrap:anywhere}
  .qbw-srow-acts{flex:1 1 100%;justify-content:flex-end;flex-wrap:wrap;padding-top:2px}
  .qbw-card>h4{row-gap:4px}
}

/* ── 平台 · B站常用设置：两列紧凑网格，控件更大 ───────────────────────── */
.qbw-page-bili .qbw-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;margin:2px 0 4px}
.qbw-page-bili .qbw-field-cell{min-width:0}
.qbw-page-bili .qbw-field-cell.span2{grid-column:1 / -1}
.qbw-page-bili .qbw-field-label{font-size:12px;line-height:17px;color:var(--qbw-t2);margin:0 0 4px}
.qbw-page-bili .qbw-field-cell .qbw-check{margin-top:6px}
.qbw-app .qbw-page-bili .qbw-field-cell .qbw-input,
.qbw-app .qbw-page-bili .qbw-field-cell .qbw-select{width:100%;flex:1 1 100%;height:36px;font-size:13px}
@media (max-width:560px){.qbw-page-bili .qbw-field-grid{grid-template-columns:1fr}}

/* 平台页统一：输入框更大，勾选框更明显 */
.qbw-app .qbw-page-bili .qbw-input,
.qbw-app .qbw-page-bili .qbw-select,
.qbw-app .qbw-page-qq .qbw-input,
.qbw-app .qbw-page-qq .qbw-select{height:34px;flex:1 1 220px;font-size:13px}
.qbw-app .qbw-page-bili .qbw-switch,
.qbw-app .qbw-page-qq .qbw-switch{width:17px;height:17px}

/* ── 平台 · 贴吧 / 抖音：输入框同样放大 ─────────────────────────────── */
.qbw-app .qbw-page-tieba .qbw-input,
.qbw-app .qbw-page-tieba .qbw-select,
.qbw-app .qbw-page-douyin .qbw-input,
.qbw-app .qbw-page-douyin .qbw-select{height:34px;flex:1 1 220px;font-size:13px}
.qbw-app .qbw-page-tieba .qbw-switch,
.qbw-app .qbw-page-douyin .qbw-switch{width:17px;height:17px}
`;


/* ══ ../setup-steps.js ══ */
/**
 * 上手向导的步骤逻辑（纯函数，无 React 依赖，可单测）。
 *
 * 关键约定（2026-11 用户反馈「已经配置好的也显示流程没走完」）：
 *   · 「配置完成」只看目标状态 = 桥接在跑 且 SnowLuma 网关已连通；
 *   · 控制台密码 / 面板内管账号只是**可选增强**，不能用它把已配好的用户卡成未完成；
 *   · 已连通时，前面「安装 / 启动 / 登录」这些前置步骤一律视为已完成
 *     （否则老用户永远回不到日常视图）。
 *
 * 这个文件会被 build.mjs 内联进 lib/client.js，所以不要在这里 import React。
 */

function buildSetupSteps({
  launcherPath = "",
  detected = false,
  webuiUp = false,
  hasPassword = false,
  accounts = [],
  bridgeRunning = false,
  gatewayConnected = false,
  processPid = null,
} = {}) {
  const ready = Boolean(bridgeRunning && gatewayConnected);
  const accountText = (accounts ?? []).map((a) => `${a.nickname || "?"}（${a.uin}）`).join("、");
  const steps = [
    {
      id: "detect",
      label: "识别 SnowLuma 安装位置",
      done: ready || Boolean(String(launcherPath ?? "").trim()) || detected === true,
      hint: String(launcherPath ?? "").trim()
        ? `已识别：${launcherPath}`
        : "点「自动识别」帮你在常见位置找；找不到就去「安装与维护」页手动选目录",
      actionLabel: "自动识别",
      actionId: "detect",
    },
    {
      id: "launch",
      label: "启动 SnowLuma（控制台）",
      done: ready || webuiUp === true,
      hint: (ready || webuiUp) ? "SnowLuma 已在运行" : "点「启动控制台」会拉起 SnowLuma；已经在运行就不动",
      actionLabel: "启动控制台",
      actionId: "start-snowluma",
    },
    {
      id: "login",
      label: "登录 QQ 账号",
      done: ready || (accounts ?? []).length > 0,
      hint: ((accounts ?? []).length > 0 || ready)
        ? (accountText ? `已登录：${accountText}` : "网关已连通（账号已登录）")
        : (processPid ? `找到 QQ 进程 PID ${processPid}：点「注入」后到 QQ 窗口扫码` : "先打开 QQ 停在登录页，再点「刷新进程列表」"),
      actionLabel: processPid ? "注入 QQ 进程" : "刷新进程列表",
      actionId: processPid ? "process-load" : "refresh",
    },
    {
      id: "bridge",
      label: "启动 QQ 桥接（自动写配置 · 顺带起 B站）",
      done: ready,
      hint: "点「一键开始」：自动找到 SnowLuma 的地址/token 写进配置，再重启桥接、按开关启动 B站",
      actionLabel: "一键开始",
      actionId: "auto-start",
    },
  ];
  const optional = {
    id: "console-manage",
    label: "面板内加 / 删 QQ 账号",
    done: hasPassword === true,
    hint: hasPassword
      ? "已连上控制台：以后的加号 / 退号都在这个面板里做"
      : "可选：填一次 SnowLuma 控制台密码，之后连它的网页都不用开",
    actionLabel: "填密码",
    actionId: "password",
  };
  return { ready, steps, optional };
}


/* ══ 01-core.js ══ */
/* ─────────────────────────────────────────────────────────────────────────
 * 01-core —— 基础层
 * 只做三件事：接口调用、路径读写、通用控件。
 * 约定：所有页面只依赖本文件的控件，不各自造轮子。
 * 设计系统：卡片=列表组；行=左标题右控件；状态=圆点+文字；不使用渐变。
 * ───────────────────────────────────────────────────────────────────────── */

// ── 接口 ────────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const method = String(options.method ?? "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  // 后端 http-guard 要求浏览器发起的写操作必须带 application/json，
  // 否则在路由之前就被拒（表现为「点了没反应」）——所以 POST/PUT/PATCH 即使没参数也带上。
  const writes = method !== "GET" && method !== "HEAD";
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(hasBody || writes ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : writes ? { body: "{}" } : {}),
  });
  let data = {};
  try { data = await res.json(); } catch { /* 空响应按空对象处理 */ }
  if (!res.ok) {
    const error = new Error(data?.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = data?.code || "";
    error.hint = data?.hint || "";
    error.missing = Array.isArray(data?.missing) ? data.missing : [];
    error.data = data;
    throw error;
  }
  return data;
}

function useStyleOnce() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.getElementById(CSS_TAG)) {
      const el = document.createElement("style");
      el.id = CSS_TAG;
      el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);
}

async function browseNative(mode = "dir", title = "", filter = "") {
  const q = `mode=${mode === "file" ? "file" : "dir"}&title=${encodeURIComponent(title)}${filter ? `&filter=${encodeURIComponent(filter)}` : ""}`;
  try {
    const res = await fetch(`${API}/browse?${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(180000) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── 格式化 ──────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); } catch { return String(iso); }
}
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${v} B`;
}

// ── 路径读写（不可变）─────────────────────────────────────────────────────
function getPath(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}
function setPathInto(obj, path, value) {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const base = obj !== null && typeof obj === "object" ? obj : {};
  const next = Array.isArray(base) ? [...base] : { ...base };
  next[head] = setPathInto(base[head], rest, value);
  return next;
}
function withoutPath(obj, path) {
  if (!path.length) return undefined;
  const [head, ...rest] = path;
  if (obj === null || typeof obj !== "object") return obj;
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  if (rest.length === 0) delete next[head];
  else next[head] = withoutPath(obj[head], rest);
  return next;
}
function pathKeys(obj, base = [], out = []) {
  if (obj === null || typeof obj !== "object") { out.push(base); return out; }
  const keys = Object.keys(obj);
  if (!keys.length) { out.push(base); return out; }
  for (const key of keys) pathKeys(obj[key], [...base, key], out);
  return out;
}

// ── 通用控件 ────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, kind = "", title, type = "button" }) {
  return h("button", { type, title, className: `qbw-btn ${kind}`.trim(), onClick, disabled }, children);
}

function StatusDot({ ok, warn, title, children }) {
  return h("span", { className: "qbw-dot " + (ok ? "ok" : warn ? "warn" : "bad"), title }, h("i"), children);
}

function Badge({ kind, children }) {
  return h("span", { className: "qbw-badge" + (kind ? ` ${kind}` : "") }, children);
}

function Card({ title, right, note, children, className = "" }) {
  return h("div", { className: `qbw-card ${className}`.trim() },
    title || right
      ? h("h4", null,
        title ? h("span", null, title) : null,
        right ? h("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px" } }, right) : null)
      : null,
    note ? h("p", null, note) : null,
    children);
}

function KV({ label, children }) {
  return h("div", { className: "qbw-kv" }, h("span", null, label), h("span", null, children));
}

// 一行状态：标题 + 圆点 + 右侧动作；明细另起一行，不在行尾堆文字。
// 注意：dotText 必须能在「没有圆点」时也显示。旧实现只在 dot 存在时才渲染 dotText，
// 于是 dot:"" 的行（未运行 / 未登录 / 未完成）把状态文字一并吞掉了 —— 页面上只剩标题，
// 看着像排版缺了一块（2026-11 用户截图反馈「主人」孤立一行就是这个）。
function SRow({ title, dot, dotText, meta, actions }) {
  return h("div", { className: "qbw-sitem" },
    h("div", { className: "qbw-srow" },
      h("div", { className: "qbw-srow-main" },
        dot ? h(StatusDot, { ok: dot === "ok", warn: dot === "warn" }, dotText ?? null)
          : (dotText == null ? null : h("span", { className: "qbw-srow-plain" }, dotText)),
        h("span", { className: "qbw-srow-title" }, title)),
      actions ? h("div", { className: "qbw-srow-acts" }, actions) : null),
    meta ? h("div", { className: "qbw-srow-meta" }, meta) : null);
}

function Row({ label, hint, badge, children }) {
  return h("div", { className: "qbw-row" },
    h("div", null,
      h("div", { className: "qbw-label" }, label, badge !== undefined && badge !== null ? h(Badge, null, badge) : null),
      hint ? h("div", { className: "qbw-hint" }, hint) : null),
    children);
}

// 受控输入；保持「输入中允许逗号」的旧行为（列表字段不能在打字时被吞）。
function ListInput({ value, onChange, readOnly, placeholder, className }) {
  const list = Array.isArray(value) ? value.map(String) : [];
  const joined = list.join("，");
  const [text, setText] = useState(joined);
  const focused = useRef(false);
  const last = useRef(joined);
  useEffect(() => {
    if (!focused.current && joined !== last.current) {
      last.current = joined;
      setText(joined);
    }
  }, [joined]);
  const parse = (raw) => [...new Set(String(raw ?? "").split(/[,，]/).map((s) => s.trim()).filter(Boolean))];
  const commit = (raw) => onChange(parse(raw));
  return h("input", {
    className: className ?? "qbw-input",
    value: text,
    readOnly,
    placeholder,
    autoComplete: "off",
    onFocus: () => { focused.current = true; },
    onChange: (e) => { setText(e.target.value); commit(e.target.value); },
    onBlur: () => {
      focused.current = false;
      const next = parse(text);
      last.current = next.join("，");
      setText(next.join("，"));
      onChange(next);
    },
  });
}

/* 数字输入：先存「正在输入的文字」，只有能解析成有限数字时才回写配置。
   旧实现直接在 onChange 里 Number(e.target.value) 并回写：输入中途的 "-" / "1e" /
   粘贴进来的非数字都会变成 NaN 流进 config，JSON.stringify(NaN) 又变成 null，
   后端拿到的是一份坏配置，用户只会看到「保存了但值不对」。 */
function NumberInput({ value, onChange, readOnly, className, placeholder, step, min, max, title }) {
  const toText = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "" : String(v));
  const [text, setText] = useState(() => toText(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(toText(value));
  }, [value]);
  return h("input", {
    className: className ?? "qbw-input",
    type: "number",
    step: step ?? "any",
    min,
    max,
    title,
    value: text,
    readOnly,
    placeholder,
    onFocus: () => { focused.current = true; },
    onChange: (e) => {
      const raw = e.target.value;
      setText(raw);
      if (raw.trim() === "") { onChange(undefined); return; }
      const n = Number(raw);
      if (Number.isFinite(n)) onChange(n);
    },
    onBlur: () => { focused.current = false; setText(toText(value)); },
  });
}

function JsonCell({ value, onChange, readOnly, placeholder }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState("");
  useEffect(() => { setText(JSON.stringify(value ?? null, null, 2)); setErr(""); }, [JSON.stringify(value ?? null)]);
  return h("div", { style: { minWidth: "220px", flex: 1 } },
    h("textarea", {
      className: "qbw-textarea",
      value: text,
      readOnly,
      placeholder,
      onChange: (e) => {
        const next = e.target.value;
        setText(next);
        try { onChange(JSON.parse(next)); setErr(""); }
        catch (error) { setErr(`JSON 语法错误：${error.message}`); }
      },
    }),
    err ? h("div", { className: "qbw-err" }, err) : null);
}

// 字段渲染：kind = switch / number / select / list / times / textarea / json / password / text
// f.readOnly = true 是字段自带的只读声明（例如 self.mid / diary.enabled）：
// 旧实现只认调用方传的 readOnly，于是这些「只读」字段在面板里照样能改、也能被保存覆盖。
//
// defaultValue：后端 GET /config 的 defaults（形状同配置）里这个键的默认值。
// 配置里没显式写这个键时，开关/数字/下拉按默认值显示，但**不写回配置**——
// 只有用户真的动了控件才会 set，没动就保持「配置文件里没这个键」的语义。
function Field({ f, value, onChange, readOnly, defaultValue }) {
  const ro = readOnly === true || f.readOnly === true;
  const missing = value === undefined || value === null;
  const common = { className: "qbw-input" + (f.wide ? " wide" : ""), title: f.hint || f.label };
  let control;
  if (f.kind === "switch") {
    const shown = missing ? !!defaultValue : !!value;
    control = h("input", { className: "qbw-switch", type: "checkbox", checked: shown, disabled: ro, onChange: (e) => onChange(e.target.checked) });
  } else if (f.kind === "number") {
    control = h(NumberInput, { ...common, step: f.step ?? "any", min: f.min, max: f.max, value: missing ? defaultValue : value, readOnly: ro, onChange });
  } else if (f.kind === "select") {
    const shown = missing ? (defaultValue ?? "") : value;
    control = h("select", { className: "qbw-select", value: shown, disabled: ro, onChange: (e) => onChange(e.target.value) },
      (f.options ?? []).map((opt) => {
        const [v, l] = Array.isArray(opt) ? opt : [opt, opt];
        return h("option", { key: String(v), value: v }, l);
      }));
  } else if (f.kind === "list" || f.kind === "times") {
    control = h(ListInput, {
      className: common.className,
      value,
      readOnly: ro,
      placeholder: f.placeholder ?? (f.kind === "times" ? "07:00，11:00" : "逗号分隔"),
      onChange,
    });
  } else if (f.kind === "textarea") {
    control = h("textarea", { className: "qbw-textarea" + (f.wide ? " wide" : ""), value: value ?? "", readOnly: ro, style: f.rows ? { minHeight: `${f.rows * 18}px` } : undefined, onChange: (e) => onChange(e.target.value) });
  } else if (f.kind === "json") {
    control = h(JsonCell, { value, onChange, readOnly: ro, placeholder: f.placeholder });
  } else if (f.kind === "password") {
    control = h("input", { ...common, type: "password", value: value ?? "", readOnly: ro, placeholder: f.placeholder ?? "已设置（保持 ******** 不变）", onChange: (e) => onChange(e.target.value) });
  } else {
    control = h("input", { ...common, value: value ?? "", readOnly: ro, placeholder: f.placeholder, onChange: (e) => onChange(e.target.value) });
    if (f.browse && !ro) {
      control = h("div", { style: { display: "flex", gap: "8px", alignItems: "center", flex: "1 1 100%" } },
        control,
        h("button", {
          type: "button",
          className: "qbw-btn qbw-btn2",
          onClick: async () => {
            const r = await browseNative(f.browse, f.label || "选择路径");
            if (r.ok && r.path) onChange(String(r.path));
            else if (!r.cancelled) (window.__surfcoreToast || console.warn)(r.error || "打不开选择框，请手动填写");
          },
        }, "浏览…"));
    }
  }
  return h(Row, { label: f.label, hint: f.hint, badge: f.badge }, control);
}

// ── 弹窗 ────────────────────────────────────────────────────────────────
function Modal({ title, note, onClose, children, width = 460 }) {
  return h("div", { className: "qbw-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) onClose?.(); } },
    h("div", {
      className: "qbw-modal",
      // 无障碍：弹窗要有 dialog 语义，读屏才会把它当成一个独立窗口而不是页面里的普通 div。
      role: "dialog",
      "aria-modal": "true",
      "aria-label": typeof title === "string" ? title : undefined,
      style: { maxWidth: `${width}px` },
    },
      h("h3", null, title),
      note ? h("p", null, note) : null,
      h("div", { style: { marginTop: "10px" } }, children)));
}

function SettingsModal({ title, note, onClose, onSave, busy, children, width = 460 }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const save = async () => {
    if (!onSave) { onClose?.(); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave();
    } catch (e) {
      // 保存失败必须停在弹窗里说清楚：旧实现没 catch，失败时 onSave 的 rejection
      // 变成 unhandled rejection，弹窗还照着「成功」的路径关掉，用户以为已经保存了。
      if (alive.current) { setErr(`保存失败：${e?.message || "未知错误"}`); setSaving(false); }
      return;
    }
    onClose?.();
    if (alive.current) setSaving(false);
  };
  return h(Modal, { title, note, onClose, width },
    children,
    err ? h("div", { className: "qbw-err" }, err) : null,
    h("div", { className: "qbw-actions" },
      onSave ? h(Btn, { onClick: save, disabled: saving || !!busy }, saving || busy === "save" ? "保存中…" : "保存") : null,
      h(Btn, { kind: "qbw-btn2", onClick: onClose, disabled: saving }, "取消")));
}

function AreaButton({ title, note, badge, onClick }) {
  return h("button", { type: "button", className: "qbw-area-btn", title: note || title, onClick },
    h("div", { style: { minWidth: 0, textAlign: "left" } },
      h("div", { className: "qbw-area-title" }, title, badge !== undefined ? h(Badge, null, badge) : null),
      note ? h("div", { className: "qbw-hint" }, note) : null),
    h("span", { className: "qbw-area-arrow" }, "›"));
}

// ── 分区 ────────────────────────────────────────────────────────────────
function Section({ title, note, children, defaultOpen = false, collapsible = true }) {
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  const toggle = () => setOpen((v) => !v);
  // 无障碍：标题行原本只是个带 onClick 的 div，键盘（Tab/Enter/空格）完全打不开；
  // 这里补 button 语义 + aria-expanded，屏幕阅读器也能读出「展开/收起」。
  return h("div", { className: "qbw-section" },
    h("div", {
      className: "qbw-group",
      style: { cursor: collapsible ? "pointer" : "default" },
      role: collapsible ? "button" : undefined,
      tabIndex: collapsible ? 0 : undefined,
      "aria-expanded": collapsible ? open : undefined,
      onClick: collapsible ? toggle : undefined,
      onKeyDown: collapsible
        ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }
        : undefined,
    },
      collapsible ? h("span", { style: { width: "12px", display: "inline-block" } }, open ? "▾" : "▸") : null,
      title,
      note ? h("small", null, note) : null),
    open || !collapsible ? h("div", { className: "qbw-rows" }, children) : null);
}

function AdvancedSettings({ children, note = "不常用的参数都在这里；展开后同样可改，改完统一点底部保存" }) {
  return h(Section, { title: "高级设置", note, defaultOpen: false }, children);
}

// ── 高级参数分组（QQ / B站 共用）─────────────────────────────────────────
// defaults：该范围（qq / bili）的后端默认值树；只用来「显示」未显式配置的键。
function FieldGroups({ groups, cfg, set, readOnly, groupExtra, onSave, categories, extras = [], defaults = null }) {
  const [openGroup, setOpenGroup] = useState(null);
  const [search, setSearch] = useState("");
  const active = groups.find((g) => g.group === openGroup) || null;
  const cats = Array.isArray(categories) && categories.length ? categories : [{ title: "设置", members: null }];
  const categoryOf = (name) => {
    const hit = cats.find((c) => !c.members || c.members.includes(name));
    return hit ? hit.title : (cats[cats.length - 1]?.title ?? "其他");
  };
  const byCat = new Map(cats.map((c) => [c.title, { groups: [], extras: [] }]));
  for (const g of groups) {
    const title = categoryOf(g.group);
    if (!byCat.has(title)) byCat.set(title, { groups: [], extras: [] });
    byCat.get(title).groups.push(g);
  }
  for (const e of extras) {
    const title = e.category && byCat.has(e.category) ? e.category : (cats[cats.length - 1]?.title ?? "其他");
    if (!byCat.has(title)) byCat.set(title, { groups: [], extras: [] });
    byCat.get(title).extras.push(e.node);
  }
  const needle = search.trim().toLowerCase();
  const results = needle ? groups.flatMap((g) => {
    const out = [];
    if (g.group.toLowerCase().includes(needle)) out.push({ group: g, label: g.group, path: g.group });
    for (const f of g.fields) {
      const hay = `${f.label} ${f.hint || ""} ${f.path.join(".")}`.toLowerCase();
      if (hay.includes(needle)) out.push({ group: g, label: f.label, path: `${g.group} › ${f.label}` });
    }
    return out;
  }).slice(0, 40) : [];
  return h("div", null,
    h("div", { className: "qbw-search" },
      h("input", {
        className: "qbw-input",
        placeholder: "搜索设置项",
        value: search,
        onChange: (e) => setSearch(e.target.value),
      }),
      search ? h(Btn, { kind: "qbw-btn2", onClick: () => setSearch("") }, "清空") : null),
    needle
      ? h("div", { className: "qbw-list" },
        results.length
          ? results.map((r, i) => h("button", {
            type: "button",
            key: `${r.group.group}-${r.label}-${i}`,
            className: "qbw-area-btn",
            onClick: () => setOpenGroup(r.group.group),
          },
            h("div", { style: { minWidth: 0, textAlign: "left" } },
              h("div", { className: "qbw-area-title" }, r.path),
              h("div", { className: "qbw-hint" }, `点击打开「${r.group.group}」`)),
            h("span", { className: "qbw-area-arrow" }, "›")))
          : h("div", { className: "qbw-hint" }, "没有匹配的设置项。"))
      : [...byCat.entries()].map(([title, bucket]) => {
        if (!bucket.groups.length && !bucket.extras.length) return null;
        return h("div", { key: title, className: "qbw-category" },
          h("h5", { className: "qbw-category-title" }, title),
          ...bucket.extras,
          bucket.groups.map((g) => h(AreaButton, {
            key: g.group,
            title: g.group,
            note: g.note || `${g.fields.length} 项设置`,
            badge: g.fields.length,
            onClick: () => setOpenGroup(g.group),
          })));
      }),
    active ? h(SettingsModal, {
      title: active.group,
      note: active.note,
      onClose: () => setOpenGroup(null),
      onSave,
      busy: null,
      width: 560,
    },
      typeof groupExtra === "function" ? groupExtra(active) : null,
      active.fields.map((f) => h(Field, {
        key: f.path.join("."),
        f,
        value: getPath(cfg, f.path),
        defaultValue: defaults ? getPath(defaults, f.path) : undefined,
        readOnly: typeof readOnly === "function" ? readOnly(f) : readOnly,
        onChange: (v) => set(f.path, v),
      }))) : null);
}

// ── 路径 ─────────────────────────────────────────────────────────────────
function PathLine({ label, path }) {
  return h("div", { className: "qbw-path" },
    h("span", null, label),
    h("code", null, path || "—"));
}


/* ══ fields.js ══ */
/* ─────────────────────────────────────────────────────────────────────────
 * fields —— 字段清单（静态数据，无逻辑）
 * QQ_FIELDS / BILI_FIELDS 是全量参数表的唯一来源；页面只负责排版。
 * ───────────────────────────────────────────────────────────────────────── */

const p = (path) => String(path).split(".");

    const F = (path, label, hint, kind = "text", extra = {}) => ({ path: p(path), label, hint, kind, ...extra });

    const QQ_FIELDS = [
      { group: "连接与身份", note: "QQ 桥接 / DSH 连接", fields: [
        F("dsh.baseUrl", "DSH 地址", "桥接连接本机 DSH 的 Web 地址"),
        F("dsh.provider", "模型提供方", "例如 deepseek-account"),
        F("dsh.model", "模型", "QQ 会话使用的模型"),
        F("dsh.reasoningEffort", "思考强度", "low / medium / high / max"),
        F("dsh.authToken", "DSH token", "通常留空，由桥接自动发现", "password"),
        F("dsh.allowRemote", "允许远程 DSH", "默认关；关掉只连本机", "switch"),
        // ownerQQ 不在这里：它已上移到两个标签页顶部的「管理员（QQ ⇄ B站 · 同一个人）」卡片，
        // 和 B站 owner.mid 一起保存，避免两个入口各改一边。
        F("agentPreset", "一代 preset", "默认 qq-chat"),
        F("workspaceTitle", "工作区名称", "QQ 会话在 DSH 里的归组名"),
F("sessionCwd", "会话工作目录", "留空用 surfcore 根目录", "text", { browse: "dir" }),
      ]},
      { group: "SnowLuma", note: "OneBot 网关；「一键启动」只在你点击时打开本机已安装的 SnowLuma 窗口，不安装、不部署、不代扫码", fields: [
        F("snowluma.wsUrl", "OneBot WebSocket", "例如 ws://127.0.0.1:3001"),
        F("snowluma.httpUrl", "OneBot HTTP", "例如 http://127.0.0.1:3000（不能和 WS 同端口）"),
        F("snowluma.accessToken", "OneBot accessToken", "SnowLuma 里配置的 token", "password"),
        F("snowluma.followDiscoveredEndpoint", "跟随自发现端点", "网关换端口时自动跟随", "switch"),
        F("snowluma.silenceWarnMs", "静默告警阈值（ms）", "多久没事件包就警告", "number", { min: 60000 }),
        F("snowluma.allowLaunch", "允许插件打开 SnowLuma", "默认关；开启后一键启动会弹出 SnowLuma 窗口，仍需你扫码", "switch"),
        F("snowluma.launcherPath", "SnowLuma 安装目录", "解压出来的根目录（里面有 app）；例如 D:/Tools/SnowLuma2", "text", { browse: "dir" }),
        F("snowluma.launchScript", "启动脚本（可选）", "留空自动找 安装目录\\app\\launcher.bat", "text", { wide: true }),
        F("snowluma.homeDir", "SnowLuma home（app 目录）", "内含 config 的那个目录，一般是 安装目录 下的 app；填错会导致「检测不到」", "text", { browse: "dir" }),
      ]},
      { group: "控制台", note: "桥接本地控制台", fields: [
        F("consolePort", "控制台端口", "默认 3100", "number", { min: 1024, max: 65535 }),
        F("consoleToken", "控制台令牌", "留空 = 自动生成并保存到 state/console-token", "password"),
        F("ackMessage", "收到消息的自动回复", "空字符串关闭"),
        F("sendDelayMs", "发送间隔（ms）", "防频率限制", "number", { min: 0 }),
        F("questionTimeoutMs", "提问/审批超时（ms）", "默认 5 分钟", "number", { min: 10000 }),
      ]},
      { group: "安全通知", note: "黑名单（deny.users / deny.groups / deny.private）在页面顶部的「QQ 黑名单」卡片里，这里不再重复输入框", fields: [
        F("security.interceptNotify", "安全拦截通知", "拦截到敏感操作时通知管理员", "switch"),
      ]},
      { group: "人格与注入", note: "人格卡在「角色」页统一编辑", fields: [
        F("role.maxInjectChars", "人格注入上限（字符）", "1000~20000；默认 6000", "number", { min: 1000, max: 20000 }),
      ]},
      { group: "一代仿真（reserved）", note: "文本自动转发 + [SILENT]", fields: [
        F("social.enabled", "启用一代仿真", "", "switch"),
        F("social.maxReplyChars", "单条最大字数", "", "number", { min: 20 }),
        F("social.mustReplyKeywords", "必须回复关键词", "逗号分隔", "list"),
        F("social.contextWindow", "上下文条数", "", "number", { min: 0 }),
        F("social.triggerProbability", "普通消息触发概率", "0~1", "number", { min: 0, max: 1, step: 0.01 }),
        F("social.activeCheckMinMs", "活跃检测最小间隔（ms）", "", "number"),
        F("social.activeCheckMaxMs", "活跃检测最大间隔（ms）", "", "number"),
        F("social.idleWindowMs", "空闲窗口（ms）", "", "number"),
        F("social.idleRetryProbability", "空闲重试概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("social.proactiveEnabled", "主动搭话", "", "switch"),
        F("social.proactiveIdleThresholdMs", "主动搭话空闲阈值（ms）", "", "number"),
        F("social.proactiveCheckMinMs", "主动检查最小间隔（ms）", "", "number"),
        F("social.proactiveCheckMaxMs", "主动检查最大间隔（ms）", "", "number"),
        F("social.proactiveProbability", "主动搭话概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("social.activeReplyDelayMinMs", "回复延迟最小（ms）", "", "number"),
        F("social.activeReplyDelayMaxMs", "回复延迟最大（ms）", "", "number"),
        F("social.activeDurationEnabled", "活跃时长限制", "", "switch"),
        F("social.activeDurationMinMs", "活跃时长最小（ms）", "", "number"),
        F("social.activeDurationMaxMs", "活跃时长最大（ms）", "", "number"),
        F("social.skipProbability", "跳过概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("social.surrenderProbability", "放弃概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("social.idleRetryWaitMs", "空闲重试等待（ms）", "", "number"),
        F("social.burstEnabled", "分条发送", "", "switch"),
        F("social.burstIntervalMinMs", "分条最小间隔（ms）", "", "number"),
        F("social.burstIntervalMaxMs", "分条最大间隔（ms）", "", "number"),
        F("social.longGapProbability", "长间隔概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("social.longGapMinMs", "长间隔最小（ms）", "", "number"),
        F("social.longGapMaxMs", "长间隔最大（ms）", "", "number"),
      ]},
      { group: "二代仿真（reserved2）", note: "工具化收发 + 自主潜水", fields: [
        F("socialV2.enabled", "启用二代仿真", "", "switch"),
        F("socialV2.autoReplyCheckMs", "自动回复检查间隔（ms）", "", "number"),
        F("socialV2.agentPreset", "二代 preset", "默认 qq-chat-v2"),
        F("socialV2.provideRecommendations", "提供推荐值", "", "switch"),
        F("socialV2.initialPromptMaxChars", "初始提示词上限（字符）", "100~8000", "number", { min: 100, max: 8000 }),
      ]},
      { group: "鱼群判定关键词（QQ）", note: "开头 / 中间 / 结尾任一命中即算鱼；默认 肥鱼 + 结尾 fish/鱼；群名关键词只收紧鱼窝阈值，不把人算鱼", fields: [
        F("fishGuard.namePrefixes", "鱼名开头词", "逗号分隔；名字以这些词开头就算鱼（默认空，例如 DSH）", "list", { placeholder: "点击输入，例如 DSH（逗号分隔）" }),
        F("fishGuard.nameContains", "鱼名包含词", "逗号分隔；名字里只要包含这些词就算鱼（默认 肥鱼，例如 吃白饭）", "list"),
        F("fishGuard.nameSuffixes", "鱼名结尾词", "逗号分隔；默认 肥鱼,fish,鱼（最后一个字是鱼也算；接受极小概率误伤真人）", "list"),
        F("fishGuard.groupNameSuffixes", "鱼窝群名包含词", "逗号分隔；群名包含这些词时收紧阈值（不把人算成鱼）", "list"),
        F("fishGuard.fishIds", "额外认定的鱼 QQ", "逗号分隔；名字不像但确认是鱼时填这里", "list"),
        F("fishGuard.exemptNames", "豁免昵称", "逗号分隔；人类用鱼名时不误伤", "list"),
        F("fishGuard.exemptIds", "豁免 QQ", "逗号分隔", "list"),
      ]},
      { group: "鱼群保护（QQ）", note: "多个同类角色同群时自动少说；只影响群聊自动参与，私聊/管理员不受影响；保存后重启 QQ 桥接生效", fields: [
        F("fishGuard.enabled", "启用 QQ 鱼群保护", "关掉 = 永远按原逻辑参与", "switch"),
        F("fishGuard.windowMs", "统计窗口（ms）", "默认 600000（10 分钟）", "number", { min: 60000 }),
        F("fishGuard.cooldownMs", "触发后冷却（ms）", "默认 600000；冷却内只回直接叫它的人", "number", { min: 60000 }),
        F("fishGuard.maxFish", "多少条不同的鱼算泛滥", "默认 5（不同发送者）", "number", { min: 2, max: 20 }),
        F("fishGuard.maxConsecutiveFish", "连续多少条鱼消息算刷屏", "默认 5；至少要 2 条不同的鱼", "number", { min: 2, max: 30 }),
        F("fishGuard.singleFishMaxConsecutive", "单只鱼连续多少条才拦", "默认 5；想更宽松可调到 8", "number", { min: 2, max: 50 }),
        F("fishGuard.maxFishMessages", "补充：鱼消息条数阈值", "默认 8；与占比同时命中才拦", "number", { min: 2 }),
        F("fishGuard.maxFishRatio", "补充：鱼消息占比阈值", "0~1；默认 0.6", "number", { min: 0, max: 1, step: 0.05 }),
        F("fishGuard.minSample", "补充：最少样本条数", "默认 8；样本太少不按占比判定", "number", { min: 2 }),
        F("fishGuard.minFishSendersForRatio", "补充：至少几条不同的鱼", "默认 2；防单鱼占比误判", "number", { min: 1 }),
        F("fishGuard.groupNestMaxFish", "鱼窝群的收紧阈值", "群名像鱼窝时，不同鱼≥3 就触发", "number", { min: 2 }),
        F("fishGuard.groupNestIds", "指定鱼窝群号", "逗号分隔；这些群直接按鱼窝收紧阈值", "list"),
        F("fishGuard.bypassDirectAddress", "被直接叫到时放行", "默认开；只回一句，不主动展开", "switch"),
        F("fishGuard.blockSends", "保护期内硬拦发送", "默认开；防止 AI 趁冷却偷偷发", "switch"),
      ]},
      { group: "Token 防爆破", note: "和鱼群守则同时生效：鱼群守则先拦，再按这里限制唤醒次数/单次发送条数；每日花费/额度已迁移到「Token 额度」页（按自然日，QQ/B站/总额分开管）", fields: [
        F("socialV2.tokenGuard.enabled", "启用 Token 防爆破", "默认开；关掉 = 只按旧限频", "switch"),
        F("socialV2.tokenGuard.maxWakesPerDay", "单会话每天最多醒", "默认 20；群聊；超过后不再唤醒", "number", { min: 0, max: 200 }),
        F("socialV2.tokenGuard.privateMaxWakesPerDay", "私聊每天最多醒", "默认 10；私聊爆破先卡这里", "number", { min: 0, max: 200 }),
        F("socialV2.tokenGuard.minWakeGapMs", "两次苏醒最小间隔（ms）", "默认 120000；普通消息再多也先合并", "number", { min: 0, max: 3600000 }),
        F("socialV2.tokenGuard.directBypassGap", "被 @/叫到时越过间隔", "默认开；@、引用、叫名字、提问、拍一拍可立即唤醒；每日次数/额度上限仍生效", "switch"),
        F("socialV2.tokenGuard.maxOutboundPerTurn", "每次醒来最多发", "默认 8 条；连续回 10 条仍会被硬拦", "number", { min: 1, max: 20 }),
      ]},
      { group: "二代 · 唤醒与潜水", note: "qq_set_wake_config 的边界", fields: [
        F("socialV2.wake.defaultMode", "默认状态", "diving / active", "select", { options: [["diving", "潜水"], ["active", "活跃"]] }),
        F("socialV2.wake.preSleepWaitEnabled", "沉睡前必须观察", "", "switch"),
        F("socialV2.wake.preSleepWaitMs", "沉睡前观察时长（ms）", "默认 300000", "number", { min: 10000 }),
        F("socialV2.wake.recommendedDefaultInfinite", "推荐无限期潜水", "", "switch"),
        F("socialV2.wake.sleepMinMs", "潜水最短（ms）", "", "number"),
        F("socialV2.wake.sleepMaxMs", "潜水最长（ms；0=无限）", "", "number"),
        F("socialV2.wake.recommendedSleepMinMs", "推荐最短（ms）", "", "number"),
        F("socialV2.wake.recommendedSleepMaxMs", "推荐最长（ms）", "", "number"),
        F("socialV2.wake.recommendedProbability", "推荐普通消息概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("socialV2.wake.recommendedKeywords", "推荐唤醒关键词", "逗号分隔", "list"),
        F("socialV2.wake.recommendedAtMention", "推荐 @ 唤醒", "", "switch"),
        F("socialV2.wake.recommendedNameMention", "推荐名字唤醒", "", "switch"),
        F("socialV2.wake.recommendedQuestion", "推荐提问唤醒", "", "switch"),
        F("socialV2.wake.recommendedPoke", "推荐拍一拍唤醒", "", "switch"),
        F("socialV2.wake.batchWindowMs", "合并唤醒窗口（ms）", "", "number"),
        F("socialV2.wake.maxWakePerMinute", "每分钟最多唤醒", "", "number", { min: 0 }),
        F("socialV2.wake.maxWakePerHour", "每小时最多唤醒", "", "number", { min: 0 }),
        F("socialV2.wake.noActionLimit", "无动作上限", "", "number", { min: 0 }),
        F("socialV2.wake.backlogMaxSessions", "启动补唤醒最多会话数", "backlog 冷启动最贵；默认 3，避免重启后一次叫醒太多会话", "number", { min: 1, max: 20 }),
        F("socialV2.wake.maxWakeConfigReminders", "唤醒配置提醒上限", "", "number", { min: 0 }),
        F("socialV2.wake.recommendedHint", "推荐提示词", "给模型的推荐说明", "textarea", { rows: 4 }),
      ]},
      { group: "二代 · 对话收尾判断", note: "让每段对话有自然终点：判断该结束时不再补一句，而是记下收在哪、下次怎么接；不是潜水，被叫到/私聊仍会醒", fields: [
        F("socialV2.closure.enabled", "启用对话收尾判断", "默认开；关掉后模型不会收到收尾建议，也不能调用 qq_close_conversation", "switch"),
        F("socialV2.closure.cooldownMs", "收尾后软冷却（ms）", "默认 1200000（20 分钟）；只压普通概率唤醒/回复检查/主动机会，@/提问/私聊不受影响", "number", { min: 60000 }),
        F("socialV2.closure.requireNoOpenQuestion", "对方还在问时拒绝收尾", "默认开；防止用「结束」逃避该回的问题", "switch"),
        F("socialV2.closure.promptInWake", "每次唤醒注入判断参数", "默认开；有近期对话时才注入，没对话不占 token", "switch"),
        F("socialV2.closure.maxSummaryChars", "收尾摘要上限（字）", "默认 160", "number", { min: 20, max: 500 }),
        F("socialV2.closure.maxNextOpeningChars", "下次接法上限（字）", "默认 120", "number", { min: 10, max: 300 }),
      ]},
      { group: "二代 · 上线补历史消息", note: "桥接/QQ 账号上线时，用 SnowLuma 的历史消息接口补看离线期间错过的白名单会话；默认开，保存后重启 QQ 桥接生效", fields: [
        F("socialV2.history.enabled", "每次上线补看历史消息", "默认开；关掉后不请求历史接口", "switch"),
        F("socialV2.history.limit", "每个会话最多补几条", "默认 30；历史接口按最新 N 条返回", "number", { min: 1, max: 100 }),
        F("socialV2.history.maxAgeMinutes", "只补最近多少分钟", "默认 720（12 小时）", "number", { min: 1, max: 10080 }),
        F("socialV2.history.wake", "发现漏消息时主动醒一次", "默认开；关掉则只并入未读，等下次有人说话再看", "switch"),
        F("socialV2.history.includePrivate", "也补私聊", "默认开；只补白名单会话", "switch"),
      ]},
      { group: "二代 · 发送与节奏", fields: [
        F("socialV2.send.burstEnabled", "分条发送", "", "switch"),
        F("socialV2.send.burstMaxMessages", "单轮最多条数", "", "number", { min: 1 }),
        F("socialV2.send.burstIntervalMinMs", "分条最小间隔（ms）", "", "number"),
        F("socialV2.send.burstIntervalMaxMs", "分条最大间隔（ms）", "", "number"),
        F("socialV2.send.longGapProbability", "长间隔概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("socialV2.send.longGapMinMs", "长间隔最小（ms）", "", "number"),
        F("socialV2.send.longGapMaxMs", "长间隔最大（ms）", "", "number"),
        F("socialV2.send.maxSendPerMinute", "每分钟最多发送", "", "number", { min: 1 }),
        F("socialV2.send.maxSendPerHour", "每小时最多发送", "", "number", { min: 1 }),
        F("socialV2.send.maxMessageChars", "单条最大字符", "", "number", { min: 10 }),
        F("socialV2.send.maxGapMs", "最大间隔（ms）", "", "number"),
        F("socialV2.send.gapBaseMs", "基础间隔（ms）", "", "number"),
        F("socialV2.send.gapPerCharMs", "每字追加间隔（ms）", "", "number"),
        F("socialV2.send.recommendedHint", "节奏提示词", "给模型的分条建议", "textarea", { rows: 4 }),
      ]},
      { group: "二代 · 等待与上下文", fields: [
        F("socialV2.wait.defaultMs", "默认等待（ms）", "", "number"),
        F("socialV2.wait.minMs", "最短等待（ms）", "", "number"),
        F("socialV2.wait.maxMs", "最长等待（ms）", "", "number"),
        F("socialV2.wait.defaultQuietMs", "默认静默（ms）", "", "number"),
        F("socialV2.wait.minQuietAfterNewMs", "新消息后最短静默（ms）", "", "number"),
        F("socialV2.context.recentLimit", "最近消息上限", "", "number"),
        F("socialV2.context.unreadLimit", "未读上限", "", "number"),
        F("socialV2.context.contextWindow", "上下文窗口", "", "number"),
        F("socialV2.context.inlineWakeMessages", "唤醒时内联消息", "", "switch"),
        F("socialV2.context.wakeFoldOld", "唤醒只带最近一窗（更早的未读折叠）", "开 = 从最近往回看；关 = 从最早未读开始塞（旧行为，积压时会先回老消息）", "switch"),
        F("socialV2.context.wakeMessageLimit", "唤醒消息上限", "", "number"),
        F("socialV2.context.wakeRecentLimit", "唤醒最近消息上限", "", "number"),
        F("socialV2.context.wakeMaxChars", "唤醒上下文最大字符", "", "number"),
      ]},
      { group: "二代 · 主动与反馈", fields: [
        F("socialV2.proactive.enabled", "主动搭话", "", "switch"),
        F("socialV2.proactive.checkIntervalMinMs", "检查最小间隔（ms）", "", "number"),
        F("socialV2.proactive.checkIntervalMaxMs", "检查最大间隔（ms）", "", "number"),
        F("socialV2.proactive.idleThresholdMs", "空闲阈值（ms）", "", "number"),
        F("socialV2.proactive.probability", "主动概率", "", "number", { min: 0, max: 1, step: 0.01 }),
        F("socialV2.feedback.maxLength", "反馈最大字符", "", "number"),
        F("socialV2.feedback.notifyOwnerOnError", "出错通知管理员", "", "switch"),
        F("socialV2.media.maxBytes", "图片单条最大字节", "", "number"),
        F("socialV2.media.maxPixels", "单张最大像素", "", "number"),
        F("socialV2.media.maxCount", "单条最多图片", "", "number", { min: 1 }),
      ]},
      { group: "群聊（chat 模式）", note: "只影响 chat 一代逐条回复；reserved2 的发言/唤醒在「二代仿真」「鱼群保护」「Token 防爆破」", fields: [
        F("chat.contextMessages", "群聊上下文条数", "默认 10；0=关闭", "number", { min: 0, max: 100 }),
        F("chat.groupContextMessages", "按群覆盖上下文", "JSON：{\"群号\": 条数}", "json"),
        F("chat.addressFilter.enabled", "别人之间说话时过滤（chat 模式）", "只影响 chat 逐条回复；reserved2 不用这个判定", "switch"),
        F("chat.addressFilter.silenceWhenAddressedToOther", "别人互相说话时沉默概率（chat 模式）", "0.4=40% 沉默、60% 插话；日志里的“不插话”可能来自这里，只在 chat 生效", "number", { min: 0, max: 1, step: 0.01 }),
        F("chat.presence.enabled", "群聊生物钟（chat 模式）", "只影响 chat 模式逐条回复；reserved2 用唤醒/鱼群/Token 判定，不用这个", "switch"),
        F("chat.presence.onlineShare", "每小时在线/看群占比（chat 模式）", "0.4=40% 在线、60% 不看群；只影响 chat；0=一直离线，1=一直在线", "number", { min: 0, max: 1, step: 0.01 }),
        F("chat.presence.offlineMinMs", "最短离线（ms，chat 模式）", "", "number"),
        F("chat.presence.wakeWindowMs", "被叫醒后在线窗口（ms，chat 模式）", "", "number"),
        F("chat.proactive.enabled", "群聊主动搭话", "", "switch"),
        F("chat.proactive.minIntervalMs", "最小间隔（ms）", "", "number"),
        F("chat.proactive.minMessages", "最少消息数", "", "number", { min: 1 }),
      ]},
      { group: "黑话学习", fields: [
        F("slang.enabled", "启用黑话学习", "", "switch"),
        F("slang.extractMinMessages", "触发提取的最少消息", "", "number", { min: 1 }),
        F("slang.extractCooldownMs", "提取冷却（ms）", "", "number"),
        F("slang.inferenceThresholds", "推断阈值", "逗号分隔，例如 2，4，8", "list"),
        F("slang.injectMax", "每条注入上限", "", "number", { min: 0 }),
        F("slang.learnerPreset", "学习用 preset", ""),
        F("slang.workspaceTitle", "学习工作区名称", ""),
        F("slang.autoResearch", "自动联网研究", "", "switch"),
      ]},
      { group: "联网搜索", fields: [
        F("webSearch.provider", "搜索后端", "auto / deepseek / bing", "select", { options: [["auto", "auto"], ["deepseek", "deepseek"], ["bing", "bing"]] }),
        F("webSearch.apiKeyEnv", "凭据环境变量", "默认 DEEPSEEK_API_KEY"),
        F("webSearch.apiKey", "搜索 API Key", "不推荐写死；留 ******** 保持原值", "password"),
        F("webSearch.baseURL", "搜索端点", "必须 https 且解析到公网"),
        F("webSearch.model", "搜索模型", ""),
        F("webSearch.maxUses", "单次最多搜索", "", "number", { min: 1 }),
        F("webSearch.maxTokens", "最大 token", "", "number", { min: 1 }),
        F("webSearch.maxResults", "返回条数", "", "number", { min: 1 }),
        F("webSearch.timeoutMs", "超时（ms）", "", "number"),
      ]},
    ];

    const TOOL_LABELS = {
      getPrompt: "读取提示词", getSnapshot: "上下文快照", getUnread: "读未读", getRecent: "读最近", socialState: "社交状态",
      sendGroup: "发群消息", sendPrivate: "发私聊", reply: "引用回复", sendBurst: "分条发送",
      sendMessage: "统一发送", waitMessages: "等消息", feedback: "反馈", getMyRecent: "看我最近",
      getMessageDetail: "消息详情", getActiveMembers: "活跃成员", setWakeConfig: "设置唤醒",
      markRead: "标记已读", closeConversation: "对话收尾", memory: "轻量记忆", slangQuery: "查黑话", slangSubmit: "提交黑话",      getImages: "看图", getForwardMsg: "看合并转发", sendPoke: "拍一拍", listStickers: "表情列表",
      getStickerImage: "表情图片", sendSticker: "发表情", setStickerRemark: "改表情备注",
      stickerNote: "表情笔记", collectSticker: "收藏表情", getSelfImage: "看自己形象", sendVoice: "发语音",
    };

    const QQ_ADV_CATEGORIES = [
      { title: "接入与身份", members: ["连接与身份", "SnowLuma", "控制台", "安全通知"] },
      { title: "人格与提示", members: ["人格与注入", "一代仿真（reserved）", "二代仿真（reserved2）"] },
      { title: "群与安全", members: ["群管理", "鱼群判定关键词（QQ）", "鱼群保护（QQ）", "Token 防爆破"] },
      { title: "唤醒与收尾", members: ["唤醒与潜水", "二代 · 唤醒与潜水", "对话收尾", "二代 · 对话收尾判断", "二代 · 上线补历史消息"] },
      { title: "发送与上下文", members: ["二代 · 发送与节奏", "二代 · 等待与上下文", "二代 · 主动与反馈"] },
      { title: "群聊与学习", members: ["群聊（chat 模式）", "黑话学习", "联网搜索"] },
      { title: "工具与媒体", members: ["工具面", "二代 · 工具开关", "表情包", "语音"] },
      { title: "其他", members: null },
    ];

    const BILI_ADV_CATEGORIES = [
      { title: "身份与权限", members: ["她自己（只读）", "B站 会话权限"] },
      { title: "内容与口味", members: ["口味（文本）", "四类动态", "鱼群判定关键词（B站）", "鱼群保护（B站）"] },
      { title: "作息与分享", members: ["作息", "分享", "倾听（别人找她）", "日记与推送"] },
      { title: "额度与工具", members: ["额度（代码闸门）", "工具链"] },
      { title: "其他", members: null },
    ];

    // B站 → QQ 自动分享（写根 config.json 的 biliBridge；保存后重启桥接生效）。
    const QQ_BILI_SHARE_FIELDS = [
      F("biliBridge.enabled", "启用 B站 桥接", "", "switch"),
      F("biliBridge.share.enabled", "启用定时视频分享", "每天按下面的时间点给群发 B站 视频卡片", "switch"),
      F("biliBridge.share.times", "分享时间点", "HH:MM，逗号分隔；默认 07/11/13/15/17/19/21/23", "times"),
      F("biliBridge.share.groups", "只发这些群", "留空 = 跟随 allow.groups", "list"),
      F("biliBridge.share.gapMs", "卡片到短评的间隔（ms）", "默认 4000", "number", { min: 0, max: 60000 }),
      F("biliBridge.share.cardMode", "分享形式", "文本链接 = 标题 + 链接两条消息（推荐：QQ 不显示第三方卡片，会提示「发送者版本过低」）；小程序卡片点了会提示「小程序已下架」", "select", {
        options: [["text", "文本链接（推荐）"], ["miniapp", "小程序卡片（已下架，不推荐）"], ["off", "不发卡片（链接由短评带）"]],
      }),
      F("biliBridge.dynamics.enabled", "B站新动态同步到 QQ", "", "switch"),
      F("biliBridge.dynamics.pollIntervalMs", "动态轮询间隔（ms）", "默认 180000（3 分钟）", "number", { min: 60000, max: 3600000 }),
      F("biliBridge.dynamics.groups", "动态只发这些群", "留空 = 跟随 allow.groups", "list"),
    ];

    const BILI_FIELDS = [
      { group: "她自己（只读）", note: "管理员（主人）的 QQ 与 B站 mid 在标签页顶部统一设置 →", fields: [
        // owner.mid / owner.name 不在这里：已上移到「管理员」卡片，和 QQ 号一起保存。
        F("self.mid", "她自己 mid", "只读（来自 cookie / nav）", "text", { readOnly: true }),
        F("self.name", "她自己昵称", "只读（来自 nav）", "text", { readOnly: true }),
      ]},
      { group: "作息", note: "生物钟窗口", fields: [
        F("night.skipChance", "今晚不看的概率", "0.3 = 三成；轻醒只结束当前 slot，不结束全天", "number", { min: 0, max: 0.95, step: 0.01 }),
        F("night.maxVideos", "单次初筛视频数", "", "number", { min: 1, max: 20 }),
        F("night.maxWakesPerDay", "每天最多醒来", "0~12；C 模式：每窗至少 1 次，剩余按该时段评分分配", "number", { min: 0, max: 12 }),
        F("night.minGapMin", "两次苏醒最小间隔（分钟）", "默认 20；相邻窗口也按这个错开；太小会低质量空跑", "number", { min: 0, max: 120 }),
      ]},
      { group: "口味（文本）", note: "逗号分隔；单个关键词的权重在下面「口味权重 / 一键抓取」里调", fields: [
        F("preferences.like", "爱看", "逗号分隔；喂给选题器", "list"),
        F("preferences.dislike", "不爱看", "逗号分隔", "list"),
        F("preferences.keywords", "额外关键词", "逗号分隔；只扩大搜索，默认权重 0.75", "list"),
      ]},
      { group: "分享", fields: [
        F("share.enabled", "开启分享", "关掉 = 只看不说", "switch"),
        F("share.via", "分享方式", "默认发自己的动态（视频卡片）；也可评论区 @ / B站私信", "select", { options: [["dynamic", "发自己的动态（视频卡片）"], ["comment", "评论区 @ 你"], ["dm", "B站私信"]] }),
        F("quota.shareDaily", "每天上限", "建议 ≤3；0 = 不分享", "number", { min: 0, max: 20 }),
        F("share.minScore", "最低评分", "0~20；不到就不发", "number", { min: 0, max: 20 }),
        F("share.silentAfterDays", "沉默几天后降额", "", "number", { min: 0 }),
        F("share.decayPerDay", "每天降多少", "", "number", { min: 0 }),
      ]},
      { group: "额度（代码闸门）", note: "四本账的硬上限；0 = 不限量（关闭该上限）。保存后下一轮生效，不用重启 DSH。", fields: [
        F("limits.daily", "普通评论 / 天", "默认 30", "number", { min: 0, max: 200 }),
        F("limits.replyDaily", "回找我的人 / 天", "默认 50", "number", { min: 0, max: 500 }),
        F("limits.taDaily", "主动搭话 / 天", "默认 15", "number", { min: 0, max: 200 }),
        F("limits.mineDaily", "动态回复 / 类 / 天", "默认 10；四类各自算", "number", { min: 0, max: 100 }),
        F("limits.minePerPerson", "动态回复 / 人 / 类 / 天", "默认 1", "number", { min: 0, max: 20 }),
        F("limits.globalMin", "任意两条发言间隔（分钟）", "默认 2；0 = 不冷却", "number", { min: 0, max: 120 }),
        F("limits.perUpMin", "同一 UP 冷却（分钟）", "默认 10", "number", { min: 0, max: 1440 }),
        F("limits.perVideoMin", "同一视频冷却（分钟）", "默认 60", "number", { min: 0, max: 1440 }),
        F("limits.perThreadMin", "同一条评论冷却（分钟）", "默认 1440（24 小时）", "number", { min: 0, max: 10080 }),
      ]},
      { group: "四类动态", note: "每类一天一条；时段从该类的点开始，到下一类启用的点为止。前缀留空 = 不加固定开头。", fields: [
        F("dynamics.enabled", "四类动态总开关", "关掉 = 不再定时提醒发动态", "switch"),
        F("dynamics.gapMin", "任意两条动态间隔（分钟）", "默认 30；5~240", "number", { min: 5, max: 240 }),
        ...Object.entries({
          best: "一类 · 最高分视频",
          game: "二类 · 游戏 AI 二创",
          anime: "三类 · 动漫",
          gaming: "四类 · 游戏区",
        }).flatMap(([key, label]) => [
          F(`dynamics.kinds.${key}.enabled`, `${label} · 开关`, "", "switch"),
          F(`dynamics.kinds.${key}.slot`, `${label} · 时段（点）`, "0~23；从该点起，到下一类启用的点", "number", { min: 0, max: 23 }),
          F(`dynamics.kinds.${key}.minLen`, `${label} · 最短字数`, "", "number", { min: 10, max: 1000 }),
          F(`dynamics.kinds.${key}.maxLen`, `${label} · 最长字数`, "", "number", { min: 20, max: 2000 }),
          F(`dynamics.kinds.${key}.prefix`, `${label} · 固定开头`, "留空 = 不加前缀", "text", { wide: true }),
        ]),
      ]},
      { group: "鱼群判定关键词（B站）", note: "开头 / 中间 / 结尾任一命中即算鱼；默认 肥鱼 + 结尾 fish/鱼；只要评论者昵称命中就算，不涉及视频/UP 名", fields: [
        F("fishGuard.namePrefixes", "鱼名开头词", "逗号分隔；名字以这些词开头就算鱼（默认空，例如 DSH）", "list", { placeholder: "点击输入，例如 DSH（逗号分隔）" }),
        F("fishGuard.nameContains", "鱼名包含词", "逗号分隔；名字里只要包含这些词就算鱼（默认 肥鱼，例如 吃白饭）", "list"),
        F("fishGuard.nameSuffixes", "鱼名结尾词", "逗号分隔；默认 肥鱼,fish,鱼（最后一个字是鱼也算；接受极小概率误伤真人）", "list"),
        F("fishGuard.extraFishMids", "额外认定的鱼 mid", "逗号分隔；改名了也能认出来（B站 mid）", "list"),
        F("fishGuard.exemptNames", "豁免昵称", "逗号分隔", "list"),
        F("fishGuard.exemptMids", "豁免 mid", "逗号分隔；主人/自己会被代码强制排除", "list"),
      ]},
      { group: "鱼群保护（B站）", note: "评论区鱼太多就不发新楼层；优先回鱼；给鱼点赞（只拦她自己决定的发言，下一轮醒来生效）", fields: [
        F("fishGuard.enabled", "启用 B站鱼群保护", "关掉 = 永远发新楼层", "switch"),
        F("fishGuard.sampleSize", "取样顶层评论数", "默认 40；看最近/最热由接口排序决定", "number", { min: 5, max: 100 }),
        F("fishGuard.maxFishTopLevel", "多少条鱼的楼层算泛滥", "默认 3", "number", { min: 1, max: 50 }),
        F("fishGuard.maxFishMids", "多少个鱼账号算泛滥", "默认 3；防同一只鱼刷很多楼层", "number", { min: 1, max: 50 }),
        F("fishGuard.maxFishRatio", "鱼楼层占比阈值", "0~1；默认 0.4", "number", { min: 0, max: 1, step: 0.05 }),
        F("fishGuard.minSample", "占比判定最少样本", "默认 8", "number", { min: 2, max: 100 }),
        F("fishGuard.includeHotSample", "同时取热度序样本", "默认开；时间序+热度序去重，降低采样偏差", "switch"),
        F("fishGuard.gatherEnabled", "聚拢：改成回鱼", "鱼太多时把想说的话变成对鱼评论的回复", "switch"),
        F("fishGuard.forceGather", "每次醒来强制聚拢", "默认开；鱼群泛滥时就算没有满足条件的鱼楼，也强行挑一条回（仍受额度/冷却）", "switch"),
        F("fishGuard.gatherMaxReplies", "只回回复少的鱼楼", "默认 ≤6 条回复", "number", { min: 0, max: 100 }),
        F("fishGuard.gatherMaxFishReplies", "鱼楼里鱼回复太多就跳过", "默认 >2 条鱼回复不挤进去，防鱼群串", "number", { min: 0, max: 50 }),
        F("fishGuard.gatherMaxAgeHours", "只回多新的鱼楼（小时）", "默认 72；太旧的不打扰", "number", { min: 1 }),
        F("fishGuard.gatherCooldownHours", "同一鱼楼冷却（小时）", "默认 12；避免反复回同一条", "number", { min: 0 }),
        F("fishGuard.likeEnabled", "点赞机制", "给鱼的楼层/楼里的鱼回复点赞", "switch"),
        F("fishGuard.maxLikesPerDay", "每天最多点赞", "默认 6；避免像刷赞", "number", { min: 0, max: 200 }),
        F("fishGuard.maxLikesPerRun", "每次最多点赞", "默认 4", "number", { min: 0, max: 50 }),
        F("fishGuard.likeFishReplies", "也赞楼里的鱼回复", "默认开；让整楼的鱼一起被顶上去", "switch"),
        F("fishGuard.likeAfterCommentMs", "发完评论等多久再点赞", "默认 12000ms；刚发完就点容易被风控", "number", { min: 0, max: 120000 }),
        F("fishGuard.likeGapMinMs", "两次点赞最小间隔（ms）", "默认 1500；随机间隔更像真人", "number", { min: 0, max: 30000 }),
        F("fishGuard.likeGapMaxMs", "两次点赞最大间隔（ms）", "默认 4000", "number", { min: 0, max: 60000 }),
        F("fishGuard.failedLikeCooldownHours", "点赞失败后冷却（小时）", "默认 24；同一个 rpid 失败过就先跳过", "number", { min: 0 }),
        F("fishGuard.failCooldownMinutes", "风控失败冷却（分钟）", "默认 60；遇到 -509/12015 等码自动停手", "number", { min: 1 }),
      ]},
      { group: "B站 会话权限", note: "只影响她自己的 DSH 会话（bili-whale-*），不影响 QQ 桥接；改完下一次 tick 生效", fields: [
        F("agent.sandbox", "会话权限", "danger-full-access = 定时醒来能跑 bili.mjs（推荐；受限目录用 workspace-write 可能因 WRITE_OWNER 起不了命令）；workspace-write = 更安全但可能什么都跑不了", "select", {
          options: [["danger-full-access", "完全访问（推荐，能跑工具）"], ["workspace-write", "仅工作区（更安全，可能跑不了命令）"]],
        }),
      ]},
      { group: "倾听（别人找她）", fields: [
        F("listen.comment", "评论区监听", "", "switch"),
        F("listen.commentIntervalSec", "检查间隔（秒）", "建议 ≥300", "number", { min: 60 }),
        F("listen.scope", "监听范围", "回复我的 / 回复+@", "select", { options: [["both", "回复 + @"], ["reply", "只回复我"]] }),
        F("listen.oncePerPerson", "同一个人最多回一条", "30 天内只回一次", "switch"),
        F("listen.allDay", "全天监听", "关掉 = 只在她醒着的窗口里回", "switch"),
        F("listen.dm", "私信监听", "有私信就叫醒她", "switch"),
        F("listen.dmScope", "私信监听范围", "只认主人 / 谁找她都回", "select", { options: [["owner", "只认主人"], ["all", "谁找她都回"]] }),
      ]},
      { group: "日记与推送", fields: [
        F("diary.push", "推送日记摘要", "日记照写；只控制推不推", "switch"),
        F("diary.enabled", "写日记（锁定开）", "旧版本可关；现在照写不可关", "switch", { readOnly: true }),
        F("notify.type", "推送方式", "不推送 / 桌面通知 / Webhook / 自定义命令", "select", { options: [["none", "不推送"], ["desktop", "桌面通知"], ["webhook", "Webhook"], ["command", "自定义命令"]] }),
        F("notify.url", "Webhook 地址", "飞书/钉钉/企业微信/QQ机器人", "text", { wide: true }),
        F("notify.template", "模板", "纯文本 / markdown", "select", { options: [["text", "纯文本"], ["markdown", "markdown"]] }),
        F("notify.cmd", "自定义命令", "可执行文件；消息自动作为最后一个参数", "text", { wide: true }),
        F("notify.args", "命令参数", "JSON 数组", "json"),
      ]},
      { group: "工具链", fields: [
F("toolsPath", "bili.mjs 路径", "留空 = 用合体插件自带的 tools/", "text", { wide: true, browse: "file" }),
      ]},
    ];


/* ══ 02-shell.js ══ */
/* ─────────────────────────────────────────────────────────────────────────
 * 02-shell —— 外壳
 * 一页一职责：
 *   运行  = 概览（只看状态与启停）
 *   平台  = 养鱼（B站，含观看历史）/ 贴吧 / 抖音 / QQ
 *   角色  = 角色与记忆卡 / 记忆同步（含身份对齐）
 *   对话  = dsh-Dfy 挂件（桌宠 / 气泡 / QQ 消息卡）
 *   系统  = 额度 / 语音设置 / 安装与维护（含诊断）
 * 外壳只负责：导航、保存/撤销、全局提醒、数据装载。业务全在各页文件里。
 * ───────────────────────────────────────────────────────────────────────── */

const NAV_GROUPS = [
  { title: "运行", pages: [["overview", "概览"]] },
  { title: "平台", pages: [["bili", "养鱼（B站）"], ["tieba", "贴吧"], ["douyin", "抖音"], ["qq", "QQ"]] },
  { title: "角色", pages: [["characters", "角色与记忆卡"], ["memory", "记忆同步"]] },
  { title: "对话", pages: [["pet", "桌宠"], ["model", "模型"]] },
  { title: "系统", pages: [["tokens", "额度"], ["voice", "语音设置"], ["install", "安装与维护"]] },
];
const NAV_NAME = "dsh-Dfy";

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));

/* 根高度自适应宿主：宿主设置弹窗给的是「裁剪盒」，不是固定高度。
   只写死 max-height:76vh 时，中等长度的页会超出宿主可见区又不够触发内部滚动，
   表现为「这页滚不动」。这里实测最近的裁剪祖先，把根 max-height 钉在它里面。
   注意：首屏是加载态（根节点未渲染），必须等 ready 后再跑，否则 ref 永远是 null。 */
function useFitHostBox(ref, ready) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let p = el.parentElement;
      let box = null;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (/(auto|hidden|scroll)/.test(cs.overflowY) && p.clientHeight > 0) { box = p; break; }
        p = p.parentElement;
      }
      const pad = box ? (parseFloat(getComputedStyle(box).paddingTop) || 0) + (parseFloat(getComputedStyle(box).paddingBottom) || 0) : 0;
      const host = box ? box.clientHeight - pad : Math.min(window.innerHeight * 0.76, 820);
      el.style.maxHeight = `${Math.max(280, Math.min(Math.floor(host) - 2, 820))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    let p = el.parentElement;
    while (p && p !== document.body) { ro.observe(p); p = p.parentElement; }
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [ready]);
}

function SurfCoreSection() {
  useStyleOnce();
  const appRef = useRef(null);
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [qq, setQq] = useState(null);
  const [bili, setBili] = useState(null);
  const [unified, setUnified] = useState(null);
  const [configStamps, setConfigStamps] = useState(null);
  // GET /config 的 defaults（形状同配置，已脱敏）：只用于「未显式配置时按默认值显示」。
  // 后端还没升级时这里是 null，各页面自动回退旧行为（不报错）。
  const [configDefaults, setConfigDefaults] = useState(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState("");
  const [toastText, setToastText] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [memoryAlert, setMemoryAlert] = useState(null);
  const memorySnoozeRef = useRef(0);
  const [budget, setBudget] = useState(null);
  const [limitDraft, setLimitDraft] = useState(null);
  const [tokenAlert, setTokenAlert] = useState(null);
  const [tokenAlerted, setTokenAlerted] = useState(null);
  const budgetRef = useRef(null);
  useFitHostBox(appRef, Boolean(qq && bili && unified));

  // 全局提醒：4 秒后自动消失。
  // 旧实现每次 notify 都新建一个 setTimeout 且从不清理：连续两条提醒时，第一条的
  // 定时器会把第二条提前清掉（第二条刚出现就被抹）；组件卸载后定时器还在，
  // 又会对已卸载的组件 setState。这里只保留最后一个定时器，并在卸载时清掉。
  const toastTimerRef = useRef(0);
  const notify = useCallback((message) => {
    setToastText(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => { toastTimerRef.current = 0; setToastText(""); }, 4000);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = 0;
  }, []);
  useEffect(() => {
    window.__surfcoreToast = notify;
    return () => { delete window.__surfcoreToast; };
  }, [notify]);

  const applyBudget = (r) => {
    const previousLimits = budgetRef.current?.limits;
    budgetRef.current = r;
    setBudget(r);
    setTokenAlerted(r?.alertedToday ?? null);
    if (r?.alert) setTokenAlert(r.alert);
    setLimitDraft((prev) => {
      if (!prev) return r?.limits ?? null;
      const dirtyNow = JSON.stringify(prev) !== JSON.stringify(previousLimits);
      return dirtyNow ? prev : (r?.limits ?? prev);
    });
  };
  const loadBudget = useCallback(async () => {
    try { applyBudget(await api("/token-budget")); }
    catch (e) { setErr(`读取 token 额度失败：${e.message}`); }
  }, []);
  // 后台轮询用安静版：网络抖一下就每 30 秒把页面顶成一条红色错误，而且那条 err
  // 只有下一次「读取配置成功」才会被清掉，看起来像永久故障。静默失败保留上一次额度。
  const loadBudgetQuiet = useCallback(async () => {
    try { applyBudget(await api("/token-budget")); } catch { /* 静默：保留上一次额度 */ }
  }, []);
  const loadOverview = useCallback(async () => {
    try { setOverview(await api("/overview")); }
    catch (e) { setErr(`读取概览失败：${e.message}`); }
  }, []);
  // 状态自己会刷新（15 秒），不用用户点「刷新」：桥接连上/断开、账号上下线都能自己变。
  const loadOverviewQuiet = useCallback(async () => {
    try { setOverview(await api("/overview")); } catch { /* 静默：网络抖动不打扰 */ }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => { void loadOverviewQuiet(); }, 15_000);
    return () => clearInterval(timer);
  }, [loadOverviewQuiet]);
  const loadConfig = useCallback(async () => {
    setErr("");
    try {
      const r = await api("/config");
      setQq(r.qq ?? {});
      setBili(r.bili ?? {});
      setUnified(r.unified ?? {});
      setConfigStamps(r.stamps ?? null);
      setConfigDefaults(r.defaults && typeof r.defaults === "object" ? r.defaults : null);
      setSaved(JSON.stringify({ qq: r.qq ?? {}, bili: r.bili ?? {}, unified: r.unified ?? {} }));
    } catch (e) { setErr(`读取配置失败：${e.message}`); }
  }, []);
  useEffect(() => { loadOverview(); loadConfig(); loadBudget(); }, [loadOverview, loadConfig, loadBudget]);

  useEffect(() => {
    const timer = setInterval(() => { void loadBudgetQuiet(); }, 30_000);
    return () => clearInterval(timer);
  }, [loadBudgetQuiet]);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await api("/memory-card");
        if (stop) return;
        if (r.enabled === false) { setMemoryAlert(null); return; }
        const s = r.status ?? {};
        const level = Math.max(Number(s.level) || 0, Number(s.alertLevel) || 0);
        const acknowledged = Number(s.acknowledgedLevel) || 0;
        if (level > acknowledged && Date.now() > memorySnoozeRef.current) setMemoryAlert({ ...s, level });
        else setMemoryAlert(null);
      } catch { /* 读不到就不打扰 */ }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => { stop = true; clearInterval(timer); };
  }, []);

  const setQqPath = (path, value) => setQq((c) => setPathInto(clone(c), path, value));
  const setBiliPath = (path, value) => setBili((c) => setPathInto(clone(c), path, value));
  const setUnifiedPath = (path, value) => setUnified((c) => setPathInto(clone(c), path, value));
  const setAdmin = (next) => setUnifiedPath(["admin"], next);

  const budgetDirty = Boolean(limitDraft && budget && JSON.stringify(limitDraft) !== JSON.stringify(budget.limits));
  const dirty = Boolean(qq && bili && unified && (JSON.stringify({ qq, bili, unified }) !== saved || budgetDirty));

  // biliToQq 的过渡开关由记忆页写入 unified.__biliToQqToggle，保存前落到 QQ 配置。
  const normalizedQq = useMemo(() => {
    if (!qq) return qq;
    const next = clone(qq);
    const toggle = unified?.__biliToQqToggle;
    if (typeof toggle === "boolean") {
      next.biliBridge = next.biliBridge ?? {};
      next.biliBridge.enabled = true;
      next.biliBridge.memory = { ...(next.biliBridge.memory ?? {}), enabled: toggle };
    }
    return next;
  }, [qq, unified]);
  const normalizedUnified = useMemo(() => {
    if (!unified) return unified;
    const next = clone(unified);
    delete next.__biliToQqToggle;
    return next;
  }, [unified]);

  // 返回值：true = 已保存；false = 失败（错误已写到页面顶部 / 提醒条）。
  const save = async (restartBridge = false) => {
    setBusy("save");
    setErr("");
    setNote("");
    try {
      if (budgetDirty && limitDraft) {
        const b = await api("/token-budget", { method: "POST", body: { limits: limitDraft } });
        applyBudget(b);
        setLimitDraft(b.limits);
      }
      let r;
      try {
        r = await api("/config", { method: "POST", body: { qq: normalizedQq, bili, unified: normalizedUnified, restartBridge, baseStamp: configStamps } });
      } catch (e) {
        if (/CONFIG_STALE|已被别处修改/.test(String(e.message))) {
          setErr(`保存被拒绝：${e.message}。请点「刷新」后再改。`);
          notify(`⚠️ ${e.message}`);
          return false;
        }
        throw e;
      }
      if (r.qq) setQq(r.qq);
      if (r.bili) setBili(r.bili);
      if (r.unified) setUnified(r.unified);
      setConfigStamps(r.stamps ?? configStamps);
      setSaved(JSON.stringify({ qq: r.qq ?? normalizedQq, bili: r.bili ?? bili, unified: r.unified ?? normalizedUnified }));
      notify(`✓ 已保存${budgetDirty ? "（token 额度即时生效）" : ""}${r.bridge ? (r.bridge.ok ? "，桥接已重启" : "，桥接重启失败") : ""}${r.warnings?.length ? "（有提示）" : ""}`);
      if (r.warnings?.length) setNote(r.warnings.join(" "));
      await loadOverview();
      return true;
    } catch (e) {
      setErr(`保存失败：${e.message}`);
      return false;
    } finally {
      setBusy("");
    }
  };
  // 弹窗里的「保存」需要知道成败：save() 自己吞掉异常只写页面错误条，
  // 直接给它当 onSave 的话失败时弹窗也会关掉，用户以为存上了。这里失败就抛出去。
  const saveOrThrow = async () => {
    const ok = await save(false);
    if (!ok) throw new Error("保存失败：请看面板顶部的错误提示");
  };

  const reload = async () => { await loadOverview(); await loadConfig(); await loadBudget(); };
  const reset = () => {
    try {
      const base = JSON.parse(saved);
      setQq(base.qq);
      setBili(base.bili);
      setUnified(base.unified);
    } catch { /* 快照缺失时不动 */ }
    if (budgetRef.current?.limits) setLimitDraft(budgetRef.current.limits);
    notify("已撤销未保存的改动");
  };

  const compressMemoryCardNow = async () => {
    setBusy("mc-alert");
    try {
      const r = await api("/memory-card", { method: "POST", body: { action: "compact", targetRatio: 0.8 } });
      notify(`✓ 记忆卡已压缩（降级 ${r.steps ?? 0} 档）`);
      setMemoryAlert(null);
      setTab("memory");
      await loadOverview();
    } catch (e) {
      notify(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };
  const dismissMemoryAlert = async (acknowledge) => {
    const level = Number(memoryAlert?.level) || 0;
    setMemoryAlert(null);
    if (!acknowledge) {
      memorySnoozeRef.current = Date.now() + 2 * 60 * 60 * 1000;
      return;
    }
    try { await api("/memory-card", { method: "POST", body: { action: "ack", level } }); } catch { /* 忽略 */ }
  };

  if (!qq || !bili || !unified) {
    return h("div", { className: "qbw-app" },
      h("div", { className: "qbw-head" }, h("h3", { className: "qbw-title" }, NAV_NAME)),
      h("div", { className: "qbw-body" }, err ? h("div", { className: "qbw-err" }, err) : h("div", { className: "qbw-hint" }, "读取中…")),
      h("div", { className: "qbw-foot" }, h(Btn, { onClick: reload, disabled: !!busy }, "重试")));
  }

  const bridge = overview?.bridge ?? {};
  const biliStatus = overview?.bili ?? {};
  const platformStart = overview?.platformStart ?? {};
  const qqStart = platformStart.qq !== false;
  const biliStart = platformStart.bili !== false;
  // 网关是独立进程（SnowLuma）：桥接在跑 ≠ 消息发得出去，状态点和启动按钮都只认它。
  const gateway = bridge?.snowluma ?? {};
  const gatewayConnected = gateway.connected === true;
  const snow = overview?.snowluma ?? {};

  // 一键开始：识别 SnowLuma → 拉起（要扫码就自动开控制台）→ 等 OneBot → 自动写账号 →
  // 启动桥接 → 启动 B站。步骤结果一次说清，用户不用再逐个点按钮。
  const autoStart = async () => {
    setBusy("auto-start");
    setErr("");
    try {
      const res = await api("/bridge", { method: "POST", body: { action: "auto-start" } });
      const bad = (res.steps ?? []).filter((s) => !s.ok);
      if (bad.length) {
        setErr(`一键开始未完成：${bad.map((s) => `${s.label}（${s.detail}）`).join("；")}`);
        notify(`⚠️ ${bad.map((s) => s.label).join("、")} 需要你确认`);
      } else {
        notify(`✓ 已就绪${res.account?.nickname ? `：${res.account.nickname}（${res.account.uin}）` : ""}`);
      }
      await loadOverview();
    } catch (e) {
      setErr(`一键开始失败：${e.message}`);
      notify(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };
  // 一键打开 SnowLuma 控制台：扫码登录 / 添加账号都在它自己的 WebUI 里做。
  const openConsole = async () => {
    setBusy("open-webui");
    try {
      const res = await api("/bridge", { method: "POST", body: { action: "open-snowluma-webui" } });
      notify(res.ok
        ? `✓ 已打开控制台 ${res.webui?.url ?? ""}`
        : `✗ ${res.error ?? "打不开控制台"}${res.hint ? `（${res.hint}）` : ""}`);
      await loadOverview();
    } catch (e) {
      notify(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };
  const groupOf = NAV_GROUPS.find((g) => g.pages.some(([id]) => id === tab)) ?? NAV_GROUPS[0];

  const shared = {
    overview, reload, busy, setBusy, toast: notify, goTab: setTab, autoStart, openConsole,
    qq: normalizedQq, bili, unified: normalizedUnified,
    rawUnified: unified,
    setQq: setQqPath, setBili: setBiliPath, setUnified: setUnifiedPath, setAdmin,
    save, onSave: saveOrThrow,
    budget, limits: limitDraft, onLimits: setLimitDraft, alertedToday: tokenAlerted, loadBudget,
    // 默认值树（可能为 null）：只影响「显示」，不改保存语义。
    defaults: {
      qq: configDefaults?.qq ?? null,
      bili: configDefaults?.bili ?? null,
      unified: configDefaults?.unified ?? null,
    },
  };

  const renderById = (id) => {
    if (id === "overview") return h(OverviewPage, { ...shared, view: "home" });
    if (id === "install") return h(OverviewPage, { ...shared, view: "install" });
    if (id === "characters") return h(CharactersPage, shared);
    if (id === "pet") return h(PetPage, shared);
    if (id === "model") return h(ModelPage, shared);
    if (id === "qq") return h(QqPage, shared);
    if (id === "bili") return h(BiliPage, shared);
    if (id === "tieba") return h(TiebaPage, shared);
    if (id === "douyin") return h(DouyinPage, shared);
    if (id === "tokens") return h(TokensPage, shared);
    if (id === "voice") return h(VoicePage, shared);
    if (id === "memory") return h(MemoryPage, shared);
    return h("div", { className: "qbw-hint" }, `未知页面：${id}`);
  };

  const renderNav = () => {
    const gi = NAV_GROUPS.indexOf(groupOf);
    return h("div", { className: "qbw-nav" },
      h("div", { className: "qbw-nav-groups" },
        NAV_GROUPS.map((g, i) => h("button", {
          key: g.title,
          type: "button",
          className: i === gi ? "on" : "",
          onClick: () => setTab(g.pages[0][0]),
        }, g.title))),
      groupOf.pages.length > 1
        ? h("div", { className: "qbw-seg" },
          groupOf.pages.map(([id, label]) => h("button", {
            key: id,
            type: "button",
            className: tab === id ? "on" : "",
            onClick: () => setTab(id),
          }, label)))
        : null);
  };

  return h("div", { className: "qbw-app", ref: appRef },
    h("div", { className: "qbw-head" },
      h("h3", { className: "qbw-title" }, NAV_NAME,
        h(Badge, null, `v${overview?.merged?.version || overview?.version || "—"}`)),
      h("span", { className: "qbw-dots" },
        h(StatusDot, {
          ok: qqStart && bridge.running && bridge.ok && gatewayConnected,
          warn: qqStart && Boolean(bridge.running) && !gatewayConnected,
          title: gatewayConnected ? "QQ 桥接运行中，SnowLuma 网关已连接" : "桥接在跑但 SnowLuma 网关没连上，消息发不出去",
        }, !qqStart ? "QQ 关" : (!bridge.running ? "QQ 未运行" : (gatewayConnected ? "QQ" : "QQ 网关断"))),
        h(StatusDot, {
          ok: gatewayConnected,
          warn: Boolean(bridge.running) && !gatewayConnected,
          title: gatewayConnected ? "SnowLuma 网关已连接" : (gateway?.hint || "SnowLuma 网关未连接，点右边「一键开始」自动拉起并打开控制台"),
        }, gatewayConnected ? "SnowLuma" : (!bridge.running ? "SnowLuma 关" : "SnowLuma 断")),
        h(StatusDot, { ok: biliStart && Boolean(biliStatus.available), warn: biliStart && Boolean(biliStatus.enabled) }, biliStart ? "B站" : "B站 关"),
        h(StatusDot, { ok: biliStart && overview?.scheduler?.running }, biliStart ? "生物钟" : "生物钟关"),
        h(Btn, {
          onClick: autoStart,
          disabled: !!busy,
          title: "自动完成：识别 SnowLuma → 拉起（要扫码会打开控制台）→ 识别账号 → 启动桥接 → 启动 B站",
        }, busy === "auto-start" ? "启动中…" : "一键开始"),
        h(Btn, { kind: "qbw-btn3", onClick: openConsole, disabled: !!busy, title: "打开 SnowLuma 控制台（扫码登录 / 加账号）" }, "控制台"))),
    renderNav(),
    h("div", { className: "qbw-body" },
      err ? h("div", { className: "qbw-err", style: { marginBottom: "8px" } }, err) : null,
      note ? h("div", { className: "qbw-warn", style: { marginBottom: "8px" } }, note) : null,
      renderById(tab)),
    h("div", { className: "qbw-foot" },
      h(Btn, { onClick: () => save(false), disabled: !!busy || !dirty }, busy === "save" ? "保存中…" : "保存"),
      h(Btn, { kind: "qbw-btn3", onClick: reset, disabled: !!busy || !dirty }, "撤销"),
      // 「刷新」：保存被 CONFIG_STALE 拒绝时错误里让用户点「刷新」，但面板上原先没有这个按钮，
      // 用户只能靠来回切页碰运气。有未保存改动时先确认，避免静默吞掉编辑。
      h(Btn, {
        kind: "qbw-btn3",
        disabled: !!busy,
        title: "重新读取服务端配置（会丢弃未保存的改动）",
        onClick: () => {
          if (dirty && !confirm("有未保存的改动，刷新会用服务端配置覆盖，继续？")) return;
          reload();
        },
      }, "刷新"),
      h("span", { className: "spacer" }),
      dirty ? h("span", { className: "qbw-dirty" }, "● 未保存") : h("span", { className: "qbw-ok" }, "已保存"),
      toastText ? h("span", { className: "qbw-hint" }, toastText) : null),

    // 记忆卡容量提醒
    memoryAlert ? h("div", { className: "qbw-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) dismissMemoryAlert(false); } },
      h("div", { className: "qbw-modal" },
        h("h3", null, "记忆卡快满了"),
        h("p", null, `记忆卡已经用到 ${memoryAlert.percent ?? 0}%（${memoryAlert.chars ?? 0}/${memoryAlert.maxChars ?? 0} 字）。`),
        h("div", { className: "qbw-meter " + ((memoryAlert.level ?? 0) >= 2 ? "bad" : "warn") },
          h("i", { style: { width: `${Math.min(100, Number(memoryAlert.percent) || 0)}%` } })),
        h("p", null, "压缩只会把最不重要的旧记忆先变模糊；置顶的、和主人相关的重要记忆不会动。"),
        h("div", { className: "qbw-actions" },
          h(Btn, { onClick: compressMemoryCardNow, disabled: !!busy }, busy === "mc-alert" ? "压缩中…" : "立即压缩到 80%"),
          h(Btn, { kind: "qbw-btn2", onClick: () => { setTab("memory"); setMemoryAlert(null); } }, "去记忆页看看"),
          h(Btn, { kind: "qbw-btn2", onClick: () => dismissMemoryAlert(false) }, "2 小时后再提醒"),
          h(Btn, { kind: "qbw-btn2", onClick: () => dismissMemoryAlert(true) }, "本次不再提醒")))) : null,

    // 每日额度 80% 提醒（每天只弹一次）
    tokenAlert ? h("div", { className: "qbw-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) setTokenAlert(null); } },
      h("div", { className: "qbw-modal" },
        h("h3", null, "今日额度已到 80%"),
        h("p", null, `今天已用 ${tokenAlert.percent ?? 0}%；${tokenAlert.message ?? "再往上就会被限流。"}`),
        h("div", { className: "qbw-meter warn" }, h("i", { style: { width: `${Math.min(100, Number(tokenAlert.percent) || 0)}%` } })),
        h("p", null, "这是今天的第一次额度提醒，也是今天唯一一次。到 100% 才会真正停对应平台。"),
        h("div", { className: "qbw-actions" },
          h(Btn, { onClick: () => { setTab("tokens"); setTokenAlert(null); } }, "去调高额度"),
          h(Btn, { kind: "qbw-btn2", onClick: () => setTokenAlert(null) }, "知道了")))) : null);
}

const inject = ["slots"];

function apply(ctx) {
  try { appendWhaleWidget(); } catch (err) {}
  ctx.effect(
    () => ctx.slots.inject("settings.section",
      () => ctx.slots.register({ name: "settings.section", id: "dsh-dfy", order: 7, label: () => NAV_NAME }, SurfCoreSection),
      "dsh-dfy: settings section"),
    "dsh-dfy: settings section");
}

exports.apply = apply;
exports.inject = inject;
exports.SurfCoreSection = SurfCoreSection;
exports.__test = { getPath, setPathInto, withoutPath, pathKeys };


/* ══ pages/10-watch.js ══ */
/* 观看历史：她真正看过 / 点过赞的视频，按当前角色隔离。 */

function WatchPage({ busy, setBusy, toast, goTab }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setBusy("watch-load");
    try { setData(await api("/watch-history?limit=300")); setErr(""); }
    catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }, [setBusy]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const all = Array.isArray(data?.items) ? data.items : [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((x) => `${x.title} ${x.up} ${x.bvid}`.toLowerCase().includes(needle));
  }, [data, q]);

  const stats = data?.stats ?? {};
  const actions = data?.actions ?? {};
  const actionsReady = Boolean(data && data.actions);
  const fmtDur = (sec) => {
    const n = Number(sec) || 0;
    if (!n) return "—";
    return n >= 3600
      ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
      : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  };
  const modeText = (item) => item.mode === "memory" ? "旧记忆" : item.mode === "full" ? (item.frames ? "深看 · 有截图" : "深看") : item.mode === "frames" ? "抽帧" : "浅看";
  const timeText = (item) => {
    if (item.unknownDate) return "日期未知";
    if (item.dateOnly) return `${new Date(item.at).toLocaleDateString("zh-CN")}（旧记忆）`;
    return fmtTime(item.at);
  };
  const badgeOf = (kind) => kind === "gather" ? "warn" : (kind === "ta" || kind === "share" ? "ok" : "");
  const toggleRow = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const actionCell = (item, rowKey) => {
    if (!actionsReady) return h("span", { className: "qbw-hint" }, "—");
    const list = Array.isArray(item.actions) ? item.actions : [];
    if (!list.length) return h("span", { className: "qbw-hint" }, "仅看了");
    const open = expanded.has(rowKey);
    const shown = open ? list : list.slice(0, 3);
    const rest = list.length - shown.length;
    return h("div", { className: "qbw-list", style: { gap: "3px" } },
      shown.map((action, index) => h("div", { key: `${action.kind}|${action.at}|${index}`, style: { display: "flex", gap: "6px", alignItems: "baseline", flexWrap: "wrap" } },
        h(Badge, { kind: badgeOf(action.kind) }, action.label),
        action.text ? h("span", { className: "qbw-hint", style: { maxWidth: "240px" } }, action.text) : null,
        h("span", { className: "qbw-hint" }, fmtTime(action.at).slice(5, 16)),
        action.beforeFirstWatch ? h("span", { className: "qbw-hint" }, "早于本地观看") : null)),
      rest > 0 ? h(Btn, { kind: "qbw-btn2", onClick: () => toggleRow(rowKey) }, `展开 +${rest}`) : null,
      open && list.length > 3 ? h(Btn, { kind: "qbw-btn2", onClick: () => toggleRow(rowKey) }, "收起") : null);
  };

  return h("div", null,
    h("div", { className: "qbw-hint", style: { marginBottom: "8px" } },
      "她真正看过 / 点过赞的视频，按当前角色隔离。debrief 与 watch-video 自动记账。"),

    h("div", { className: "qbw-stats" },
      h("div", { className: "qbw-stat" }, h("div", null, "今天"), h("div", null, stats.today ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
      h("div", { className: "qbw-stat" }, h("div", null, "最近 7 天"), h("div", null, stats.last7d ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
      h("div", { className: "qbw-stat" }, h("div", null, "深看 / 抽帧"), h("div", null, stats.deep ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
      h("div", { className: "qbw-stat" }, h("div", null, "不同视频"), h("div", null, stats.uniqueVideos ?? 0, h("span", { className: "qbw-unit" }, " 条")))),

    h("div", { className: "qbw-search", style: { marginTop: "10px" } },
      h("input", { className: "qbw-input", placeholder: "搜标题 / UP / BV", value: q, onChange: (e) => setQ(e.target.value) }),
      h(Btn, { kind: "qbw-btn2", onClick: load, disabled: !!busy }, busy === "watch-load" ? "刷新中…" : "刷新")),

    actionsReady
      ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
        `操作：评论 ${actions.comments ?? 0}（主评论 ${actions.main ?? 0} · 聚拢 ${actions.gather ?? 0} · 回复 ${actions.reply ?? 0} · 搭话 ${actions.ta ?? 0} · 分享 ${actions.share ?? 0}）· 收藏 ${actions.favorite ?? 0} · 动态 ${actions.dynamic ?? 0} · 仅看 ${actions.watchedOnly ?? 0}`)
      : null,
    data && !actionsReady
      ? h("div", { className: "qbw-warnbox", style: { marginTop: "8px" } }, "操作列需要新版宿主：重启 DSH 或重载插件后再刷新。")
      : null,
    err ? h("div", { className: "qbw-err", style: { margin: "8px 0" } }, `✗ ${err}`) : null,
    !data && !err ? h("div", { className: "qbw-hint", style: { padding: "20px 0" } }, "读取观看历史…") : null,

    data && items.length === 0
      ? h(Card, null, h("div", { className: "qbw-hint" }, q ? "没有匹配的记录。" : "还没有观看记录。下一次 debrief / watch-video 会自动记一笔。"))
      : null,

    items.length
      ? h("div", { style: { marginTop: "4px" } },
        items.map((item, i) => {
          const rowKey = `${item.bvid}|${item.at}|${i}`;
          const title = item.bvid
            ? h("a", { className: "qbw-vtitle", href: `https://www.bilibili.com/video/${item.bvid}`, target: "_blank", rel: "noreferrer" }, item.title || item.bvid)
            : h("span", { className: "qbw-vtitle" }, item.title || "（无标题）");
          return h("div", { className: "qbw-sitem", key: rowKey },
            h("div", { className: "qbw-srow" },
              h("div", { className: "qbw-srow-main" }, title),
              h("div", { className: "qbw-srow-acts" },
                h(Badge, { kind: item.mode === "full" || item.mode === "frames" ? "ok" : "" }, modeText(item)),
                item.score == null ? null : h(Badge, null, `${item.score}/20`))),
            h("div", { className: "qbw-srow-meta" },
              h("span", null, timeText(item)),
              h("span", null, item.up || "—"),
              h("span", null, fmtDur(item.duration)),
              item.bvid ? h("span", null, item.bvid) : null),
            h("div", { style: { paddingTop: "3px" } }, actionCell(item, rowKey)));
        }))
      : null,

    data
      ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
        `共 ${data.total ?? items.length} 条${q ? `（过滤后 ${items.length} 条）` : ""} · 数据文件 ${data.file || "—"}`)
      : null);
}


/* ══ pages/100-characters.js ══ */
/* 角色与记忆卡：角色包（新建/加载/删除/存档）+ 人格四层编辑。 */

function CharactersPage({ overview, busy, setBusy, toast, reload, goTab }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", personaText: "", memoryText: "", fullText: "" });

  const load = useCallback(async () => {
    try { setData(await api("/characters")); setErr(""); }
    catch (e) { setErr(`读取角色失败：${e.message}`); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, extra = {}, okText = "✓ 已完成") => {
    setBusy(`character-${action}`);
    try {
      const r = await api("/characters", { method: "POST", body: { action, ...extra } });
      if (r.ok === false) throw new Error(r.error ?? "失败");
      toast(okText);
      await load();
      if (action === "load" || action === "restore" || action === "create") await reload?.();
      return r;
    } catch (e) { toast(`✗ ${e.message}`); return null; }
    finally { setBusy(""); }
  };

  const create = async (loadIt) => {
    if (!form.name.trim()) { toast("✗ 先填角色名"); return; }
    let memoryCard;
    if (form.memoryText.trim()) {
      try { memoryCard = JSON.parse(form.memoryText); }
      catch { toast("✗ 记忆卡不是合法 JSON"); return; }
    }
    const r = await act("create", {
      name: form.name.trim(),
      personaText: form.personaText,
      memoryCard,
      fullRecords: form.fullText,
      load: loadIt,
    }, loadIt ? "✓ 角色已创建并加载" : "✓ 角色已创建");
    if (r) { setForm({ name: "", personaText: "", memoryText: "", fullText: "" }); setShowCreate(false); }
  };

  const current = data?.current ?? null;
  const characters = data?.characters ?? [];
  const snapshots = data?.snapshots ?? [];
  const percent = Number(overview?.memoryCard?.percent ?? 0);
  const fileTo = (key, accept) => h("input", {
    type: "file", accept,
    onChange: async (e) => {
      const input = e.target;
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      setForm((f) => ({ ...f, [key]: text }));
      // 清空选择：同一个文件第二次选时不会触发 change（恢复默认/重选同一份文件的场景）。
      input.value = "";
    },
  });

  return h("div", null,
    h(Card, {
      title: "角色人格",
      right: current ? h(Badge, { kind: "ok" }, current.name) : h(Badge, { kind: "warn" }, "还没有角色"),
    },
      h("p", null, "一个角色 = 人格卡 + 衰减记忆卡 + 全量卡 + B站账本；加载别的角色会先存档。"),
      h(KV, { label: "当前角色" }, current ? `${current.name}（epoch ${current.epoch}）` : "（未加载）"),
      h(KV, { label: "记忆卡" }, `${percent}% · ${snapshots.length} 个存档`),
      h("div", { className: "qbw-actions" },
        current ? h(Btn, { kind: "qbw-btn2", onClick: () => act("snapshot", { id: current.id, label: "手动" }, "✓ 已存一份"), disabled: !!busy }, "立即存档") : null,
        current ? h(Btn, { kind: "qbw-btn2", onClick: () => act("auto-snapshot", { id: current.id }, "✓ 自动存档已更新"), disabled: !!busy }, "更新自动存档") : null,
        current ? h(Btn, { kind: "qbw-btn2", onClick: () => goTab?.("memory") }, "管理记忆卡") : null,
        h(Btn, { onClick: () => setShowCreate((v) => !v), disabled: !!busy }, showCreate ? "收起新建" : "新建角色"))),

    err ? h("div", { className: "qbw-err" }, err) : null,

    h(PersonaEditor, { busy, setBusy, toast }),

    showCreate ? h(Card, { title: "新建角色", note: "可以只填名字；也可以把预设的人格卡 / 记忆卡一起导入" },
      h(Row, { label: "角色名" },
        h("input", { className: "qbw-input", value: form.name, placeholder: "例如 小咪", onChange: (e) => setForm((f) => ({ ...f, name: e.target.value })) })),
      h("div", { className: "qbw-group" }, "人格卡（Markdown）"),
      fileTo("personaText", ".md,.txt,text/markdown,text/plain"),
      h("textarea", { className: "qbw-textarea", value: form.personaText, placeholder: "# 角色卡：名字\n\n你是谁、说话方式…", onChange: (e) => setForm((f) => ({ ...f, personaText: e.target.value })) }),
      h("div", { className: "qbw-group" }, "记忆卡 JSON（可选）"),
      fileTo("memoryText", ".json,application/json"),
      h("textarea", { className: "qbw-textarea", value: form.memoryText, placeholder: "{\"version\":1,\"records\":[]}", onChange: (e) => setForm((f) => ({ ...f, memoryText: e.target.value })) }),
      h("div", { className: "qbw-group" }, "全量记忆 JSONL（可选，只存档）"),
      fileTo("fullText", ".jsonl,.json,text/plain"),
      h("textarea", { className: "qbw-textarea", value: form.fullText, placeholder: "{\"id\":\"...\"}", onChange: (e) => setForm((f) => ({ ...f, fullText: e.target.value })) }),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => create(true), disabled: !!busy }, "创建并加载"),
        h(Btn, { kind: "qbw-btn2", onClick: () => create(false), disabled: !!busy }, "只创建"))) : null,

    h(Section, { title: `全部角色（${characters.length}）`, note: "加载别的角色会自动保存当前角色", defaultOpen: true },
      characters.length
        ? characters.map((item) => h("div", { key: item.id, className: "qbw-item" },
          h("div", null,
            h("div", { className: "qbw-label" }, item.name,
              item.current ? h(Badge, { kind: "ok" }, "当前") : null,
              h(Badge, null, `${item.snapshots ?? 0} 档`)),
            h("div", { className: "qbw-hint" }, `人格 ${item.personaChars ?? 0} 字 · 全量记忆 ${fmtBytes(item.fullMemoryBytes)} · 更新 ${fmtTime(item.updatedAt)}`)),
          h("div", { style: { display: "flex", gap: "6px", flex: "0 0 auto" } },
            item.current ? null : h(Btn, { onClick: () => act("load", { id: item.id }, `✓ 已加载「${item.name}」`), disabled: !!busy }, "加载"),
            item.current ? null : h(Btn, {
              kind: "qbw-btn2", disabled: !!busy,
              onClick: async () => {
                if (!confirm(`删除角色「${item.name}」？整个目录会移进 backups/deleted-character-*，可手动恢复。`)) return;
                await act("delete", { id: item.id }, "✓ 已归档删除");
              },
            }, "删除"))))
        : h("div", { className: "qbw-hint" }, "还没有角色；点上方「新建角色」。")),

    h(LearningCard, { busy, setBusy, toast }),

    h(AdvancedSettings, { note: "存档 / 回档：低频操作，展开再用" },
      h(Section, { title: `存档（${snapshots.length}）`, note: "自动存档 12 槽 · 手动/切换前不覆盖", collapsible: false },
        snapshots.length
          ? snapshots.map((item) => h("div", { key: item.slot, className: "qbw-item" },
            h("div", null,
              h("div", { className: "qbw-label" }, item.slot,
                item.slot === "before-switch" ? h(Badge, { kind: "warn" }, "切换前") : null),
              h("div", { className: "qbw-hint" }, `${fmtTime(item.createdAt)} · ${item.reason || ""} · 记忆 ${fmtBytes(item.memoryBytes)}`)),
            current ? h(Btn, {
              kind: "qbw-btn2", disabled: !!busy,
              onClick: async () => {
                if (!confirm(`把「${current.name}」回档到 ${item.slot}？会先给当前状态再存一份。`)) return;
                await act("restore", { id: current.id, slot: item.slot }, "✓ 已回档");
              },
            }, "回档") : null))
          : h("div", { className: "qbw-hint" }, "还没有存档；切换角色或点「立即存档」。"))));
}

/* 自我学习：贴吧 / B站 / 抖音 的观看记录 → 经历 + 近况（后端 learning-loop）。 */
function LearningCard({ busy, setBusy, toast }) {
  const [st, setSt] = useState(null);
  const load = useCallback(async () => {
    try { setSt(await api("/learning/status")); } catch (e) { /* 后端还没升级 */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (action, okText, body = {}) => {
    setBusy(`learning-${action}`);
    try {
      const r = await api(`/learning/${action}`, { method: "POST", body });
      if (r.ok === false) throw new Error(r.error ?? r.reason ?? "失败");
      toast(okText);
      await load();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const enabled = st?.enabled !== false;
  return h(Card, {
    title: "自我学习",
    right: st?.running ? h(Badge, { kind: "warn" }, "学习中") : null,
    note: "她刷过的贴吧 / B站 / 抖音会定期变成「经历 + 近况」，注入 QQ、桌宠、抖音的对话；核心人格卡不会被改。",
  },
    h(Row, { label: "自动学习", hint: "关掉后只能手动「立即学习」" },
      h("label", { className: "qbw-check" },
        h("input", {
          type: "checkbox", className: "qbw-switch", checked: enabled,
          onChange: (e) => act("config", e.target.checked ? "✓ 已开启自动学习" : "✓ 已暂停自动学习", { enabled: e.target.checked }),
        }),
        h("span", null, enabled ? "已开启" : "已关闭"))),
    h(KV, { label: "上次学习" }, st?.lastRunAt ? fmtTime(st.lastRunAt) : "还没学过"),
    h(KV, { label: "已沉淀" }, st ? `${st.stats?.items ?? 0} 条经历 · ${st.stats?.runs ?? 0} 次` : "—"),
    st?.interests?.length ? h(KV, { label: "最近兴趣" }, st.interests.join("、")) : null,
    st?.brief ? h("div", { className: "qbw-hint", style: { marginTop: "6px", whiteSpace: "pre-wrap" } }, st.brief) : null,
    st?.persona ? h("div", { className: "qbw-hint", style: { marginTop: "6px", whiteSpace: "pre-wrap" } }, `自动近况：${st.persona}`) : null,
    st?.lastError ? h("div", { className: "qbw-err", style: { marginTop: "6px" } }, st.lastError) : null,
    h("div", { className: "qbw-actions" },
      h(Btn, { onClick: () => act("run", "✓ 学习完成", { force: true }), disabled: !!busy }, busy === "learning-run" ? "学习中…" : "立即学习"),
      h(Btn, { kind: "qbw-btn2", onClick: () => act("rollback", "✓ 已回滚自动近况"), disabled: !!busy }, "回滚人设"),
      h(Btn, { kind: "qbw-btn3", onClick: load }, "刷新")),
    h("div", { className: "qbw-hint", style: { marginTop: "6px" } }, "学习内容只来自三平台「看过的记录」；不读聊天、不编造没看到的细节。"));
}

/* 人格四层：core / tone / daily / scene，各自一个文件。 */
function PersonaEditor({ busy, setBusy, toast }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ core: "", tone: "", daily: "", scenes: {} });
  const [scene, setScene] = useState("default");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api("/persona");
      const layers = r.layers ?? {};
      setData(r);
      setDraft({
        core: layers.core?.text ?? r.text ?? "",
        tone: layers.tone?.text ?? "",
        daily: layers.daily?.text ?? "",
        scenes: layers.scenes ?? {},
      });
      setErr("");
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const scenes = Object.keys(data?.layers?.scenes ?? {});
  const setLayer = (key, value) => setDraft((prev) => key === "scene"
    ? { ...prev, scenes: { ...prev.scenes, [scene]: { ...(prev.scenes?.[scene] ?? {}), text: value } } }
    : { ...prev, [key]: value });

  const saveAll = async () => {
    setBusy("persona-save");
    const jobs = [["core", "core", draft.core]];
    if (String(draft.tone || "").trim() || String(data?.layers?.tone?.text || "").trim()) jobs.push(["tone", "tone", draft.tone]);
    if (String(draft.daily || "").trim() || String(data?.layers?.daily?.text || "").trim()) jobs.push(["daily", "daily", draft.daily]);
    const sceneText = draft.scenes?.[scene]?.text ?? "";
    if (String(sceneText).trim() || String(data?.layers?.scenes?.[scene]?.text || "").trim()) jobs.push(["scene", "scene", sceneText]);
    const failures = [];
    for (const [layer, label, text] of jobs) {
      try { await api("/persona", { method: "POST", body: { layer, scene: layer === "scene" ? scene : "", text } }); }
      catch (e) { failures.push(`${label}：${e.message}`); }
    }
    if (failures.length) {
      // 有层失败时不要重新拉取：load() 会用服务端内容覆盖草稿，
      // 用户刚在 textarea 里改的那几层（含已保存成功的）会被瞬间重置成旧内容。
      toast(`✗ 保存失败：${failures.join("；")}`);
      setBusy("");
      return;
    }
    toast("✓ 人格层已保存");
    setBusy("");
    await load();
  };

  return h(Card, { title: "人格卡", right: err ? h(Badge, { kind: "bad" }, "读取失败") : null, note: "core 是核心设定；tone / daily / scene 是可选层" },
    err ? h("div", { className: "qbw-err" }, err) : null,
    h("div", { className: "qbw-group" }, "核心人格（core）"),
    h("textarea", { className: "qbw-textarea", value: draft.core, onChange: (e) => setLayer("core", e.target.value), placeholder: "你是谁、从哪来、在意什么…" }),
    h(Section, { title: "语气 / 日常 / 场景", note: "可选；留空就不写这一层", defaultOpen: false },
      h("div", { className: "qbw-group" }, "语气（tone）"),
      h("textarea", { className: "qbw-textarea", value: draft.tone, onChange: (e) => setLayer("tone", e.target.value) }),
      h("div", { className: "qbw-group" }, "日常（daily）"),
      h("textarea", { className: "qbw-textarea", value: draft.daily, onChange: (e) => setLayer("daily", e.target.value) }),
      scenes.length || (draft.scenes && Object.keys(draft.scenes).length)
        ? h("div", null,
          h("div", { className: "qbw-group" }, "场景（scene）"),
          h("select", { className: "qbw-select", value: scene, onChange: (e) => setScene(e.target.value) },
            [...new Set([...scenes, ...Object.keys(draft.scenes ?? {})])].map((k) => h("option", { key: k, value: k }, k))),
          h("textarea", { className: "qbw-textarea", value: draft.scenes?.[scene]?.text ?? "", onChange: (e) => setLayer("scene", e.target.value) }))
        : null),
    h("div", { className: "qbw-actions" }, h(Btn, { onClick: saveAll, disabled: !!busy }, "保存人格卡")));
}


/* ══ pages/110-memory.js ══ */
/* 记忆同步：记忆卡容量 + QQ ⇄ B站 双向脱敏同步。 */

function MemoryPage({ qq, unified, rawUnified, setUnified, overview, busy, setBusy, toast, reload, goTab }) {
  const [data, setData] = useState(null);
  const [card, setCard] = useState(null);
  const [err, setErr] = useState("");
  const [docOpen, setDocOpen] = useState(false);

  // toast 每次渲染都是新函数：用 ref 固定，避免 load/loadCard 的依赖把它带进 useEffect 反复触发。
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    try { setData(await api("/memory")); setErr(""); }
    catch (e) { setErr(e.message); }
  }, []);
  const loadCard = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("card-refresh");
    try {
      setCard(await api("/memory-card"));
      if (manual) toastRef.current?.("✓ 记忆卡已刷新");
    } catch (e) {
      if (manual) toastRef.current?.(`✗ 刷新失败：${e.message}`);
    } finally {
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { load(); loadCard(); }, [load, loadCard]);

  const biliToQq = qq?.biliBridge?.memory?.enabled !== false && qq?.biliBridge?.enabled !== false;
  const toggle = typeof rawUnified?.__biliToQqToggle === "boolean" ? rawUnified.__biliToQqToggle : biliToQq;
  const qqToBili = unified?.memory?.qqToBili ?? {};
  const setQqToBili = (key, value) => setUnified(["memory", "qqToBili", key], value);
  const status = data?.status ?? overview?.memory ?? {};

  const run = async (key, fn, okText) => {
    setBusy(key);
    try {
      const r = await fn();
      toast(r?.ok === false ? `✗ ${r.error ?? "失败"}` : okText(r));
      await load();
      await loadCard();
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  // 一键整理要调模型，可能跑几十秒：按钮状态之外再给一行常驻进度/结果，
  // 免得用户以为点了没反应（2026-11 反馈）。
  const [organizeMsg, setOrganizeMsg] = useState("");
  const diaryYesterday = async () => {
    if (!confirm("把昨天的记录写成一篇日记，并把那天的原始流水归档？")) return;
    setBusy("diary");
    setOrganizeMsg("正在写昨日日记…（模型处理中，通常 30~60 秒）");
    try {
      const r = await api("/memory-card", { method: "POST", body: { action: "diary" } });
      if (r?.ok === false) throw new Error(r.error ?? "写日记失败");
      const d = r.diary ?? {};
      const text = `✓ 日记已写入（${d.date ?? "昨天"}）：归档 ${d.removed ?? 0} 条原始记录`;
      setOrganizeMsg(text);
      toast(text);
      await load();
      await loadCard();
      await reload();
    } catch (e) {
      setOrganizeMsg(`✗ ${e.message}`);
      toast(`✗ ${e.message}`);
    } finally { setBusy(""); }
  };
  const organizeAll = async () => {
    if (!confirm("一键整理会用一次模型调用：合并重复、删掉纯寒暄，置顶和初次相遇不动。继续？")) return;
    const before = card?.status?.counts?.total ?? card?.counts?.total ?? "";
    setBusy("organize");
    setOrganizeMsg(`正在整理${before ? ` ${before} 条` : ""}记忆…（模型处理中，通常 1 分钟内，最长 2 分钟，请勿重复点）`);
    try {
      const r = await api("/memory-card", { method: "POST", body: { action: "organize" } });
      if (r?.ok === false) throw new Error(r.error ?? "整理失败");
      const info = r.organized ?? {};
      const text = `✓ 已整理：合并 ${info.merged ?? 0} 组 · 删除 ${info.dropped ?? 0} 条（输入 ${info.before ?? "?"} 条）${info.note ? ` · ${info.note}` : ""}`;
      setOrganizeMsg(text);
      toast(text);
      await load();
      await loadCard();
      await reload();
    } catch (e) {
      setOrganizeMsg(`✗ ${e.message}`);
      toast(`✗ ${e.message}`);
    } finally { setBusy(""); }
  };

  const st = card?.status ?? card ?? {};
  const percent = Number(st.percent ?? overview?.memoryCard?.percent ?? 0);

  return h("div", null,
    h(Card, {
      title: "记忆卡",
      right: h("div", { style: { display: "inline-flex", gap: "6px", alignItems: "center" } },
        h(Badge, { kind: percent >= 80 ? "warn" : "ok" }, `${percent}%`),
        h(Btn, { kind: "qbw-btn3", onClick: () => loadCard({ manual: true }), disabled: !!busy }, busy === "card-refresh" ? "刷新中…" : "刷新")),
    },
      h("div", { className: "qbw-meter " + (percent >= 90 ? "bad" : percent >= 80 ? "warn" : "") },
        h("i", { style: { width: `${Math.min(100, percent)}%` } })),
      h(KV, { label: "占用" }, st.unlimited
        ? `${st.chars ?? 0} 字 · 不设上限`
        : `${st.chars ?? 0} / ${st.maxChars ?? 0} 字`),
      h(KV, { label: "记录" }, `${st.counts?.total ?? st.records ?? 0} 条`),
      h(KV, { label: "已确认水位" }, st.acknowledgedLevel ?? 0),
      card?.enabled === false ? h("div", { className: "qbw-warnbox" }, "记忆卡写入被关闭：她不会记新东西。") : null,
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => setDocOpen(true), disabled: !!busy }, "查看 / 编辑记忆"),
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: organizeAll,
        }, busy === "organize" ? "整理中…（调模型中）" : "一键整理"),
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: diaryYesterday,
        }, busy === "diary" ? "写日记中…" : "写昨日日记"),
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: () => run("compact", () => api("/memory-card", { method: "POST", body: { action: "compact", targetRatio: 0.8 } }), (r) => `✓ 已压缩（降级 ${r.steps ?? 0} 档）`),
        }, "压缩到 80%"),
        h(Btn, { kind: "qbw-btn3", onClick: () => goTab?.("characters") }, "角色与存档")),
      organizeMsg ? h("div", {
        className: organizeMsg.startsWith("✗") ? "qbw-err" : "qbw-hint",
        style: { marginTop: "6px", fontWeight: 600 },
      }, organizeMsg) : null,
      h(Row, { label: "每天自动整理", hint: "默认关闭；开启后 20 小时冷却、记录少于 40 条不跑" },
        h("input", {
          type: "checkbox",
          className: "qbw-switch",
          checked: card?.organize?.enabled === true,
          onChange: (e) => run("organize-config", () => api("/memory-card", { method: "POST", body: { action: "organize-config", enabled: e.target.checked } }),
            () => e.target.checked ? "✓ 已开启每天自动整理" : "✓ 已关闭自动整理"),
        })),
      h(Row, { label: "每天自动写日记", hint: "默认关闭；昨天有 2 条以上记录时自动写成一篇日记并归档原始流水" },
        h("input", {
          type: "checkbox",
          className: "qbw-switch",
          checked: card?.organize?.diary === true,
          onChange: (e) => run("organize-diary-config", () => api("/memory-card", { method: "POST", body: { action: "organize-config", diary: e.target.checked } }),
            () => e.target.checked ? "✓ 已开启每天写日记" : "✓ 已关闭每天写日记"),
        })),
      card?.organize?.lastRunAt
        ? h(KV, { label: "上次整理" }, `${fmtTime(card.organize.lastRunAt)} · 合并 ${card.organize.lastMerged ?? 0} 组 · 删除 ${card.organize.lastDropped ?? 0} 条`)
        : h(KV, { label: "上次整理" }, "还没整理过")),

    h(Card, { title: "双向脱敏同步（QQ ⇄ B站）", note: "只搬公开、脱敏后的近况，和上面的记忆卡是两回事" },
      h("div", { className: "qbw-hint" }, "隐私红线固定开启：私聊永不跨平台；密码、令牌、手机号、住址一律剔除。"),

      h(Section, { title: "B站 → QQ", note: "默认开启，只读公开评分/评论/收藏/动态", defaultOpen: true },
        h(Row, { label: "同步 B站记忆到 QQ", hint: "关掉 = QQ 侧的她不提 B站经历" },
          h("input", { className: "qbw-switch", type: "checkbox", checked: toggle, onChange: (e) => setUnified(["__biliToQqToggle"], e.target.checked) })),
        h(KV, { label: "状态" }, toggle ? "开" : "关"),
        h(KV, { label: "简报" }, `${status.biliToQq?.briefChars ?? 0} 字 · ${fmtTime(status.biliToQq?.generatedAt)}`),
        h(KV, { label: "隐私复检" }, status.biliToQq?.blocked ? "命中拦截" : "通过"),
        h("div", { className: "qbw-hint" }, "保存后到 QQ 页点「保存并重启桥接」生效。"),
        h("div", { className: "qbw-actions" },
          h(Btn, {
            kind: "qbw-btn2", disabled: !!busy,
            onClick: () => run("refresh-bili", () => api("/memory", { method: "POST", body: { action: "refresh-bili" } }), () => "✓ 已刷新"),
          }, "立即刷新"))),

      h(Section, { title: "QQ → B站", note: "只搬群聊公开近况，不搬私聊", defaultOpen: false },
        h(Row, { label: "同步 QQ 近况到 B站" },
          h("input", { className: "qbw-switch", type: "checkbox", checked: qqToBili.enabled === true, onChange: (e) => setQqToBili("enabled", e.target.checked) })),
        h(Row, { label: "回看多久（小时）" },
          h("input", {
            className: "qbw-input", type: "number", min: 1, max: 336,
            value: qqToBili.windowHours ?? 72,
            onChange: (e) => setQqToBili("windowHours", Number(e.target.value) || 72),
          })),
        h(KV, { label: "状态" }, `${status.qqToBili?.enabled ? "开" : "关"} · ${status.qqToBili?.briefChars ?? 0} 字`),
        h(KV, { label: "隐私复检" }, status.qqToBili?.blocked ? "命中拦截" : "通过")),

      h("div", { className: "qbw-actions" },
        h(Btn, {
          onClick: () => run("sync", () => api("/memory", { method: "POST", body: { action: "sync" } }),
            (r) => `✓ 已同步（${r.stats?.kept ?? 0} 条，脱敏 ${r.stats?.redactions ?? 0} 处）`),
          disabled: !!busy,
        }, busy === "sync" ? "同步中…" : "立即同步"),
        h(Btn, {
          kind: "qbw-btn2 danger", disabled: !!busy,
          onClick: async () => {
            if (!confirm("清空 QQ→B站 记忆和原始公开 feed？对齐表与 B站→QQ 简报不受影响。")) return;
            await run("purge", () => api("/memory", { method: "POST", body: { action: "purge" } }), () => "✓ 已清空 QQ→B站 记忆");
          },
        }, "清空 QQ→B站"))),

    h(Section, { title: "身份对齐（QQ ⇄ B站）", note: "同一个人在两边是谁；称呼优先于群名片 / B站昵称", defaultOpen: false },
      h(AlignPage, { busy, setBusy, toast, reload })),

    docOpen ? h(MemoryDocModal, {
      onClose: () => setDocOpen(false),
      toast,
      // 只刷新记忆卡与本页数据；不要走整个 reload，避免把别处未保存的配置改动刷掉。
      onChanged: async () => { await loadCard(); await load(); },
    }) : null,

    err ? h("div", { className: "qbw-err" }, err) : null);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 记忆文档：打开看全文 / 逐条改记录 / 全量档案搜索 / 备份恢复。
 * 文档（memory-card.md）是记录渲染出来的，所以编辑入口在「记忆记录」页签，
 * 改完保存会重写 md / 两份 prompt，不需要让用户手改生成文件。
 * ───────────────────────────────────────────────────────────────────────── */
const MEM_PLATFORM_LABEL = { qq: "QQ", bili: "B站", shared: "共享", pet: "桌宠" };
const MEM_CLARITY_LABEL = { vivid: "鲜明", clear: "清楚", fuzzy: "模糊", trace: "仅印象" };
const MEM_DOC_TABS = [
  ["records", "记忆记录（可编辑）"], ["doc", "全文预览"], ["prompt", "提示词"], ["full", "全量档案"], ["backups", "备份"],
];

function MemoryDocModal({ onClose, toast, onChanged }) {
  const [snap, setSnap] = useState(null);
  // 默认直接进可编辑的记录列表：先看到「能改什么」，而不是一份只读预览。
  const [tab, setTab] = useState("records");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [recordQuery, setRecordQuery] = useState("");
  const [draft, setDraft] = useState(null);
  const [addForm, setAddForm] = useState({ title: "", text: "", importance: 60, tags: "" });
  const [full, setFull] = useState(null);
  const [fullQuery, setFullQuery] = useState("");
  // 手动整理：勾选若干条 → 交给模型合并/去噪（置顶和初次相遇不可选）。
  const [selected, setSelected] = useState(function () { return new Set(); });

  const loadSnap = useCallback(async () => {
    setBusy("reload");
    // 文档页要能逐条编辑，列表默认 80 条不够：这里多拿一些（后端上限 500）。
    try { setSnap(await api("/memory-card?limit=300")); setErr(""); }
    catch (e) { setErr(`读取记忆卡失败：${e.message}`); }
    finally { setBusy(""); }
  }, []);
  useEffect(() => { loadSnap(); }, [loadSnap]);

  const loadFull = useCallback(async (query) => {
    setBusy("full");
    try {
      setFull(await api(`/memory-card/full?q=${encodeURIComponent(String(query ?? ""))}&limit=40`));
      setErr("");
    } catch (e) { setErr(`读取全量档案失败：${e.message}`); }
    finally { setBusy(""); }
  }, []);

  const openTab = (key) => {
    setTab(key);
    setDraft(null);
    setNotice("");
    if (key === "full" && !full) void loadFull(fullQuery);
  };

  const mutate = async (body, okText) => {
    setBusy("act");
    setNotice("");
    try {
      const r = await api("/memory-card", { method: "POST", body });
      if (r?.ok === false) throw new Error(r.error ?? "失败");
      setSnap(r);
      // POST 返回的是默认 80 条快照；再按文档上限拉一次，避免刚改的第 200 条从列表里消失。
      try { setSnap(await api("/memory-card?limit=300")); } catch { /* 失败就先用 80 条快照 */ }
      setFull(null);
      setNotice(okText);
      toast(okText);
      await onChanged?.();
      return r;
    } catch (e) {
      // 弹窗里也留一条可见反馈：只靠外壳 toast 的话，保存失败容易被当成「按钮没反应」。
      setNotice(`✗ ${e.message}`);
      toast(`✗ ${e.message}`);
      return null;
    } finally { setBusy(""); }
  };

  const startEdit = (record) => setDraft({
    id: record.id,
    title: record.title || "",
    text: record.text || "",
    importance: Number(record.importance) || 60,
    tags: Array.isArray(record.tags) ? record.tags.join(", ") : "",
    pinned: record.pinned === true,
  });

  const saveDraft = async () => {
    if (!draft) return;
    if (!String(draft.text ?? "").trim()) { toast("✗ 内容不能为空"); setNotice("✗ 内容不能为空"); return; }
    const r = await mutate({
      action: "update",
      id: draft.id,
      patch: {
        title: draft.title,
        text: draft.text,
        importance: Number(draft.importance) || 60,
        tags: String(draft.tags ?? "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        pinned: draft.pinned === true,
      },
    }, "✓ 记忆已保存");
    if (r) setDraft(null);
  };

  const addMemory = async () => {
    if (!String(addForm.text ?? "").trim()) { toast("✗ 先写内容"); setNotice("✗ 先写内容"); return; }
    const r = await mutate({
      action: "add",
      title: addForm.title,
      text: addForm.text,
      importance: Number(addForm.importance) || 60,
      scope: "qq",
      tags: String(addForm.tags ?? "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    }, "✓ 已新增一条记忆");
    if (r) setAddForm({ title: "", text: "", importance: 60, tags: "" });
  };

  const restoreBackup = async (name) => {
    if (!confirm(`恢复到备份「${name}」？当前记忆卡会先自动备份一份。`)) return;
    await mutate({ action: "restore", name }, "✓ 已恢复备份");
  };

  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const forgetSelected = async () => {
    const ids = [...selected].filter((id) => (snap?.records ?? []).some((record) => record.id === id));
    if (!ids.length) { toast("✗ 先勾选要忘记的记录"); return; }
    if (!confirm(`忘记选中的 ${ids.length} 条记忆？置顶记录会被跳过；原始内容仍保留在全量档案。`)) return;
    const r = await mutate({ action: "forget-batch", ids }, "✓ 已忘记选中的记忆");
    if (r) setSelected(new Set());
  };

  const organizeSelected = async () => {
    const ids = [...selected].filter((id) => (snap?.records ?? []).some((record) => record.id === id));
    if (ids.length < 2) { toast("✗ 至少选 2 条再整理"); return; }
    if (!confirm(`整理选中的 ${ids.length} 条记忆？会用一次模型调用合并重复内容、删除纯闲聊；置顶和初次相遇不会被选中。`)) return;
    const r = await mutate({ action: "organize", ids }, "✓ 选中记忆已整理");
    if (r) setSelected(new Set());
  };

  const records = (snap?.records ?? []).filter((record) => {
    const needle = recordQuery.trim().toLowerCase();
    if (!needle) return true;
    return `${record.title} ${record.text} ${(record.tags ?? []).join(" ")}`.toLowerCase().includes(needle);
  });

  const renderRecord = (record) => {
    if (draft && draft.id === record.id) {
      return h("div", { key: record.id, className: "qbw-rec" },
        h("div", { style: { flex: "1 1 100%" } },
          h(Row, { label: "标题" },
            h("input", {
              className: "qbw-input", value: draft.title, placeholder: "一句话概括",
              onChange: (e) => setDraft((d) => ({ ...d, title: e.target.value })),
            })),
          h("div", { className: "qbw-group" }, "内容"),
          h("textarea", {
            className: "qbw-textarea", value: draft.text, style: { minHeight: "110px" },
            onChange: (e) => setDraft((d) => ({ ...d, text: e.target.value })),
          }),
          h(Row, { label: "重要度", hint: "1-100，影响压缩时的去留" },
            h("input", {
              className: "qbw-input", type: "number", min: 1, max: 100, value: draft.importance,
              onChange: (e) => setDraft((d) => ({ ...d, importance: e.target.value })),
            })),
          h(Row, { label: "标签", hint: "逗号分隔；owner / first / initial 等系统标签会影响分类，别随意删" },
            h("input", {
              className: "qbw-input", value: draft.tags,
              onChange: (e) => setDraft((d) => ({ ...d, tags: e.target.value })),
            })),
          h(Row, { label: "置顶", hint: "置顶的记忆不会被自动压缩 / 忘记" },
            h("input", {
              className: "qbw-switch", type: "checkbox", checked: draft.pinned,
              onChange: (e) => setDraft((d) => ({ ...d, pinned: e.target.checked })),
            })),
          h("div", { className: "qbw-actions" },
            h(Btn, { onClick: saveDraft, disabled: !!busy }, busy === "act" ? "保存中…" : "保存这条记忆"),
            h(Btn, { kind: "qbw-btn2", onClick: () => setDraft(null), disabled: !!busy }, "取消"))));
    }
    return h("div", {
      key: record.id, className: "qbw-rec qbw-rec-edit", role: "button", tabIndex: 0,
      title: "点击这条记忆即可编辑",
      onClick: () => startEdit(record),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEdit(record); }
      },
    },
      h("div", null,
        h("label", {
          className: "qbw-check",
          style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" },
          title: record.pinned || record.firstMet ? "置顶 / 初次相遇不参与整理" : "勾选后可手动整理",
          onClick: (e) => e.stopPropagation(),
        },
          h("input", {
            type: "checkbox",
            checked: selected.has(record.id),
            disabled: record.pinned || record.firstMet,
            onChange: (e) => { e.stopPropagation(); toggleSelected(record.id); },
          }),
          h("span", { className: "qbw-hint" }, record.pinned || record.firstMet ? "受保护，不参与整理" : "选择")),
        h("div", { className: "qbw-rec-title" },
          record.title || "（无标题）",
          record.pinned ? h(Badge, null, "置顶") : null,
          record.firstMet ? h(Badge, { kind: "ok" }, "初次相遇") : null),
        h("div", { className: "qbw-hint" },
          `${fmtTime(record.date)} · ${MEM_PLATFORM_LABEL[record.platform] ?? record.platform ?? "—"} · 重要 ${record.importance ?? 0} · ${MEM_CLARITY_LABEL[record.clarity] ?? record.clarity ?? "—"}`),
        h("div", {
          className: "qbw-rec-text", title: record.text,
          style: { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" },
        }, record.text || "（空）"),
        (record.tags ?? []).length ? h("div", { className: "qbw-chips" },
          record.tags.map((tag, index) => h("span", { key: `${tag}-${index}`, className: "qbw-chip" }, tag))) : null),
      h("div", { className: "qbw-rec-actions" },
        h(Btn, {
          onClick: (e) => { e.stopPropagation(); startEdit(record); }, disabled: !!busy,
        }, "编辑"),
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: (e) => { e.stopPropagation(); mutate({ action: "pin", id: record.id, pinned: !record.pinned }, record.pinned ? "✓ 已取消置顶" : "✓ 已置顶"); },
        }, record.pinned ? "取消置顶" : "置顶"),
        h(Btn, {
          kind: "qbw-btn2 danger", disabled: !!busy,
          onClick: async (e) => {
            e.stopPropagation();
            if (!confirm("忘记这条记忆？置顶的记忆不会被忘记。")) return;
            await mutate({ action: "forget", id: record.id }, "✓ 已忘记");
          },
        }, "忘记")));
  };

  const renderFullRecord = (record, index) => h("div", { key: `${record.id}-${index}`, className: "qbw-rec" },
    h("div", null,
      h("div", { className: "qbw-rec-title" }, record.title || "（无标题）",
        record.firstMet ? h(Badge, { kind: "ok" }, "初次相遇") : null),
      h("div", { className: "qbw-hint" },
        `${fmtTime(record.date)} · ${MEM_PLATFORM_LABEL[record.platform] ?? record.platform ?? "—"} · 重要 ${record.importance ?? 0}${record.matchScore ? ` · 匹配度 ${record.matchScore}` : ""}`),
      h("div", {
        className: "qbw-rec-text", title: record.text,
        style: { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" },
      }, record.text || "（空）"),
      record.archivedAt ? h("div", { className: "qbw-hint" }, `归档于 ${fmtTime(record.archivedAt)}`) : null));

  const body = !snap
    ? h("div", { className: "qbw-hint" }, busy === "reload" ? "读取记忆卡…" : "还没有读到记忆卡。")
    : tab === "doc"
      ? h("div", null,
        h("div", { className: "qbw-hint" }, "这是只读预览（memory-card.md 全文）。文档由记录自动生成，直接改这里不会保存——要改内容请点下面按钮，逐条编辑记录。"),
        snap.status?.paths?.markdown ? h(PathLine, { label: "生成文件", path: snap.status.paths.markdown }) : null,
        h("div", { className: "qbw-actions" },
          h(Btn, { onClick: () => openTab("records"), disabled: !!busy }, "去编辑记忆记录")),
        h("div", { className: "qbw-out", style: { maxHeight: "48vh" } }, snap.markdown || "（空）"))
      : tab === "records"
        ? h("div", null,
          h("div", { className: "qbw-search" },
            h("input", {
              className: "qbw-input", placeholder: "在下面列表里搜标题 / 正文 / 标签",
              value: recordQuery, onChange: (e) => setRecordQuery(e.target.value),
            }),
            recordQuery ? h(Btn, { kind: "qbw-btn2", onClick: () => setRecordQuery("") }, "清空") : null),
          h("div", { className: "qbw-hint" }, `共 ${(snap.records ?? []).length} 条。点下面任意一条即可编辑正文 / 标题 / 重要度 / 标签，改完点「保存这条记忆」就会立刻重写文档；更早的记录看「全量档案」。`),
          h("div", { className: "qbw-actions" },
            h("span", { className: "qbw-hint" }, `已选 ${selected.size} 条`),
            h(Btn, { kind: "qbw-btn2", onClick: organizeSelected, disabled: !!busy || selected.size < 2 }, busy === "act" ? "整理中…" : "整理选中"),
            h(Btn, { kind: "qbw-btn2 danger", onClick: forgetSelected, disabled: !!busy || !selected.size }, "忘记选中（删除）"),
            h(Btn, {
              kind: "qbw-btn3", disabled: !!busy,
              onClick: () => setSelected(new Set((snap.records ?? [])
                .filter((record) => !record.pinned && !record.firstMet)
                .slice(0, 160)
                .map((record) => record.id))),
            }, "全选可整理"),
            h(Btn, { kind: "qbw-btn3", onClick: () => setSelected(new Set()), disabled: !selected.size }, "清空选择")),
          h("div", { className: "qbw-hint" }, "「整理选中」会用模型把同话题的多条合并成一条、删掉纯寒暄与重复；置顶 / 初次相遇受保护，旧内容仍会进全量档案。"),
          h(Section, { title: "手动新增一条记忆", note: "写进去会标记为 manual", defaultOpen: false },
            h(Row, { label: "标题" },
              h("input", {
                className: "qbw-input", placeholder: "可选，一句话概括", value: addForm.title,
                onChange: (e) => setAddForm((f) => ({ ...f, title: e.target.value })),
              })),
            h("div", { className: "qbw-group" }, "内容"),
            h("textarea", {
              className: "qbw-textarea", placeholder: "她应该记住什么？", value: addForm.text,
              onChange: (e) => setAddForm((f) => ({ ...f, text: e.target.value })),
            }),
            h(Row, { label: "重要度", hint: "1-100，默认 60" },
              h("input", {
                className: "qbw-input", type: "number", min: 1, max: 100, value: addForm.importance,
                onChange: (e) => setAddForm((f) => ({ ...f, importance: e.target.value })),
              })),
            h(Row, { label: "标签", hint: "逗号分隔，可选" },
              h("input", {
                className: "qbw-input", value: addForm.tags,
                onChange: (e) => setAddForm((f) => ({ ...f, tags: e.target.value })),
              })),
            h("div", { className: "qbw-actions" },
              h(Btn, { onClick: addMemory, disabled: !!busy }, busy === "act" ? "保存中…" : "新增记忆"))),
          h("div", { className: "qbw-rows" },
            records.length ? records.map(renderRecord) : h("div", { className: "qbw-hint" }, "没有匹配的记忆。")))
        : tab === "prompt"
          ? h("div", null,
            h("div", { className: "qbw-hint" }, "这是注入 QQ / B站 提示词里的块，有字数上限，不是完整文档；改记录后会自动重写。"),
            h(Section, { title: "QQ 提示词块", defaultOpen: true },
              h("div", { className: "qbw-out", style: { maxHeight: "30vh" } }, snap.promptQq || "（空：QQ 关闭或没有可注入的记忆）")),
            h(Section, { title: "B站 提示词块", defaultOpen: false },
              h("div", { className: "qbw-out", style: { maxHeight: "30vh" } }, snap.promptBili || "（空：B站 关闭或没有可注入的记忆）")))
          : tab === "full"
            ? h("div", null,
              h("div", { className: "qbw-search" },
                h("input", {
                  className: "qbw-input", placeholder: "搜全量档案（标题 / 正文 / 标签）",
                  value: fullQuery,
                  onChange: (e) => setFullQuery(e.target.value),
                  onKeyDown: (e) => { if (e.key === "Enter") void loadFull(fullQuery); },
                }),
                h(Btn, { onClick: () => loadFull(fullQuery), disabled: busy === "full" }, busy === "full" ? "搜索中…" : "搜索")),
              !full
                ? h("div", { className: "qbw-hint" }, "读取中…")
                : h("div", null,
                  h("div", { className: "qbw-hint" },
                    `档案 ${fmtBytes(full.status?.bytes)} · ${full.status?.records ?? 0} 条 · 只存档，不参与日常提示词${full.query ? ` · 匹配「${full.query}」` : ""}`),
                  h("div", { className: "qbw-rows" },
                    (full.records ?? []).length ? full.records.map(renderFullRecord) : h("div", { className: "qbw-hint" }, "没有匹配的记录。")),
                  full.markdownPreview ? h(Section, { title: "档案 Markdown 预览", note: full.markdownTruncated ? "已截断" : "", defaultOpen: false },
                    h("div", { className: "qbw-out", style: { maxHeight: "40vh" } }, full.markdownPreview)) : null))
            : h("div", null,
              h("div", { className: "qbw-hint" }, "压缩 / 每日整理前会自动备份；恢复时会把当前卡先备份一份。全量档案的备份不在这里。"),
              (snap.backups ?? []).length
                ? h("div", { className: "qbw-rows" }, snap.backups.map((item) => h("div", { key: item.name, className: "qbw-item" },
                  h("div", null,
                    h("div", { className: "qbw-label" }, item.name),
                    h("div", { className: "qbw-hint" }, `${fmtTime(item.mtime)} · ${fmtBytes(item.bytes)}`)),
                  h(Btn, { kind: "qbw-btn2", disabled: !!busy, onClick: () => restoreBackup(item.name) }, "恢复"))))
                : h("div", { className: "qbw-hint" }, "还没有备份。"));

  return h(Modal, { title: "记忆文档", note: "查看全文、逐条修改并保存；改完会重写 md 和两份提示词块", onClose, width: 760 },
    h("div", { className: "qbw-seg" },
      MEM_DOC_TABS.map(([key, label]) => h("button", {
        key, type: "button", className: tab === key ? "on" : "", onClick: () => openTab(key),
      }, label))),
    h("div", { style: { marginTop: "10px", minHeight: "180px" } }, body),
    notice ? h("div", {
      className: "qbw-hint",
      style: { marginTop: "8px", fontWeight: 600, color: notice.startsWith("✗") ? "#c0353a" : "#1a8f5c" },
    }, notice) : null,
    err ? h("div", { className: "qbw-err" }, err) : null,
    h("div", { className: "qbw-actions" },
      h(Btn, { kind: "qbw-btn2", onClick: loadSnap, disabled: !!busy }, busy === "reload" ? "读取中…" : "刷新"),
      h(Btn, { kind: "qbw-btn2", onClick: onClose, disabled: busy === "act" }, "关闭")));
}


/* ══ pages/120-pet.js ══ */
/* 我的 dsh-Dfy 桌宠：主动找主人的载体与节奏。挂件核心由 dsh-Dfy 主包统一负责。 */

function PetPage({ qq, setQq, unified, setUnified, busy, setBusy, toast, reload }) {
  const P = qq?.purpose ?? {};
  const pv = (key, fallback) => (P[key] === undefined || P[key] === null || P[key] === "" ? fallback : P[key]);
  const setP = (key, value) => setQq(["purpose", key], value);
  const carrier = P.carrier === "pet" ? "pet" : "qq";

  const [purpose, setPurpose] = useState(null);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");
  // 情绪 / 口头禅：和 QQ、抖音共用一份状态（后端 /persona/state）。
  const [persona, setPersona] = useState(null);
  const [quirks, setQuirks] = useState([]);
  const [moodDraft, setMoodDraft] = useState("");

  // toast 每次渲染都是新函数：用 ref 固定，避免 useEffect([read]) 被反复触发出请求。
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const read = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("purpose-read");
    try {
      setPurpose(await api("/purpose/status"));
      if (manual) toastRef.current?.("✓ 已刷新状态");
    } catch (e) {
      if (manual) toastRef.current?.(`✗ 刷新失败：${e.message}`);
    } finally {
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { read(); }, [read]);

  const readPersona = useCallback(async () => {
    try {
      const r = await api("/persona/state");
      setPersona(r);
      setQuirks(Array.isArray(r.quirks) ? r.quirks : []);
      setMoodDraft(r.manual ? r.mood : "");
    } catch (e) { /* 后端还没升级时静默 */ }
  }, []);
  useEffect(() => { readPersona(); }, [readPersona]);
  const savePersona = async (patch, okText) => {
    try {
      const r = await api("/persona/config", { method: "POST", body: patch });
      setPersona(r);
      setQuirks(Array.isArray(r.quirks) ? r.quirks : []);
      setMoodDraft(r.manual ? r.mood : "");
      if (okText) toast(okText);
    } catch (e) { toast(`✗ ${e.message}`); }
  };

  // 演示气泡：只推一条假事件（不调模型），点一下就知道「插件 → 挂件 → 气泡」这条链路通没通。
  const demoBubble = async () => {
    setBusy("bubble-demo");
    try {
      const r = await api("/pet/bubble-demo", { method: "POST", body: {} });
      toast(`${r.widgetOnline ? "✓" : "⚠️"} ${r.message}${r.hint ? `（${r.hint}）` : ""}`);
      await read();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const doPreview = async () => {
    setBusy("purpose-preview");
    setMsg("");
    try {
      const r = await api("/purpose/preview", { method: "POST", body: {} });
      if (!r.ok) throw new Error(r.error ?? r.reason ?? "预览失败");
      setPreview(r);
      setMsg(`✓ 预览已生成（素材 ${r.materials?.length ?? 0} 条，未发送）`);
    } catch (e) { setPreview(null); setMsg(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const doRun = async () => {
    const ok = confirm((carrier === "pet")
      ? "现在就让小肥鱼在 dsh-Dfy 气泡里主动搭话一次？会真的生成一句话（算一次模型回合）。"
      : "现在就让小肥鱼按「目的机制」主动私聊你一次？会真的发 QQ 消息（算一次模型回合）。");
    if (!ok) return;
    setBusy("purpose-run");
    setMsg("");
    try {
      const r = await api("/purpose/run", { method: "POST", body: { force: true } });
      if (!r.ok) throw new Error(r.error ?? r.reason ?? "投递失败");
      setMsg(carrier === "pet"
        ? `✓ 已推到 dsh-Dfy 气泡：${r.message?.text ?? r.selected?.text ?? "一句话"}`
        : `✓ 已投递：${r.selected?.text ?? "一轮目的"}`);
      await read();
    } catch (e) { setMsg(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const preset = (name) => {
    const presets = {
      calm: { gapMinMs: 240 * 60000, gapMaxMs: 480 * 60000, dailyMax: 2, quietStart: "23:00", quietEnd: "09:00", initialDelayMinMs: 60 * 60000 },
      normal: { gapMinMs: 150 * 60000, gapMaxMs: 300 * 60000, dailyMax: 4, quietStart: "23:30", quietEnd: "08:30", initialDelayMinMs: 30 * 60000 },
      active: { gapMinMs: 60 * 60000, gapMaxMs: 120 * 60000, dailyMax: 6, quietStart: "00:30", quietEnd: "07:30", initialDelayMinMs: 15 * 60000 },
    };
    const chosen = presets[name];
    if (!chosen) return;
    for (const [key, value] of Object.entries(chosen)) setP(key, value);
    toast("✓ 已套用节奏，记得保存");
  };
  const minutes = (label, key, fallback, hint) => h(Row, { label, hint },
    h("input", {
      className: "qbw-input", type: "number", min: 0, max: 1440,
      value: Math.round(Number(pv(key, fallback * 60000)) / 60000),
      onChange: (e) => setP(key, Math.max(0, Math.round(Number(e.target.value) || 0)) * 60000),
    }));

  const availability = purpose?.availability ?? {};
  const petAvail = availability.pet ?? {};
  const qqAvail = availability.qq ?? {};
  const st = purpose?.state ?? {};

  return h("div", null,
    h("div", { className: "qbw-infobox" }, "对话始终在 QQ；气泡只是把她说的话显示到桌面。"),

    h(Card, { title: "对话与展示", right: h(Badge, null, carrier === "pet" ? "QQ + 气泡" : "仅 QQ") },
      h("p", null, "没有两个「载体」：入口永远是 QQ 私聊/群聊，气泡是可选的展示层。"),
      h(KV, { label: "对话入口" }, qqAvail.running ? `QQ 私聊${qqAvail.mode ? ` · ${qqAvail.mode}` : ""}` : "QQ 私聊（桥接没在运行）"),
      h(KV, { label: "dsh-Dfy 挂件" }, !purpose ? "读取中…" : !petAvail.installed ? "未安装" : petAvail.online ? `在线${petAvail.roleName ? ` · ${petAvail.roleName}` : ""}` : petAvail.running ? "已安装 · 运行中" : "已安装 · 未运行"),
      h(Row, { label: "同时在气泡里显示", hint: "开 = 主动搭话先推气泡，挂件没开时自动回落 QQ；关 = 只在 QQ 里" },
        h("input", {
          className: "qbw-switch",
          type: "checkbox",
          checked: carrier === "pet",
          onChange: (e) => {
            const on = e.target.checked;
            setP("carrier", on ? "pet" : "qq");
            if (on) setP("petFallbackToQQ", true);
          },
        })),
      h(Row, { label: "气泡内容", hint: "语音会同时显示文字；短信段落仍按 QQ 规则" },
        h("select", { className: "qbw-select", value: P.petModality === "voice" ? "voice" : "text", onChange: (e) => setP("petModality", e.target.value) },
          h("option", { value: "text" }, "纯文本（不朗读）"),
          h("option", { value: "voice" }, "朗读语音（气泡里仍有文字）"))),
      h("div", { className: "qbw-hint" }, "消息卡片的朗读开关、音色和语速已合并到「系统 → 语音设置 → 消息卡片朗读」。"),
      h(KV, { label: "气泡里快捷回复" }, petAvail.online ? "可用（点气泡上的「回复」）" : "挂件在线后可用"),
      // 演示按钮：不生成模型回复，只推一条假事件，专门用来验证气泡链路；顺带回显挂件是否在轮询。
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: demoBubble, disabled: !!busy }, busy === "bubble-demo" ? "演示中…" : "演示气泡"),
        h("span", { className: "qbw-hint" }, petAvail.online ? "挂件在线，会收到气泡" : "挂件未在线：桌面收不到气泡（先把 dsh-Dfy 挂件页面开着）"))),

    h(Card, {
      title: "情绪与口头禅",
      note: "QQ / 桌宠 / 抖音共用这一份心情：沉默久了会自动低落，手动指定 6 小时后恢复自动。",
    },
      h(KV, { label: "现在的心情" },
        persona ? `${persona.moodLabel} · ${persona.moodNote}` : "读取中…"),
      h(Row, { label: "手动指定心情", hint: "选「自动」= 按最近多久没说话来推导" },
        h("select", {
          className: "qbw-select",
          value: moodDraft,
          onChange: (e) => {
            const value = e.target.value;
            setMoodDraft(value);
            savePersona({ mood: value }, value ? "✓ 已切换心情（6 小时内生效）" : "✓ 已恢复自动心情");
          },
        },
          h("option", { value: "" }, "自动（按沉默时间）"),
          h("option", { value: "happy" }, "心情不错"),
          h("option", { value: "calm" }, "平静"),
          h("option", { value: "pouty" }, "有点小别扭"),
          h("option", { value: "lonely" }, "闷闷的"),
          h("option", { value: "tired" }, "有点累"))),
      h(Row, { label: "口头禅", hint: "最多 8 条、每条 24 字内；她会偶尔用，不会每句都挂" },
        h(ListInput, {
          value: quirks,
          placeholder: "比如：笑死、绷不住了、你猜",
          onChange: (v) => setQuirks(v),
        })),
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: () => savePersona({ quirks }, "✓ 口头禅已保存") }, "保存口头禅"),
        h(Btn, { kind: "qbw-btn3", onClick: readPersona }, "刷新心情"))),

    h(Card, {
      title: "主动找主人 · 目的机制",
      right: [
        purpose ? h(Badge, { key: "e", kind: purpose.enabled ? "ok" : "warn" }, purpose.enabled ? "开" : "关") : null,
        purpose?.focus ? h(Badge, { key: "f", kind: "warn" }, "专注中 · 自动停") : null,
        h(Btn, { key: "r", kind: "qbw-btn3", onClick: () => read({ manual: true }), disabled: !!busy }, busy === "purpose-read" ? "刷新中…" : "刷新状态"),
      ],
    },
      h("p", null, "不是关键词触发：综合 QQ / B站 / 人格卡 / 记忆卡决定说什么。"),
      purpose?.focus ? h("div", { className: "qbw-warnbox" }, "专注模式开着：自动主动搭话已暂停；手动「立即试一次」仍可用。") : null,
      h("div", { className: "qbw-hint" },
        `今天 ${st.countToday ?? 0}/${Number(pv("dailyMax", 4)) || "不限"} · 下次：${st.nextFireAt ? fmtTime(st.nextFireAt) : "—"}`),
      st.lastPurpose ? h("div", { className: "qbw-hint" }, `上次的目的：${st.lastPurpose}`) : null,
      st.lastSkip?.reason ? h("div", { className: "qbw-hint" }, `最近一次没出发：${st.lastSkip.reason}`) : null,
      h("div", { className: "qbw-actions" },
        h("span", { className: "qbw-hint" }, "节奏预设："),
        h(Btn, { kind: "qbw-btn2", onClick: () => preset("calm"), disabled: !!busy }, "保守"),
        h(Btn, { kind: "qbw-btn2", onClick: () => preset("normal"), disabled: !!busy }, "默认"),
        h(Btn, { kind: "qbw-btn2", onClick: () => preset("active"), disabled: !!busy }, "活跃")),

      h(Row, { label: "启用目的机制", hint: "关掉后不会主动私聊；手动试一次仍可用" },
        h("input", { className: "qbw-switch", type: "checkbox", checked: pv("enabled", true) !== false, onChange: (e) => setP("enabled", e.target.checked) })),
      minutes("两次之间至少（分钟）", "gapMinMs", 150, "默认 150"),
      minutes("两次之间最多（分钟）", "gapMaxMs", 300, "默认 300；到点后随机"),
      minutes("启动后先等（分钟）", "initialDelayMinMs", 30, "重启/换角色后第一枪的延迟"),
      h(Row, { label: "每天最多几次", hint: "0 = 不限（仍受 token 额度约束）" },
        h("input", { className: "qbw-input", type: "number", min: 0, max: 24, value: pv("dailyMax", 4), onChange: (e) => setP("dailyMax", Number(e.target.value) || 0) })),
      h(Row, { label: "安静时段", hint: "HH:MM；两个相同 = 不设" },
        h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
          h("input", { className: "qbw-input", style: { width: "86px" }, value: pv("quietStart", "23:30"), onChange: (e) => setP("quietStart", e.target.value) }),
          h("span", null, "~"),
          h("input", { className: "qbw-input", style: { width: "86px" }, value: pv("quietEnd", "08:30"), onChange: (e) => setP("quietEnd", e.target.value) }))),
      minutes("你空闲多久才打扰（分钟）", "idleThresholdMs", 30, "你刚说过话时先不插嘴"),

      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: doPreview, disabled: !!busy }, busy === "purpose-preview" ? "生成中…" : "预览这一轮（不发）"),
        h(Btn, { kind: "qbw-btn2", onClick: doRun, disabled: !!busy }, busy === "purpose-run" ? "投递中…" : "立即试一次（真发）")),
      msg ? h("div", { className: msg.startsWith("✗") ? "qbw-err" : "qbw-hint" }, msg) : null,
      preview ? h(Section, { title: `预览：${preview.selected?.text ?? "（没有选中目的）"}`, note: `素材 ${preview.materials?.length ?? 0} 条`, defaultOpen: true },
        h("textarea", { className: "qbw-textarea", readOnly: true, value: preview.prompt ?? "" })) : null),

    h("div", { className: "qbw-hint" },
      "载体 = dsh-Dfy 挂件时：节奏参数保存即生效。载体 = QQ 时：节奏参数要重启桥接才生效。"));
}


/* ══ pages/125-model.js ══ */
/* 对话 · 全局模型：一份选择，插件后台任务直接用；也写成 DSH 默认，新建会话跟随。 */

function ModelPage({ busy, setBusy, toast }) {
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState({ provider: "", model: "" });

  const load = useCallback(async () => {
    try {
      const result = await api("/models");
      setCatalog(result);
      setDraft({ provider: result.saved?.provider || "", model: result.saved?.model || "" });
    } catch (e) {
      toast(`✗ 读取模型目录失败：${e.message}`);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const models = (catalog?.models ?? []).filter((item) => item.provider === draft.provider);
  const apply = async () => {
    if (draft.provider && !draft.model) { toast("✗ 先选一个模型"); return; }
    setBusy("model");
    try {
      const result = await api("/models", { method: "POST", body: { provider: draft.provider, model: draft.model } });
      setCatalog(result);
      setDraft({ provider: result.saved?.provider || "", model: result.saved?.model || "" });
      toast(result.saved?.provider ? "✓ 全局模型已切换" : "✓ 已恢复为跟随 DSH 默认");
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  return h("div", { className: "qbw-page-model" },
    h(Card, {
      title: "全局模型",
      note: "切换方法：① 提供商选「跟随 DSH 默认」或具体提供商；② 再选模型；③ 点「应用模型」。想恢复默认，把提供商选回「跟随 DSH 默认」再点应用即可。",
    },
      h(Row, { label: "模型", hint: "留空 = 跟随 DSH 默认；选一个 = 固定使用" },
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
          h("select", {
            className: "qbw-select", value: draft.provider,
            onChange: (e) => setDraft({ provider: e.target.value, model: "" }),
          },
            h("option", { value: "" }, "跟随 DSH 默认"),
            (catalog?.providers ?? []).map((item) => h("option", { key: item.id, value: item.id }, item.name || item.id))),
          draft.provider
            ? h("select", {
              className: "qbw-select", value: draft.model,
              onChange: (e) => setDraft((current) => ({ ...current, model: e.target.value })),
            },
              h("option", { value: "" }, "选模型"),
              models.map((item) => h("option", { key: item.id, value: item.id }, item.name || item.id)))
            : null,
          h(Btn, { onClick: apply, disabled: !!busy }, busy === "model" ? "应用中…" : "应用模型"))),
      h(KV, { label: "当前设置" }, catalog?.saved?.provider
        ? `${catalog.saved.provider} / ${catalog.saved.model}`
        : "跟随 DSH 默认"),
      h(KV, { label: "DSH 默认" }, catalog?.dshDefault?.provider
        ? `${catalog.dshDefault.provider} / ${catalog.dshDefault.model}`
        : "—"),
      h("div", { className: "qbw-group", style: { marginTop: "12px" } }, "这个设置会影响谁"),
      h("div", { className: "qbw-hint", style: { lineHeight: 1.6 } },
        "· 抖音私信 / 群聊自动回复、插件的后台任务：点「应用模型」后立即生效。",
        h("br"),
        "· QQ 会话：他的下一条消息就会用这里的模型（桥接会按这份选择设置会话）。",
        h("br"),
        "· 你在 DSH 会话窗口里手动切过模型的会话会被尊重：只要这里不改，就不会被覆盖。",
        h("br"),
        "· 选「跟随 DSH 默认」= 桥接不再指定模型，会话按 DSH 自己的默认走。"),
      catalog?.error ? h("div", { className: "qbw-err", style: { marginTop: "8px" } }, catalog.error) : null),
  );
}


/* ══ pages/130-voice.js ══ */
/* 语音设置 —— AI 发语音条（Edge TTS，走 bridge）。
 *
 * ⚠️ 必须遵守的坑（踩过）：
 * 1) React 的 style 只能是对象，不能是字符串。传字符串会直接抛 React error #62
 *    （The `style` prop expects a mapping from style properties to values, not a string）。
 * 2) 配置路径必须是 socialV2.voice.tts.*：桥接只读这一段（src/bridge.js → voiceCfg()）。
 *
 * 文本朗读（旧「② 文本朗读」）已随本轮收尾删除：它写的是根级 voice.speak.*，
 * 全仓库没有任何消费方；气泡/台词的朗读由挂件侧决定（whale-widget.js 的
 * petSpeakText + 气泡事件里的 speak 标记），设置页再放一份假开关只会误导。
 */

// 微软 Edge 在线音色（readaloud 端点，零安装、免 key）。
// 2026-11 按官方列表核对过：晓涵 / 晓梦 / 晓双 三个旧音色已经从端点下线，
// 选中它们只会合成失败（试听没声音），所以这里不再提供。
const EDGE_VOICES = [
  // 普通话
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 女声温柔（默认）' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊 · 女声元气' },
  { id: 'zh-CN-YunxiNeural', label: '云希 · 男声磁性' },
  { id: 'zh-CN-YunjianNeural', label: '云健 · 男声少年' },
  { id: 'zh-CN-YunxiaNeural', label: '云夏 · 男声清亮' },
  { id: 'zh-CN-YunyangNeural', label: '云扬 · 男声稳重' },
  // 方言
  { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北 · 东北话' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮 · 陕西话' },
  // 粤语 / 香港
  { id: 'zh-HK-HiuGaaiNeural', label: '曉佳 · 粤语女声' },
  { id: 'zh-HK-HiuMaanNeural', label: '曉曼 · 粤语女声' },
  { id: 'zh-HK-WanLungNeural', label: '雲龍 · 粤语男声' },
  // 台湾
  { id: 'zh-TW-HsiaoChenNeural', label: '曉臻 · 台湾女声' },
  { id: 'zh-TW-HsiaoYuNeural', label: '曉雨 · 台湾女声' },
  { id: 'zh-TW-YunJheNeural', label: '雲哲 · 台湾男声' },
  // 多语种（能读中文，但带轻微外语口音，音色和普通话那组不同）
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava · 多语种女声' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma · 多语种女声' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew · 多语种男声' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian · 多语种男声' },
  { id: 'en-AU-WilliamMultilingualNeural', label: 'William · 多语种男声' },
];

// 在线免费模型（HuggingFace Space · Qwen3-TTS Voice Design）的默认声音描述。
// 改这句就等于换音色：越具体越稳（年龄 + 软硬 + 语速 + 情绪）。
const ONLINE_DESC_DEFAULT = '二十出头的女生，声音软一点、偏轻，语速自然偏快，带一点笑意，不要播音腔。';

// 阿里百炼 Qwen-TTS 的常用系统音色（更多见百炼「非实时语音合成」音色列表）。
const QWEN_VOICES = [
  { id: 'Cherry', label: 'Cherry · 女声（默认）' },
  { id: 'Serena', label: 'Serena · 女声' },
  { id: 'Chelsie', label: 'Chelsie · 女声' },
  { id: 'Ethan', label: 'Ethan · 男声' },
  { id: 'Dylan', label: 'Dylan · 男声' },
  { id: 'Jada', label: 'Jada · 女声' },
  { id: 'Sunny', label: 'Sunny · 女声' },
];

const QWEN_LANGS = [
  { id: 'Auto', label: '自动识别' },
  { id: 'Chinese', label: '中文' },
  { id: 'English', label: '英文' },
  { id: 'Japanese', label: '日文' },
  { id: 'Korean', label: '韩文' },
];

const DOUBAO_ENCODINGS = [
  { id: 'mp3', label: 'MP3（推荐）' },
  { id: 'wav', label: 'WAV（仅旧版 AppID + Token）' },
  { id: 'ogg_opus', label: 'OGG Opus' },
];

// 新版控制台（API Key / V3 流式）的资源版本：合成用 seed-tts-2.0，复刻音色用 seed-icl-2.0。
const DOUBAO_RESOURCES = [
  { id: 'seed-tts-2.0', label: 'seed-tts-2.0 · 语音合成（默认）' },
  { id: 'seed-icl-2.0', label: 'seed-icl-2.0 · 声音复刻音色' },
];

// 豆包语音默认音色（voice_type）。免费音色清单见火山引擎「小模型音色列表」，
// 把它贴进下面的输入框即可切换；填错会报「音色不存在」。
const DOUBAO_VOICE_DEFAULT = 'zh_female_xiaohe_uranus_bigtts';

const SPEAK_RATES = [
  { value: '-15%', label: '慢一点 · -15%' },
  { value: '-10%', label: '略慢 · -10%' },
  { value: '+0%', label: '正常 · +0%（默认）' },
  { value: '+10%', label: '略快 · +10%' },
  { value: '+20%', label: '轻快 · +20%' },
];

// 朗读音量：Edge 合成本身没有增益参数，音量在挂件播放端（Audio.volume）生效。
const SPEAK_VOLUMES = [
  { value: 30, label: '小声 · 30%' },
  { value: 50, label: '中等 · 50%' },
  { value: 70, label: '偏小 · 70%' },
  { value: 80, label: '默认 · 80%' },
  { value: 100, label: '最大 · 100%' },
];

function VoicePage({ qq, setQq, toast, defaults }) {
  const svVoice = (qq && qq.socialV2 && qq.socialV2.voice) ? qq.socialV2.voice : {};
  const qqTts = svVoice.tts ? svVoice.tts : {};
  // 后端 GET /config 会带 defaults（形状同配置）：未在配置文件里显式写的键，
  // 面板按后端默认值显示，但不写回配置（用户不动就不产生新键）。
  const dTts = (defaults && defaults.socialV2 && defaults.socialV2.voice && defaults.socialV2.voice.tts)
    ? defaults.socialV2.voice.tts
    : {};
  const setTts = function (key, value) { setQq(['socialV2', 'voice', 'tts', key], value); };
  const pick = function (key, fallback) {
    const own = qqTts[key];
    if (own !== undefined && own !== null) return own;
    const def = dTts[key];
    if (def !== undefined && def !== null) return def;
    return fallback;
  };

  // 显示值直接由配置派生，不用 useState 镜像：
  // 镜像只认初始值，底部「撤销」把配置改回去时界面不会跟着回去。
  const enabled = pick('enabled', false) === true;
  // 音源：edge（微软在线）/ local（本地 voxd 8765）/ cloud（火山引擎 8767）。
  // 后两条只是「本机起一个服务」，插件不捆绑模型；服务没起时试听会明确报错，不会静默换回 Edge。
  const route = String(pick('route', 'edge') || 'edge');
  const localBaseUrl = String(qqTts.localBaseUrl ?? dTts.localBaseUrl ?? 'http://127.0.0.1:8765');
  const localVoice = String(qqTts.localVoice ?? '');
  const cloudBaseUrl = String(qqTts.cloudBaseUrl ?? dTts.cloudBaseUrl ?? 'http://127.0.0.1:8767');
  const cloudVoice = String(qqTts.cloudVoice ?? '');
  // 在线免费模型：声音不是从列表里挑，而是用一句中文描述生成（不需要参考音频）。
  const onlineDesc = String(qqTts.onlineDesc ?? dTts.onlineDesc ?? ONLINE_DESC_DEFAULT);
  // 豆包 / 千问：各自一套凭证 + 音色。
  const doubaoApiKey = String(qqTts.doubaoApiKey ?? '');
  const doubaoResourceId = String(qqTts.doubaoResourceId ?? 'seed-tts-2.0');
  const doubaoAppId = String(qqTts.doubaoAppId ?? '');
  const doubaoToken = String(qqTts.doubaoToken ?? '');
  const doubaoVoice = String(qqTts.doubaoVoice ?? DOUBAO_VOICE_DEFAULT);
  const doubaoEncoding = String(qqTts.doubaoEncoding ?? 'mp3');
  const qwenApiKey = String(qqTts.qwenApiKey ?? '');
  const qwenVoice = String(qqTts.qwenVoice ?? 'Cherry');
  const qwenLanguage = String(qqTts.qwenLanguage ?? 'Auto');
  const edgeVoice = pick('edgeVoice', 'zh-CN-XiaoxiaoNeural');
  const maxChars = qqTts.maxChars ?? dTts.maxChars;
  const timeoutMs = qqTts.timeoutMs ?? dTts.timeoutMs;
  // 「消息卡片朗读」：开关在 QQ 配置的 purpose.cardSpeak；音色/语速在 voice.tts 里，和语音条分开。
  const cardSpeak = qq?.purpose?.cardSpeak === true;
  const speakVoice = String(qqTts.speakVoice || '');
  const speakRate = String(qqTts.speakRate || '+0%');
  const speakVolume = Number(qqTts.speakVolume ?? dTts.speakVolume ?? 80);
  const setSpeak = function (key, value) { setQq(['socialV2', 'voice', 'tts', key], value); };

  // 音色试听（走 bridge 合成 MP3，和语音条同一份音源）
  const [previewText, setPreviewText] = useState('你好，我是现在这个音色，听起来怎么样？');
  const [previewBusy, setPreviewBusy] = useState(false);
  const audioRef = useRef(null);

  const stopPreviewAudio = function () {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    try { audio.pause(); } catch (e) { /* 忽略 */ }
    try { URL.revokeObjectURL(audio.src); } catch (e) { /* 忽略 */ }
  };

  useEffect(function () {
    return stopPreviewAudio;
  }, []);

  // 走 bridge 合成 MP3 → 浏览器播放。和 QQ 语音条用的是同一份 Edge 音源。
  // rate 用于「朗读音色」试听（如 +10%），语音条试听固定 +0%。
  const playEdgePreview = async function (text, voice, rate, volume) {
    const say = String(text || '').trim();
    if (!say) { toast('✗ 先说点什么再试听'); return; }
    if (previewBusy) return;
    setPreviewBusy(true);
    stopPreviewAudio();
    try {
      const q = '?voice=' + encodeURIComponent(voice)
        + '&rate=' + encodeURIComponent(rate || '+0%')
        + '&text=' + encodeURIComponent(say.slice(0, 200));
      // 微软端点偶尔会「连上了但没音频」：自动重试一次，仍失败再报错。
      let res = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        res = await fetch(API + '/voice/preview' + q, { headers: { accept: 'audio/mpeg' } });
        if (res.ok || res.status < 500) break;
        if (attempt === 0) await new Promise(function (r) { setTimeout(r, 400); });
      }
      if (!res.ok) {
        let detail = 'HTTP ' + res.status;
        try {
          const data = await res.json();
          detail = data.hint || data.error || detail;
        } catch (e) { /* 非 JSON 响应，保留状态码 */ }
        const tail = route === 'edge'
          ? '这个音色可能已下线，换一个再试'
          : (route === 'local'
            ? '本地服务没启动，或音色名不存在（先在 8765 起 voxd）'
            : (route === 'online'
              ? '在线免费队列排队或失败，重试一次（需要联网）'
              : (route === 'doubao'
                ? '检查 API Key（或旧版 AppID + Access Token）与音色 voice_type 是否开通'
                : (route === 'qwen'
                  ? '检查 API Key 是否属于百炼、额度是否用完'
                  : '云端代理没启动，或音色名不存在（先在 8767 起服务）'))));
        toast('✗ 试听失败：' + detail + '（' + tail + '）');
        return;
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      // 传入 0~100 时按「朗读音量」播放（试听听到的就是实际朗读的响度）
      if (volume !== undefined && volume !== null && isFinite(Number(volume))) {
        audio.volume = Math.max(0, Math.min(1, Number(volume) / 100));
      }
      audioRef.current = audio;
      audio.onended = stopPreviewAudio;
      audio.play().catch(function () { toast('✗ 浏览器拦截了播放，请再点一次'); });
    } catch (error) {
      toast('✗ 试听失败：' + ((error && error.message) ? error.message : 'bridge 未启动'));
    } finally {
      setPreviewBusy(false);
    }
  };

  return h('div', null,
    h('h2', null, '语音设置'),
    h('div', { className: 'qbw-infobox' }, '音源自己选：Edge（免 key）、豆包语音、千问 TTS、在线免费模型，或本地/云端 voxd 服务。插件不会下载任何模型；要 key 的那几条填你自己的凭证即可。'),

    h(Card, { title: '开关与音色' },
      h(Row, { label: '语音合成总开关', hint: '关掉后 AI 不再发语音条，文字聊天照常' },
        h('input', {
          type: 'checkbox',
          checked: !!enabled,
          onChange: function (e) { setTts('enabled', e.target.checked); },
        })
      ),
      h(Row, { label: '音源', hint: '决定用哪个引擎发声；换引擎只改这一项' },
        h('select', {
          className: 'qbw-select',
          value: route,
          onChange: function (e) { setTts('route', e.target.value); },
        },
          h('option', { value: 'edge' }, '微软 Edge 在线（免安装、免 key）'),
          h('option', { value: 'doubao' }, '豆包语音 · 火山引擎（新版 API Key / 旧版 Token）'),
          h('option', { value: 'qwen' }, '阿里百炼 · Qwen-TTS'),
          h('option', { value: 'online' }, '在线免费模型 · Qwen3-TTS（约 10~30 秒/句）'),
          h('option', { value: 'local' }, '本地语音服务 · voxd（默认 8765）'),
          h('option', { value: 'cloud' }, '火山引擎 · 云端声音复刻（默认 8767）')
        )
      ),

      // ── Edge：音色下拉 ─────────────────────────────────────────────
      route === 'edge'
        ? h(Row, { label: '音色', hint: 'AI 说话的声音；点「试听」当场听' },
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            h('select', {
              className: 'qbw-input',
              value: edgeVoice,
              onChange: function (e) { setTts('edgeVoice', e.target.value); },
            }, (EDGE_VOICES.some(function (v) { return v.id === edgeVoice; })
              ? []
              : [h('option', { key: '__gone', value: edgeVoice }, '当前音色已下线 · 请换一个')]
            ).concat(EDGE_VOICES.map(function (v) {
              return h('option', { key: v.id, value: v.id }, v.label);
            }))),
            h(Btn, {
              onClick: function () { playEdgePreview(previewText, edgeVoice); },
              disabled: previewBusy,
            }, previewBusy ? '合成中…' : '试听')
          )
        )
        : null,

      // ── 豆包语音（火山引擎）：新版控制台用 API Key；旧版 AppID + Token 保留兼容 ──
      route === 'doubao'
        ? [
          h(Row, { key: '__dbk', label: 'API Key', hint: '新版控制台 → 语音合成 → API Key 管理；只填这一项就能用' },
            h('input', {
              className: 'qbw-input',
              type: 'password',
              value: doubaoApiKey,
              placeholder: '粘贴 API Key（新版控制台）',
              onChange: function (e) { setTts('doubaoApiKey', e.target.value); },
            })
          ),
          h(Row, { key: '__dbv', label: '音色 voice_type', hint: '控制台 → 音色库复制；2.0 音色如 zh_female_vv_uranus_bigtts' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: doubaoVoice,
                placeholder: DOUBAO_VOICE_DEFAULT,
                onChange: function (e) { setTts('doubaoVoice', e.target.value); },
              }),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, doubaoVoice, '+0%'); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h(Row, { key: '__dbr', label: '资源版本', hint: '合成音色选 seed-tts-2.0；复刻音色选 seed-icl-2.0' },
            h('select', {
              className: 'qbw-select',
              value: doubaoResourceId,
              onChange: function (e) { setTts('doubaoResourceId', e.target.value); },
            }, DOUBAO_RESOURCES.map(function (x) {
              return h('option', { key: x.id, value: x.id }, x.label);
            }))
          ),
          h(Row, { key: '__dbe', label: '音频格式', hint: 'V3 流式不支持 WAV，选了也会按 MP3 合成；OGG Opus 兼容性最好' },
            h('select', {
              className: 'qbw-select',
              value: doubaoEncoding,
              onChange: function (e) { setTts('doubaoEncoding', e.target.value); },
            }, DOUBAO_ENCODINGS.map(function (x) {
              return h('option', { key: x.id, value: x.id }, x.label);
            }))
          ),
          h(Row, { key: '__dbold', label: '旧版 AppID / Access Token', hint: '只有旧版控制台才需要；上面填了 API Key 就留空' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: doubaoAppId,
                placeholder: 'AppID（旧版）',
                onChange: function (e) { setTts('doubaoAppId', e.target.value); },
              }),
              h('input', {
                className: 'qbw-input',
                type: 'password',
                value: doubaoToken,
                placeholder: 'Access Token（旧版）',
                onChange: function (e) { setTts('doubaoToken', e.target.value); },
              })
            )
          ),
        ]
        : null,

      // ── 阿里百炼 Qwen-TTS：API Key + 音色 + 语种 ──────────────────
      route === 'qwen'
        ? [
          h(Row, { key: '__qa', label: 'API Key', hint: '阿里云百炼控制台 → API Key' },
            h('input', {
              className: 'qbw-input',
              type: 'password',
              value: qwenApiKey,
              placeholder: 'sk-...',
              onChange: function (e) { setTts('qwenApiKey', e.target.value); },
            })
          ),
          h(Row, { key: '__qv', label: '音色', hint: '百炼的系统音色；更多见官方音色列表' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('select', {
                className: 'qbw-select',
                value: qwenVoice,
                onChange: function (e) { setTts('qwenVoice', e.target.value); },
              }, QWEN_VOICES.map(function (x) {
                return h('option', { key: x.id, value: x.id }, x.label);
              })),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, qwenVoice, '+0%'); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h(Row, { key: '__ql', label: '语种', hint: '纯中文时选「中文」，比自动识别更稳' },
            h('select', {
              className: 'qbw-select',
              value: qwenLanguage,
              onChange: function (e) { setTts('qwenLanguage', e.target.value); },
            }, QWEN_LANGS.map(function (x) {
              return h('option', { key: x.id, value: x.id }, x.label);
            }))
          ),
        ]
        : null,

      // ── 在线免费模型：用一句话描述声音 ───────────────────────────
      route === 'online'
        ? [
          h(Row, { key: '__od', label: '声音描述', hint: '越具体越稳：年龄 + 软硬 + 语速 + 情绪' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: onlineDesc,
                placeholder: ONLINE_DESC_DEFAULT,
                onChange: function (e) { setTts('onlineDesc', e.target.value); },
              }),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, '', '+0%'); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h('div', { key: '__otip', className: 'qbw-hint' },
            '走 HuggingFace 的免费 GPU 队列：不需要装模型、不需要 key，但每句要等 10~30 秒，文字会发到对方服务器。'),
        ]
        : null,

      // ── 本地 / 云端：voxd 协议地址 + 音色名 ───────────────────────
      route === 'local' || route === 'cloud'
        ? [
          h(Row, { key: '__svc', label: '服务地址', hint: route === 'local' ? '本机 voxd 服务；没起就试听报错' : '火山引擎声音复刻代理；没起就试听报错' },
            h('input', {
              className: 'qbw-input',
              value: route === 'local' ? localBaseUrl : cloudBaseUrl,
              placeholder: route === 'local' ? 'http://127.0.0.1:8765' : 'http://127.0.0.1:8767',
              onChange: function (e) {
                setTts(route === 'local' ? 'localBaseUrl' : 'cloudBaseUrl', e.target.value);
              },
            })
          ),
          h(Row, { key: '__name', label: '音色名', hint: '服务里的音色 id（留空 = 用服务默认）' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: route === 'local' ? localVoice : cloudVoice,
                placeholder: 'xiaoyu',
                onChange: function (e) {
                  setTts(route === 'local' ? 'localVoice' : 'cloudVoice', e.target.value);
                },
              }),
              h(Btn, {
                onClick: function () {
                  playEdgePreview(previewText, route === 'local' ? localVoice : cloudVoice, '+0%');
                },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
        ]
        : null,

      h(Row, { label: '试听文本', hint: '点「试听」时合成这一段（最多 200 字）' },
        h('input', {
          className: 'qbw-input',
          value: previewText,
          onChange: function (e) { setPreviewText(e.target.value); },
        })
      ),
      h('div', { className: 'qbw-hint' }, '音源/地址改完点底部「保存」再生效；试听用的是已保存的配置。')
    ),

    // 消息卡片朗读：开关 + 朗读音色/语速。合并到语音页，避免在「对话 → 桌宠」里另找一份。
    h(Card, {
      title: '消息卡片朗读',
      note: 'QQ 消息卡里她的新回复会自动念出来（不用打开气泡）。音色和语速与「语音条」分开设置，试听用的是这一套。',
    },
      h(Row, { label: '朗读开关', hint: '关掉后卡片只显示文字' },
        h('input', {
          type: 'checkbox',
          checked: cardSpeak,
          onChange: function (e) { setQq(['purpose', 'cardSpeak'], e.target.checked); },
        })
      ),
      // Edge 之外的音源（豆包/千问/在线模型/本地/云端）没有「Edge 音色 id」这个概念，
      // 朗读直接跟随音源本身的音色或描述；这里再摆一个 Edge 音色下拉只会误导。
      route === 'edge'
        ? [
          h(Row, { key: '__sv', label: '朗读音色', hint: '留空就跟随上面的语音条音色' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('select', {
                className: 'qbw-input',
                value: speakVoice,
                onChange: function (e) { setSpeak('speakVoice', e.target.value); },
              },
                h('option', { key: '__follow', value: '' }, '跟随语音条音色'),
                (speakVoice && !EDGE_VOICES.some(function (v) { return v.id === speakVoice; }))
                  ? [h('option', { key: '__gone2', value: speakVoice }, '当前音色已下线 · 请换一个')]
                  : [],
                EDGE_VOICES.map(function (v) {
                  return h('option', { key: v.id, value: v.id }, v.label);
                })),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, speakVoice || edgeVoice, speakRate, speakVolume); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h(Row, { key: '__sr', label: '朗读语速', hint: '朗读专用；语音条仍按正常语速' },
            h('select', {
              className: 'qbw-input',
              value: speakRate,
              onChange: function (e) { setSpeak('speakRate', e.target.value); },
            }, SPEAK_RATES.map(function (r) {
              return h('option', { key: r.value, value: r.value }, r.label);
            }))
          ),
        ]
        : h(Row, { key: '__nonedge', label: '朗读音色 / 语速', hint: '当前音源不支持单独设置' },
          h('div', { className: 'qbw-hint' }, '朗读会跟随「音源」里的音色（或声音描述），这里不用改。')
        ),
      h(Row, { label: '朗读音量', hint: '只影响卡片/气泡朗读；系统音量仍可整体调节' },
        h('select', {
          className: 'qbw-input',
          value: String(speakVolume),
          onChange: function (e) { setSpeak('speakVolume', Number(e.target.value)); },
        }, SPEAK_VOLUMES.map(function (v) {
          return h('option', { key: String(v.value), value: String(v.value) }, v.label);
        }))
      ),
      h('div', { className: 'qbw-hint' }, '改完点底部「保存」；下一条卡片消息就用新音色。')
    ),

    h(Section, { title: '高级参数', note: '字数 / 超时 / 角色：通常不用改', defaultOpen: false },
      h(Row, { label: '单次最多字数', hint: '超出会被截断（20~2000，默认 120）' },
        h(NumberInput, {
          className: 'qbw-input', step: 10, min: 20, max: 2000,
          value: maxChars,
          placeholder: '120',
          onChange: function (v) { setTts('maxChars', v); },
        })
      ),
      h(Row, { label: '合成超时（毫秒）', hint: '网络慢就调大（5000~180000，默认 60000）' },
        h(NumberInput, {
          className: 'qbw-input', step: 5000, min: 5000, max: 180000,
          value: timeoutMs,
          placeholder: '60000',
          onChange: function (v) { setTts('timeoutMs', v); },
        })
      )
    ),

    h('div', { className: 'qbw-hint' }, '改完点底部「保存」，下次发送自动生效，不用重启 bridge。')
  );
}


/* ══ pages/20-tokens.js ══ */
/* 额度：今日用量 + 分项 / 总额上限（金额、token 两套单位，先到先停）。
   紧凑版原则：每个范围只留「一行输入 + 一行状态」，不再堆大段说明；保存走底部「保存」。 */

const CNY_CHIPS = [1, 3, 5, 10];
const TOKEN_CHIPS = [20e6, 50e6, 100e6, 200e6];

const fmtMoney = (n) => `¥${(Number(n) || 0).toFixed(2)}`;
const fmtTokenNum = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const fmtBudgetValue = (n, unit) => (unit === "cny" ? fmtMoney(n) : `${fmtTokenNum(n)} token`);
const fmtPercent = (r) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);

function parseBudgetInput(text, unit) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (unit === "cny") {
    const cleaned = raw.replace(/[¥￥]/g, "").replace(/(?:人民币|元|块|CNY|cny)/gi, "").replace(/[,\s，]/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
  }
  const cleaned = raw.replace(/(?:tokens?|个)/gi, "").replace(/[,\s，]/g, "").toLowerCase();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)(k|m|b|万|亿)?$/);
  if (!m) return undefined;
  const base = Number(m[1]);
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : m[2] === "万" ? 1e4 : m[2] === "亿" ? 1e8 : 1;
  const n = base * mult;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function formatBudgetInput(value, unit) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return "";
  const n = Number(value);
  if (unit === "cny") return String(Math.round(n * 10000) / 10000);
  if (n >= 1e6 && n % 1e6 === 0) return `${n / 1e6}M`;
  if (n >= 1e4 && n % 1e4 === 0) return `${n / 1e4}万`;
  return String(n);
}

/* 一个范围只用一个输入框；不带 label / hint（说明由外面的行统一表达）。 */
function LimitInput({ unit, value, onChange, disabled }) {
  const [text, setText] = useState(() => formatBudgetInput(value, unit));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatBudgetInput(value, unit));
  }, [value, unit]);
  const commit = (raw) => {
    const parsed = parseBudgetInput(raw, unit);
    if (parsed !== undefined) onChange(parsed);
    return parsed;
  };
  return h("input", {
    className: "qbw-input",
    style: { width: "96px" },
    inputMode: unit === "cny" ? "decimal" : "numeric",
    value: text,
    disabled,
    placeholder: unit === "cny" ? "¥ 不限" : "token 不限",
    onFocus: () => { focused.current = true; },
    onChange: (e) => { setText(e.target.value); commit(e.target.value); },
    onBlur: () => {
      focused.current = false;
      const parsed = commit(text);
      setText(formatBudgetInput(parsed === undefined ? value : parsed, unit));
    },
    onKeyDown: (e) => { if (e.key === "Enter") e.currentTarget.blur(); },
  });
}

/* 一条额度进度条：金额 / token 各自一条，直接显示「已用 / 上限 / 剩余」。 */
function BudgetMeter({ unit, used, limit, ratio, blocked }) {
  const label = unit === "cny" ? "金额" : "token";
  if (limit == null) {
    return h("div", { className: "qbw-budget-meter-empty" },
      h("span", null, `${label} 今日 ${fmtBudgetValue(used, unit)}`),
      h("span", null, "不限"));
  }
  const r = Number.isFinite(Number(ratio)) ? Number(ratio) : (limit > 0 ? (Number(used) || 0) / limit : 0);
  const percent = Math.max(0, Math.min(100, r * 100));
  const remaining = Math.max(0, Number(limit) - (Number(used) || 0));
  return h("div", { className: "qbw-budget-meter" },
    h("div", { className: "qbw-meter-head" },
      h("span", null, label),
      h("b", null, fmtPercent(r)),
      h("span", { className: "qbw-budget-remain" }, `剩 ${fmtBudgetValue(remaining, unit)}`)),
    h("div", { className: "qbw-meter " + (blocked ? "bad" : r >= 0.8 ? "warn" : ""), style: { margin: "4px 0 0" } },
      h("i", { style: { width: `${percent}%` } })));
}

/* 一个范围 = 一张卡：标题 + 状态徽章 + 进度条（金额 / token）+ 输入与快捷。 */
function BudgetScope({ scope, title, usage, limits, ratios, blocked, onChange, disabled, extra = null }) {
  const pair = limits?.[scope] ?? { cny: null, tokens: null };
  const setUnit = (unit, value) => onChange(scope, { ...pair, [unit]: value });
  const add = (unit, amount) => setUnit(unit, Math.round(((pair[unit] ?? 0) + amount) * 10000) / 10000);
  const maxRatio = Math.max(ratios?.cny ?? 0, ratios?.tokens ?? 0);
  const unlimited = pair.cny == null && pair.tokens == null;
  const state = blocked ? "已达上限" : maxRatio >= 0.8 ? "已到 80%" : unlimited ? "不限" : "正常";
  return h("div", { className: "qbw-card" },
    h("h4", null,
      h("span", null, title),
      h(Badge, { kind: blocked ? "bad" : maxRatio >= 0.8 ? "warn" : unlimited ? "" : "ok" }, state)),
    h("div", { className: "qbw-budget-meters" },
      h(BudgetMeter, { unit: "cny", used: usage?.cost, limit: pair.cny, ratio: ratios?.cny, blocked }),
      h(BudgetMeter, { unit: "tokens", used: usage?.tokens, limit: pair.tokens, ratio: ratios?.tokens, blocked })),
    h("div", { className: "qbw-chips" },
      h(LimitInput, { unit: "cny", value: pair.cny, onChange: (v) => setUnit("cny", v), disabled }),
      CNY_CHIPS.map((amount) => h("button", { key: `c${amount}`, type: "button", className: "qbw-chip", disabled, onClick: () => add("cny", amount) }, `+${amount}`)),
      pair.cny != null ? h("button", { key: "cc", type: "button", className: "qbw-chip", disabled, onClick: () => setUnit("cny", null) }, "清空") : null,
      h("span", { style: { width: "10px" } }),
      h(LimitInput, { unit: "tokens", value: pair.tokens, onChange: (v) => setUnit("tokens", v), disabled }),
      TOKEN_CHIPS.map((amount) => h("button", { key: `t${amount}`, type: "button", className: "qbw-chip", disabled, onClick: () => add("tokens", amount) }, `+${amount / 1e6}M`)),
      pair.tokens != null ? h("button", { key: "tc", type: "button", className: "qbw-chip", disabled, onClick: () => setUnit("tokens", null) }, "清空") : null),
    extra);
}

const BUDGET_SCOPES = [
  { id: "qq", title: "QQ" },
  { id: "bili", title: "B站" },
  { id: "tieba", title: "贴吧" },
  { id: "douyin", title: "抖音" },
  { id: "other", title: "其他" },
  { id: "total", title: "总额度" },
];

function TokensPage({ budget, limits, onLimits: onChange, busy, alertedToday }) {
  const [active, setActive] = useState("qq");
  if (!budget || !limits) return h("div", { className: "qbw-hint" }, "正在读取额度与今日用量…");
  const usage = budget.usage ?? {};
  const ratios = budget.ratios ?? {};
  const blocked = budget.blocked ?? {};
  const totalPair = limits.total ?? { cny: null, tokens: null };
  const setScope = (scope, pair) => onChange({ ...limits, [scope]: pair });
  const sum = (unit) => {
    const n = ["qq", "bili", "tieba", "douyin", "other"].reduce((acc, key) => acc + (Number(limits[key]?.[unit]) || 0), 0);
    return n > 0 ? Math.round(n * 10000) / 10000 : null;
  };
  const activeScope = BUDGET_SCOPES.find((item) => item.id === active) ?? BUDGET_SCOPES[0];

  // 每个平台一行：名字 + 百分比 + 已用/上限 + 一条细进度条。
  const platformRow = ({ id, title }) => {
    const pair = limits[id] ?? { cny: null, tokens: null };
    const used = usage[id] ?? {};
    const ratio = ratios[id] ?? {};
    const maxRatio = Math.max(Number(ratio.cny) || 0, Number(ratio.tokens) || 0);
    const unlimited = pair.cny == null && pair.tokens == null;
    const detail = [
      pair.cny != null ? `${fmtMoney(used.cost)} / ${fmtMoney(pair.cny)}` : `${fmtMoney(used.cost)} · 金额不限`,
      pair.tokens != null ? `${fmtTokenNum(used.tokens)} / ${fmtTokenNum(pair.tokens)} token` : `${fmtTokenNum(used.tokens)} · token 不限`,
    ].join(" · ");
    return h("div", { className: "qbw-budget-platform", key: id },
      h("div", { className: "qbw-budget-platform-head" },
        h("b", null, title),
        h("span", null, unlimited ? "不限" : fmtPercent(maxRatio)),
        h("span", { className: "qbw-budget-remain" }, detail)),
      h("div", { className: "qbw-meter " + (blocked[id] ? "bad" : maxRatio >= 0.8 ? "warn" : ""), style: { margin: "4px 0 0" } },
        h("i", { style: { width: `${Math.max(0, Math.min(100, maxRatio * 100))}%` } })));
  };

  return h("div", null,
    h(Card, {
      title: "今日总览",
      right: [
        blocked.total ? h(Badge, { key: "b", kind: "bad" }, "总额已满") : null,
        alertedToday ? h(Badge, { key: "a", kind: "warn" }, "今天已提醒") : null,
      ].filter(Boolean),
    },
      h("div", { className: "qbw-meter-head" },
        h("b", null, fmtMoney(usage.total?.cost)),
        h("span", null, `${fmtTokenNum(usage.total?.tokens)} token`)),
      totalPair.cny != null || totalPair.tokens != null
        ? h("div", { className: "qbw-budget-meters", style: { marginTop: "6px" } },
          h(BudgetMeter, { unit: "cny", used: usage.total?.cost, limit: totalPair.cny, ratio: ratios.total?.cny, blocked: blocked.total }),
          h(BudgetMeter, { unit: "tokens", used: usage.total?.tokens, limit: totalPair.tokens, ratio: ratios.total?.tokens, blocked: blocked.total }))
        : h("div", { className: "qbw-hint", style: { marginTop: "2px" } }, "未设总额度 · 00:00 重置"),
      h("div", { className: "qbw-budget-platforms" },
        BUDGET_SCOPES.filter((item) => item.id !== "total").map(platformRow))),

    // 平台只是数据不同：一套表单 + 一个切换条，不再重复四张卡。
    h("div", { className: "qbw-seg" },
      BUDGET_SCOPES.map((item) => h("button", {
        key: item.id, type: "button", className: active === item.id ? "on" : "",
        onClick: () => setActive(item.id),
      }, item.title))),

    h(BudgetScope, {
      scope: activeScope.id,
      title: activeScope.title,
      usage: usage[activeScope.id],
      limits,
      ratios: ratios[activeScope.id],
      blocked: blocked[activeScope.id],
      onChange: setScope,
      disabled: !!busy,
      extra: activeScope.id === "total"
        ? h("div", { className: "qbw-chips", style: { marginTop: "4px" } },
          h("span", { className: "qbw-hint" }, "快捷："),
          h("button", { type: "button", className: "qbw-chip", disabled: !!busy, onClick: () => setScope("total", { cny: 8, tokens: null }) }, "¥8"),
          h("button", { type: "button", className: "qbw-chip", disabled: !!busy, onClick: () => setScope("total", { cny: null, tokens: 8_000_000 }) }, "8M"),
          h("button", { type: "button", className: "qbw-chip", disabled: !!busy, onClick: () => setScope("total", { cny: sum("cny"), tokens: sum("tokens") }) }, "= 各项之和"),
          h("button", { type: "button", className: "qbw-chip", disabled: !!busy, onClick: () => setScope("total", { cny: null, tokens: null }) }, "清空"))
        : activeScope.id === "tieba"
          ? h("div", { className: "qbw-hint", style: { marginTop: "6px", lineHeight: 1.6 } },
            "贴吧和 B站 共用同一条会话：这里按贴吧回合单独记账，超限时只跳过贴吧部分，不影响 B站。")
          : null,
    }),

    h("div", { className: "qbw-hint", style: { padding: "4px 0" } },
      "切换上方平台即可分别设置；金额和 token 可只填一种，谁先到 100% 就停谁；改完点底部「保存」。"));
}


/* ══ pages/30-align.js ══ */
/* 身份对齐：QQ ⇄ B站 是同一个人的映射；称呼优先于群名片 / B站昵称。 */

function AliasCell({ link, onSave, busy, disabled }) {
  const current = String(link?.label ?? "");
  const [value, setValue] = useState(current);
  useEffect(() => { setValue(current); }, [current]);
  const dirty = value.trim() !== current.trim();
  const commit = () => { if (dirty && !busy && !disabled) onSave(link.id, value.trim()); };
  return h("div", { style: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" } },
    h("input", {
      className: "qbw-input",
      style: { minWidth: "96px", flex: "0 1 120px" },
      placeholder: disabled ? "重启 DSH 后可设" : "设个称呼",
      value,
      disabled: !!disabled,
      onChange: (e) => setValue(e.target.value),
      onKeyDown: (e) => { if (e.key === "Enter") commit(); },
    }),
    dirty && !disabled ? h(Btn, { kind: "qbw-btn2", onClick: commit, disabled: !!busy }, "保存") : null);
}

function AlignPage({ busy, setBusy, toast, reload }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ qqId: "", qqName: "", qqGroups: "", biliId: "", biliName: "", label: "", note: "" });

  const load = useCallback(async () => {
    try { setData(await api("/align")); setErr(""); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const labelsReady = data ? data.labelsSupported === true : true;

  const add = async () => {
    setBusy("align-add");
    try {
      const link = {
        identities: {
          ...(form.qqId ? { qq: { id: form.qqId, name: form.qqName, groups: form.qqGroups.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } } : {}),
          ...(form.biliId ? { bili: { id: form.biliId, name: form.biliName } } : {}),
        },
        label: form.label.trim(),
        source: "manual",
        confidence: 1,
        verified: true,
        note: form.note,
      };
      await api("/align", { method: "POST", body: { action: "add", link } });
      toast(form.label.trim() ? `✓ 已添加对齐：以后只叫「${form.label.trim()}」` : "✓ 已添加对齐");
      setForm({ qqId: "", qqName: "", qqGroups: "", biliId: "", biliName: "", label: "", note: "" });
      await load(); await reload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const act = async (action, id, extra = {}) => {
    setBusy(action + id);
    try { await api("/align", { method: "POST", body: { action, id, ...extra } }); toast("✓ 完成"); await load(); await reload(); }
    catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const saveLabel = async (id, label) => {
    setBusy("align-label-" + id);
    try {
      await api("/align", { method: "POST", body: { action: "update", id, link: { label } } });
      toast(label ? `✓ 以后只叫「${label}」` : "✓ 已清掉称呼");
      await load(); await reload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const scan = async () => {
    setBusy("align-scan");
    try {
      const r = await api("/align", { method: "POST", body: { action: "scan" } });
      toast(`✓ 扫描完成：QQ +${r.qq?.added ?? 0}，B站 +${r.bili?.added ?? 0}`);
      await load(); await reload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), links: data.links }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qq-bili-align-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(String(reader.result ?? "{}"));
        setBusy("align-import");
        await api("/align", { method: "POST", body: { action: "import", payload, merge: true } });
        toast("✓ 已导入");
        await load(); await reload();
      } catch (e) {
        toast(`✗ ${e.message}`);
      } finally {
        setBusy("");
      }
    };
    reader.readAsText(file);
  };

  return h("div", null,
    h("div", { className: "qbw-infobox" },
      "这一层高于记忆同步开关：两边同步都关掉，只要对齐开着，人格卡仍认得出同一个人。",
      "称呼优先于群名片 / B站昵称；在 B站 公开场合禁止写出 QQ 号 / 群号。"),
    labelsReady ? null : h("div", { className: "qbw-warnbox" }, "当前宿主还是旧代码：称呼存不进去，重启 DSH 后可用；其它对齐功能不受影响。"),

    h(Card, { title: "手动添加" },
      h("div", { className: "qbw-hint", style: { marginBottom: "6px" } }, "只有 QQ 或只有 B站 也可以填；称呼留空 = 照旧按昵称叫。"),
      h(Row, { label: "以后只叫 TA（称呼）", hint: "优先于群名片 / B站昵称 / 人格卡称呼表" },
        h("input", { className: "qbw-input", placeholder: "例如 小零", value: form.label, disabled: !labelsReady, onChange: (e) => setForm((s) => ({ ...s, label: e.target.value })) })),
      h(Section, { title: "QQ 侧", collapsible: false },
        h(Row, { label: "QQ 号" }, h("input", { className: "qbw-input", placeholder: "QQ 号", value: form.qqId, onChange: (e) => setForm((s) => ({ ...s, qqId: e.target.value })) })),
        h(Row, { label: "群昵称" }, h("input", { className: "qbw-input", placeholder: "群昵称", value: form.qqName, onChange: (e) => setForm((s) => ({ ...s, qqName: e.target.value })) })),
        h(Row, { label: "所在群号", hint: "逗号分隔，可空" }, h("input", { className: "qbw-input", placeholder: "群号", value: form.qqGroups, onChange: (e) => setForm((s) => ({ ...s, qqGroups: e.target.value })) }))),
      h(Section, { title: "B站侧", collapsible: false },
        h(Row, { label: "B站 mid" }, h("input", { className: "qbw-input", placeholder: "B站 mid", value: form.biliId, onChange: (e) => setForm((s) => ({ ...s, biliId: e.target.value })) })),
        h(Row, { label: "B站昵称" }, h("input", { className: "qbw-input", placeholder: "B站昵称", value: form.biliName, onChange: (e) => setForm((s) => ({ ...s, biliName: e.target.value })) })),
        h(Row, { label: "备注" }, h("input", { className: "qbw-input", placeholder: "可选", value: form.note, onChange: (e) => setForm((s) => ({ ...s, note: e.target.value })) }))),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: add, disabled: !!busy || (!form.qqId && !form.biliId) }, "添加对齐"),
        h(Btn, { kind: "qbw-btn2", onClick: scan, disabled: !!busy }, "扫描候选"),
        h(Btn, { kind: "qbw-btn2", onClick: exportJson, disabled: !!busy }, "导出"),
        h("label", { className: "qbw-btn qbw-btn2", style: { display: "inline-flex", alignItems: "center", cursor: "pointer", height: "30px", padding: "0 12px" } },
          "导入",
          h("input", { type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: (e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; } })))),

    h(AdvancedSettings, { note: "候选对齐 / 自动扫描结果：默认不生效，确认后才写入" },
      h(Section, { title: `候选人（${data?.candidates?.length ?? 0}）`, collapsible: false },
        (data?.candidates ?? []).length === 0
          ? h("div", { className: "qbw-hint", style: { padding: "6px 0" } }, "没有候选。群友在群里说「我B站是…」后点「扫描候选」。")
          : (data.candidates ?? []).map((c) => h("div", { className: "qbw-item", key: c.id },
            h("div", null,
              h("div", { className: "qbw-label" }, `${c.platform === "qq" ? "QQ" : "B站"} ${c.identity?.name || c.identity?.id} → ${c.counterpartPlatform === "qq" ? "QQ" : "B站"} ${c.counterpart?.name || c.counterpart?.id || "（待补）"}`),
              h("div", { className: "qbw-hint" }, `${c.source} · 置信度 ${(Number(c.confidence) || 0).toFixed(2)} · ${c.evidence || ""}`)),
            h("div", { style: { display: "flex", gap: "6px" } },
              h(Btn, { onClick: () => act("approve", c.id), disabled: !!busy }, "确认"),
              h(Btn, { kind: "qbw-btn2", onClick: () => act("reject", c.id), disabled: !!busy }, "否定")))))),

    h(Section, { title: `已对齐（${data?.links?.length ?? 0}）`, note: "QQ ⇄ B站 · 称呼可直接改", defaultOpen: true },
      (data?.links ?? []).length === 0
        ? h("div", { className: "qbw-hint", style: { padding: "6px 0" } }, "还没有对齐记录。")
        : (data.links ?? []).map((link) => h("div", { className: "qbw-item", key: link.id },
          h("div", { style: { minWidth: 0 } },
            h("div", { className: "qbw-label" }, "QQ ", link.identities?.qq?.name || "?", h("span", { className: "qbw-hint" }, link.identities?.qq?.id ?? ""), " ⇄ B站 ", link.identities?.bili?.name || "?", h("span", { className: "qbw-hint" }, link.identities?.bili?.id ?? "")),
            h("div", { className: "qbw-hint" }, `来源 ${link.source || "manual"}`)),
          h("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
            h(AliasCell, { link, onSave: saveLabel, busy: !!busy, disabled: !labelsReady }),
            // 删除是对齐表里唯一不可撤回的操作（角色页/记忆页的删除都有二次确认），
            // 这里原来一点就删，容易误触。
            h(Btn, {
              kind: "qbw-btn2",
              disabled: !!busy,
              onClick: () => {
                if (!confirm("删除这条对齐记录？删掉之后两边会被当成不同的人。")) return;
                act("remove", link.id);
              },
            }, "删除"))))),
    err ? h("div", { className: "qbw-err" }, err) : null);
}


/* ══ pages/60-diag.js ══ */
/* 诊断：体检结果 / 路径 / 备份与日志。 */

function DiagPage({ busy, setBusy, toast, reload }) {
  const [diag, setDiag] = useState(null);
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState("");
  const [backups, setBackups] = useState([]);

  // toast 每次渲染都是新函数：用 ref 固定，避免 useEffect([load]) 反复触发体检。
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const load = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("diag-refresh");
    try {
      setDiag(await api("/diagnostics"));
      setErr("");
      if (manual) toastRef.current?.("✓ 已重新体检");
    } catch (e) {
      setErr(e.message);
      if (manual) toastRef.current?.(`✗ 体检失败：${e.message}`);
    } finally {
      try { setBackups((await api("/config")).backups ?? []); } catch { /* 旧宿主没有 backups */ }
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadLogs = async () => {
    setBusy("logs");
    try { setLogs(await api("/logs?lines=160")); }
    catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const doctorFix = async () => {
    setBusy("doctor");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "doctor-fix" } });
      const changed = r.changed ?? [];
      toast(changed.length ? `✓ 已补齐：${changed.join("、")}${r.restartRequired ? "（重启 DSH 生效）" : ""}` : "✓ 没有需要补的");
      await load();
    } catch (e) {
      toast(`✗ ${/未知 action/.test(String(e.message)) ? "后端还是旧版本：关掉 DSH 再开一次，让插件加载新代码" : e.message}`);
    } finally { setBusy(""); }
  };

  const backupAll = async () => {
    setBusy("backup");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "backup" } });
      toast(`✓ 已备份 ${r.created?.length ?? 0} 个文件`);
      await load();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const restore = async (name) => {
    if (!confirm(`确定用备份 ${name} 覆盖当前文件？会先自动备份当前文件。`)) return;
    setBusy("restore");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "restore", name } });
      toast(`✓ 已恢复 ${r.target}`);
      await load();
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const checkRows = (diag?.checks ?? []).map((c) => {
    const kind = c.level === "warn" ? "warn" : c.ok ? "ok" : "bad";
    return h(SRow, {
      key: c.name,
      title: c.name,
      dot: kind,
      actions: h(Badge, { kind }, c.level === "warn" ? "注意" : c.ok ? "正常" : "缺失"),
      meta: [c.detail || null, c.fix ? `怎么补：${c.fix}` : null],
    });
  });
  return h("div", null,
    h("div", { className: "qbw-actions", style: { borderTop: "none", marginTop: 0, paddingTop: 0 } },
      h(Btn, { kind: "qbw-btn2", onClick: doctorFix, disabled: !!busy }, busy === "doctor" ? "配置中…" : "只补缺失项"),
      h(Btn, { kind: "qbw-btn2", onClick: () => load({ manual: true }), disabled: !!busy }, busy === "diag-refresh" ? "体检中…" : "重新体检"),
      h(Btn, { kind: "qbw-btn2", onClick: backupAll, disabled: !!busy }, "备份全部配置")),

    diag
      ? h("div", null,
        h(Card, { title: "体检", right: h(Badge, { kind: diag.ok ? "ok" : "bad" }, diag.ok ? "通过" : "有项不可用") }, checkRows),
        h(Card, { title: "路径" },
          Object.entries(diag.paths ?? {}).map(([k, v]) => h(PathLine, { key: k, label: k, path: String(v) }))))
      : h("div", { className: "qbw-hint", style: { padding: "16px 0" } }, "体检中…"),

    h(AdvancedSettings, { note: "备份恢复 / 插件与桥接日志：排障时再展开" },
      h("div", { className: "qbw-actions" }, h(Btn, { kind: "qbw-btn2", onClick: loadLogs, disabled: !!busy }, busy === "logs" ? "读取中…" : "读取日志")),
      h(Section, { title: `备份（${backups.length}）`, note: "写文件前自动生成", collapsible: false },
        backups.slice(0, 20).map((b) => h("div", { className: "qbw-item", key: b.name },
          h("div", null,
            h("div", { className: "qbw-label" }, b.name),
            h("div", { className: "qbw-hint" }, `${fmtBytes(b.bytes)} · ${fmtTime(b.mtime)}`)),
          h(Btn, { kind: "qbw-btn2", onClick: () => restore(b.name), disabled: !!busy }, "恢复")))),
      logs
        ? h("div", null,
          h("div", { className: "qbw-group" }, "插件日志"),
          h("div", { className: "qbw-out" }, logs.plugin || "（空）"),
          h("div", { className: "qbw-group" }, "桥接日志"),
          h("div", { className: "qbw-out" }, logs.bridge || "（空）"))
        : null),

    err ? h("div", { className: "qbw-err" }, err) : null);
}


/* ══ pages/70-overview.js ══ */
/* 概览（运行状态）/ 安装与更新：一页两视图，互不挤在一起。 */

function OverviewPage({ view = "home", overview, reload, busy, setBusy, toast, goTab, autoStart, openConsole }) {
  const bridge = overview?.bridge ?? {};
  const biliStatus = overview?.bili ?? {};
  const memory = overview?.memory ?? {};
  const align = overview?.alignment ?? {};
  const scheduler = overview?.scheduler ?? {};
  const snow = overview?.snowluma ?? {};
  // 网关是独立进程：桥接在跑 ≠ 消息发得出去（3100 能应答只说明桥接活着）。
  const gateway = bridge?.snowluma ?? {};
  const gatewayConnected = gateway.connected === true;
  const platformStart = overview?.platformStart ?? {};
  const qqStart = platformStart.qq !== false;
  const biliStart = platformStart.bili !== false;
  const tieba = overview?.tieba ?? {};
  const douyin = overview?.douyin ?? {};

  const [gates, setGates] = useState(null);
  const [snowError, setSnowError] = useState(null);
  const [snowImport, setSnowImport] = useState(false);

  // toast 是宿主每次渲染新建的函数：用 ref 固定住，避免定时器/useCallback 每次渲染都重建。
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const say = (msg) => { try { toastRef.current?.(msg); } catch { /* 宿主没给 toast 时忽略 */ } };

  const loadGates = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("gates-refresh");
    try {
      const r = await api("/gate-events?limit=30&includeAcked=0");
      setGates(r);
      if (manual) say(`✓ 已刷新：未确认 ${(r.events ?? []).length} 条`);
    } catch (e) {
      // 手动刷新失败要说话；自动轮询失败保持旧数据，别把页面清空成「没数据」
      if (manual) say(`✗ 刷新失败：${e.message}`);
    } finally {
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { if (view === "home") loadGates(); }, [view, loadGates]);

  const act = async (action) => {
    setBusy(action);
    try {
      const res = await api("/bridge", { method: "POST", body: { action } });
      toast(res.ok ? `✓ ${res.message ?? "完成"}` : `✗ ${res.error ?? "失败"}`);
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  // 全部停止：QQ 桥接 + B站 一起停（和顶部「一键开始」对称，只有一个入口）。
  const stopAll = async () => {
    setBusy("stop-all");
    try {
      const res = await api("/bridge", { method: "POST", body: { action: "stop-selected", components: ["qq", "bili"] } });
      const bad = (res.items ?? []).filter((x) => !x.ok);
      say(bad.length
        ? `✗ ${bad.length} 项没停下：${bad.map((x) => `${x.label}（${x.error || ""}）`).join("、")}`
        : `✓ 已全部停止${(res.items ?? []).length ? `：${res.items.map((x) => x.label).join("、")}` : ""}`);
      await reload();
    } catch (e) { say(`✗ 全部停止失败：${e.message}`); } finally { setBusy(""); }
  };

  const [snowScan, setSnowScan] = useState(null);
  // 面板直连 SnowLuma 控制台：账号 + QQ 注入进程，全部在设置页里操作。
  const [snowApi, setSnowApi] = useState(null);
  const [webuiPwd, setWebuiPwd] = useState("");
  // 配好一次之后向导收起来，日常只剩「加/删账号」——像 DSH 配好模型后直接用。
  const [forceWizard, setForceWizard] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const loadSnowApi = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("snow-refresh");
    try {
      const r = await api("/snowluma");
      setSnowApi(r);
      if (manual) {
        say(`✓ 已刷新：账号 ${(r.accounts ?? []).length} 个 · 进程 ${(r.processes ?? []).length} 个${r.note ? `（${r.note}）` : ""}`);
      }
    } catch (e) {
      // 关键：失败时**保留上一次的数据**。之前这里 setSnowApi(null)，网络抖一下就误报「控制台没在运行」。
      if (manual) say(`✗ 刷新失败：${e.message}`);
    } finally {
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { if (view === "home") loadSnowApi(); }, [view, loadSnowApi]);
  // 向导进度自己走（账号登录 / 注入完成后不用手动刷新）
  useEffect(() => {
    if (view !== "home") return undefined;
    const timer = setInterval(() => { void loadSnowApi(); }, 20_000);
    return () => clearInterval(timer);
  }, [view, loadSnowApi]);
  const connectWebui = async () => {
    setBusy("webui-login");
    try {
      await api("/snowluma", { method: "POST", body: { action: "login", password: webuiPwd } });
      setWebuiPwd("");
      toast("✓ 已连上 SnowLuma 控制台");
      await loadSnowApi();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const processAct = async (action, pid) => {
    setBusy("proc");
    try {
      const r = await api("/snowluma", { method: "POST", body: { action, pid } });
      toast(`✓ ${r.message ?? "完成"}`);
      await loadSnowApi();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const forgetWebui = async () => {
    setBusy("webui-logout");
    try {
      await api("/snowluma", { method: "POST", body: { action: "logout" } });
      toast("已断开 SnowLuma 控制台，密码已清除");
      await loadSnowApi();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const scanSnow = async () => {
    setBusy("snow-scan");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "install-scan" } });
      setSnowScan(r);
      const s = r?.snow ?? {};
      toast(r?.ok ? `✓ 已连上 SnowLuma：${s.nickname || "?"}${s.uin ? `（${s.uin}）` : ""} · 群 ${(r.groups ?? []).length} 个` : `✗ ${r?.error || "没连上 SnowLuma"}`);
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const applySnow = async () => {
    setBusy("snow-apply");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "install-apply", discoverSnow: true } });
      toast(`✓ ${(r?.changed ?? []).join("、") || "已写入"}${r?.needRestart ? "（重启桥接后生效）" : ""}`);
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };

  const detectSnow = async (picked = "") => {
    setBusy("detect");
    try {
      const r = await api("/bridge", { method: "POST", body: { action: "detect-snowluma", ...(picked ? { path: picked } : {}) } });
      if (r.ok) { toast(`✓ ${r.message}`); await reload(); }
      else setSnowError({ title: r.title || "没找到 SnowLuma", message: r.error || "没找到 SnowLuma", hint: r.hint || "", tried: r.tried ?? [] });
    } catch (e) {
      setSnowError({ title: "检测失败", message: e.message, hint: "确认 DSH 插件正常后重试；也可以直接选目录。" });
    } finally { setBusy(""); }
  };
  const pickSnow = async (mode) => {
    setSnowImport(false);
    const r = await browseNative(mode, mode === "file" ? "选择 SnowLuma 的启动文件（SnowLuma.exe 或 app\\launcher.bat）" : "选择 SnowLuma2 根目录（里面有 app）");
    if (r.ok && r.path) await detectSnow(String(r.path));
    else if (!r.cancelled) toast(`✗ ${r.error || "打不开选择框"}`);
  };
  const ackGates = async (id) => {
    try {
      await api("/gate-events", { method: "POST", body: id ? { ids: [id] } : { all: true } });
      say(id ? "✓ 已确认这条提醒" : "✓ 已全部确认");
      await loadGates();
    } catch (e) { say(`✗ 确认失败：${e.message}`); }
  };

  const buckets = [];
  for (const ev of gates?.events ?? []) {
    const text = ev.impact || ev.reason?.message || ev.event || "";
    const key = `${ev.level}|${ev.gate}|${text}`;
    const hit = buckets.find((b) => b.key === key);
    if (hit) hit.count += 1; else buckets.push({ key, count: 1, ev, text });
  }

  if (view === "home") {
    // 步骤逻辑在 01-core 的 buildSetupSteps（可单测）：核心完成条件 = 桥接在跑且网关连通。
    const webuiUp = Boolean(snowApi?.webui?.up);
    const accounts = snowApi?.accounts ?? [];
    const processes = snowApi?.processes ?? [];
    const firstFree = processes.find((p) => !(p.loaded === true || p.injected === true || p.hooked === true) && p.pid);
    const wizard = buildSetupSteps({
      launcherPath: snow.launcherPath,
      detected: snow.detected === true,
      webuiUp,
      hasPassword: Boolean(snowApi?.hasPassword),
      accounts,
      bridgeRunning: Boolean(bridge.running),
      gatewayConnected,
      processPid: firstFree?.pid ?? null,
    });
    const steps = wizard.steps;
    const currentStep = steps.find((s) => !s.done);
    const doneCount = steps.filter((s) => s.done).length;
    const configured = wizard.ready;
    const runStep = (id) => {
      if (id === "detect") return detectSnow();
      if (id === "start-snowluma") return act("start-snowluma");
      if (id === "process-load") return processAct("process-load", firstFree?.pid);
      if (id === "refresh") return loadSnowApi({ manual: true });
      if (id === "auto-start") return autoStart();
      return undefined;
    };
    const loadedList = processes.filter((p) => p.loaded === true || p.injected === true || p.hooked === true);
    // 日常操作：加账号 = 注入一个没注入的 QQ 进程（之后手机扫码）；删账号 = 取消注入。
    const addAccount = async () => {
      if (firstFree) { await processAct("process-load", firstFree.pid); return; }
      toast("先打开 QQ 停在登录页（要加哪个号就登录哪个号），再点「+ 添加账号」");
      await loadSnowApi({ manual: true });
    };
    return h("div", null,
      configured && !forceWizard
        ? h(Card, {
          title: "SnowLuma 已就绪",
          right: h("div", { style: { display: "inline-flex", gap: "6px" } },
            h(Btn, { kind: "qbw-btn3", onClick: () => loadSnowApi({ manual: true }), disabled: !!busy }, busy === "snow-refresh" ? "刷新中…" : "刷新"),
            h(Btn, { kind: "qbw-btn3", onClick: () => setForceWizard(true) }, "重新配置")),
        },
          h("div", { className: "qbw-meta" },
            h("span", null, `● 账号 ${accounts.length || (gatewayConnected ? 1 : 0)} 个`),
            h("span", null, `● 网关 ${gatewayConnected ? "已连接" : "未连接"}`),
            h("span", null, `● 控制台 ${webuiUp ? "运行中" : "未运行"}`)),
          accounts.length
            ? h("div", { className: "qbw-meta" }, accounts.map((a) => h("span", { key: a.uin }, `${a.nickname || "QQ"}（${a.uin}）${a.online ? " · 在线" : ""}`)))
            : (gatewayConnected
              ? h("div", { className: "qbw-hint" }, "已登录（网关已连通）；账号明细没读到就点「刷新」或启用面板管账号")
              : h("div", { className: "qbw-hint" }, "还没有账号：点「+ 添加账号」")),
          h("div", { className: "qbw-actions" },
            h(Btn, { onClick: addAccount, disabled: !!busy }, busy === "proc" ? "处理中…" : "+ 添加账号"),
            h(Btn, { kind: "qbw-btn3", onClick: openConsole, disabled: !!busy }, "打开控制台"),
            wizard.optional.done ? null : h(Btn, {
              kind: "qbw-btn3",
              onClick: () => { setForceWizard(true); setShowPwd(true); },
              disabled: !!busy,
            }, "启用面板管账号")),
          h("div", { className: "qbw-hint" },
            wizard.optional.done
              ? "面板内管账号：已启用（加号 / 退号都在这里）"
              : "面板内管账号：未启用（可选，填一次控制台密码即可，不影响正常收发）"),
          loadedList.length
            ? h("div", null, loadedList.map((p) => h(SRow, {
              key: String(p.pid),
              title: `已注入 ${p.name || "QQ"} · PID ${p.pid}`,
              dot: "ok",
              dotText: "运行中",
              actions: h(Btn, { kind: "qbw-btn3", onClick: () => processAct("process-unload", p.pid), disabled: !!busy }, "退出"),
            })))
            : null,
          h("div", { className: "qbw-hint" }, "日常只需要这两件事：加账号（点一下后手机扫码）、退出账号（点「退出」）。"))
        : null,
      (configured && !forceWizard) ? null : h(Card, {
        title: "上手向导",
        right: h(Badge, { kind: currentStep ? "warn" : "ok" }, currentStep ? `${doneCount}/${steps.length} 步 · 还剩 ${steps.length - doneCount} 步` : "全部完成"),
      },
        h("div", { className: "qbw-hint" },
          currentStep ? `下一步：第 ${steps.indexOf(currentStep) + 1} 步「${currentStep.label}」—— 点右边按钮就行` : "全部就绪，可以直接用了"),
        steps.map((s, i) => h(SRow, {
          key: s.id,
          title: `${i + 1}. ${s.label}`,
          dot: s.done ? "ok" : "",
          dotText: s.done ? "已完成" : (s === currentStep ? "现在做这一步" : "等上一步"),
          meta: s.hint ? [h("span", { key: "h" }, s.hint)] : null,
          actions: (!s.done && s === currentStep) ? h(Btn, { onClick: () => runStep(s.actionId), disabled: !!busy }, s.actionLabel) : null,
        })),
        // 可选增强：面板内加/删账号。未启用也不影响「已就绪」，只是日常要开它的网页。
        h(SRow, {
          title: `（可选）${wizard.optional.label}`,
          dot: wizard.optional.done ? "ok" : "",
          dotText: wizard.optional.done ? "已启用" : "可选",
          meta: [h("span", { key: "h" }, wizard.optional.hint)],
          actions: wizard.optional.done ? null : (showPwd
            ? h("div", { className: "qbw-actions" },
              h("input", {
                className: "qbw-input", type: "password", style: { flex: "1 1 180px" },
                placeholder: "SnowLuma 控制台密码", value: webuiPwd,
                onChange: (e) => setWebuiPwd(e.target.value),
              }),
              h(Btn, { onClick: connectWebui, disabled: !!busy || !webuiPwd }, busy === "webui-login" ? "连接中…" : "连上控制台"))
            : h(Btn, { kind: "qbw-btn3", onClick: () => setShowPwd(true) }, "填密码")),
        }),
        h("div", { className: "qbw-hint" }, "所有步骤都在这个面板里完成；只有 QQ 扫码必须你本人用手机扫（腾讯侧限制）。"),
        configured ? h("div", { className: "qbw-actions" },
          h(Btn, { kind: "qbw-btn3", onClick: () => setForceWizard(false) }, "收起向导（已经配好了）")) : null),
      h(Card, {
        title: "运行状态",
        right: h(Btn, { kind: "qbw-btn3", onClick: stopAll, disabled: !!busy }, busy === "stop-all" ? "停止中…" : "全部停止"),
      },
        h(SRow, {
          title: "QQ 桥接",
          dot: bridge.running ? (bridge.ok ? "ok" : "warn") : "",
          dotText: bridge.running ? (bridge.ok ? "运行中" : "异常") : "未运行",
          actions: [
            h(Btn, { key: "s", onClick: () => act("start"), disabled: !!busy || bridge.running }, "启动"),
            h(Btn, { key: "r", kind: "qbw-btn2", onClick: () => act("restart"), disabled: !!busy }, "重启"),
            h(Btn, { key: "t", kind: "qbw-btn2", onClick: () => act("stop"), disabled: !!busy || !bridge.running }, "停止"),
          ],
          meta: [
            h("span", { key: "p" }, "端口 ", h("b", null, bridge.port ?? "—")),
            h("span", { key: "m" }, "模式 ", h("b", null, overview?.mode?.effective ?? overview?.mode?.local ?? bridge.mode ?? "—")),
            h("span", { key: "w" }, "白名单 ", h("b", null, `群 ${overview?.mode?.allowGroups ?? 0} · 私 ${overview?.mode?.allowPrivate ?? 0}`)),
          ],
        }),
        h(SRow, {
          title: "B站记忆",
          dot: biliStatus.available ? "ok" : (biliStatus.enabled ? "warn" : ""),
          dotText: biliStatus.available ? "已生成" : "暂无",
          actions: h(Btn, {
            kind: "qbw-btn2", disabled: !!busy,
            onClick: async () => {
              setBusy("refresh-bili");
              try {
                const r = await api("/memory", { method: "POST", body: { action: "refresh-bili" } });
                toast(r.ok ? "✓ B站记忆已刷新" : `✗ ${r.error ?? "失败"}`);
                await reload();
              } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
            },
          }, "刷新"),
          meta: [
            h("span", { key: "b" }, "简报 ", h("b", null, `${biliStatus.briefChars ?? 0} 字`)),
            h("span", { key: "p" }, "隐私 ", h("b", null, biliStatus.blocked ? "命中已拦截" : "通过")),
            h("span", { key: "s" }, "同步 ", h("b", null, biliStatus.enabled ? "开" : "关")),
            h("span", { key: "t" }, fmtTime(biliStatus.generatedAt)),
          ],
        }),
        h(SRow, {
          title: "生物钟",
          dot: scheduler.running ? "ok" : "",
          dotText: scheduler.running ? "在跑" : "已停",
          actions: h(Btn, { kind: "qbw-btn3", onClick: () => goTab?.("memory") }, "记忆 / 对齐"),
          meta: [
            h("span", { key: "a" }, "对齐 ", h("b", null, `${align.links ?? 0} 条 / 候选 ${align.candidates ?? 0}`)),
            h("span", { key: "q" }, "QQ→B站 ", h("b", null, memory.qqToBili?.enabled ? "开" : "关")),
            h("span", { key: "b" }, "B站→QQ ", h("b", null, memory.biliToQq?.enabled ? "开" : "关")),
          ],
        }),
        h(SRow, {
          title: "SnowLuma 网关",
          dot: gatewayConnected ? "ok" : (bridge.running ? "warn" : ""),
          dotText: gatewayConnected ? "已连接" : (bridge.running ? "未连接" : "未启动"),
          meta: [
            h("span", { key: "st" }, "状态 ", h("b", null, gatewayConnected ? "网关已连上，消息能发出去" : "网关没连上，消息发不出去")),
            snow.webui?.url ? h("span", { key: "w" }, "控制台 ", h("b", null, `${snow.webui.url}${snow.webui.up ? "" : "（未启动）"}`)) : null,
            !gatewayConnected && (snow.diagnosis?.hint || gateway.hint)
              ? h("span", { key: "h" }, snow.diagnosis?.hint || gateway.hint) : null,
          ],
        })),

      // ── SnowLuma 账号（面板直连控制台，不用再开它的网页）──────────────────────
      // 配好后日常视图已经管账号了，这张卡只在向导/重配时出现，避免重复入口。
      (configured && !forceWizard) ? null : h(Card, {
        title: "SnowLuma 账号",
        right: h(Btn, { kind: "qbw-btn3", onClick: () => loadSnowApi({ manual: true }), disabled: !!busy }, busy === "snow-refresh" ? "刷新中…" : "刷新"),
      },
        !snowApi?.webui?.up
          ? h("div", { className: "qbw-hint" }, snowApi?.note || "SnowLuma 控制台没在运行：按上面向导第 2 步启动")
          : !snowApi?.hasPassword
            ? h("div", null,
              accounts.length
                ? h("div", { className: "qbw-meta" }, accounts.map((a) => h("span", { key: a.uin }, `● ${a.nickname || "QQ"}（${a.uin}）${a.online ? " · 在线" : ""}`)))
                : h("div", { className: "qbw-hint" }, "还没发现账号：先把 QQ 打开登录，再点「刷新」"),
              h("div", { className: "qbw-hint" }, "上面的账号来自 SnowLuma 的本地配置（不用密码也能看到）；要在这个面板里加号/退号，填一次控制台密码即可（可选）。"),
              showPwd
                ? h("div", { className: "qbw-actions" },
                  h("input", {
                    className: "qbw-input", type: "password", style: { flex: "1 1 180px" },
                    placeholder: "SnowLuma 控制台密码", value: webuiPwd,
                    onChange: (e) => setWebuiPwd(e.target.value),
                  }),
                  h(Btn, { onClick: connectWebui, disabled: !!busy || !webuiPwd }, busy === "webui-login" ? "连接中…" : "连上控制台"))
                : h("div", { className: "qbw-actions" },
                  h(Btn, { kind: "qbw-btn3", onClick: () => setShowPwd(true) }, "填密码（可选）")))
            : h("div", null,
              (snowApi.accounts ?? []).length
                ? h("div", { className: "qbw-meta" }, snowApi.accounts.map((a) => h("span", { key: a.uin }, `● ${a.nickname || "?"}（${a.uin}）`)))
                : h("div", { className: "qbw-hint" }, "还没有已登录的 QQ 账号：在下面把 QQ 进程注入后扫码登录"),
              (snowApi.processes ?? []).slice(0, 6).map((p, i) => {
                const loaded = p.loaded === true || p.injected === true || p.hooked === true;
                return h(SRow, {
                  key: String(p.pid ?? i),
                  title: `${p.name || p.title || "QQ"} · PID ${p.pid ?? "?"}`,
                  dot: loaded ? "ok" : "",
                  dotText: loaded ? "已注入" : "未注入",
                  actions: h(Btn, {
                    kind: loaded ? "qbw-btn2" : "",
                    disabled: !!busy || !p.pid,
                    onClick: () => processAct(loaded ? "process-unload" : "process-load", p.pid),
                  }, loaded ? "取消注入" : "注入到 SnowLuma"),
                });
              }),
              (snowApi.processes ?? []).length
                ? null
                : h("div", { className: "qbw-hint" }, "没发现 QQ 进程：先把 QQ 打开停在登录页，再点右上角「刷新」"),
              h("div", { className: "qbw-actions" },
                h(Btn, { kind: "qbw-btn3", onClick: forgetWebui, disabled: !!busy }, "断开控制台（清除密码）"),
                snowApi.error ? h("span", { className: "qbw-hint" }, snowApi.error) : null))),

      buckets.length
        ? h(Card, {
          title: "安全提醒",
          right: h("div", { style: { display: "inline-flex", gap: "6px", alignItems: "center" } },
            h(Badge, { kind: (gates?.counts?.L3 ?? 0) > 0 ? "bad" : "warn" }, `未确认 ${gates?.counts?.unacked ?? 0} 条`),
            h(Btn, { kind: "qbw-btn3", onClick: () => loadGates({ manual: true }), disabled: !!busy }, busy === "gates-refresh" ? "刷新中…" : "刷新")),
        },
          buckets.slice(0, 4).map(({ key, count, ev, text }) => h(SRow, {
            key,
            title: `${ev.level} · ${ev.gate}`,
            dot: ev.level === "L3" ? "bad" : "warn",
            actions: [
              count > 1 ? h(Badge, { key: "c" }, `×${count}`) : null,
              h(Badge, { key: "a", kind: ev.ack ? "ok" : "warn" }, ev.ack ? "已确认" : "未确认"),
              h(Btn, { key: "k", kind: "qbw-btn3", onClick: () => ackGates(ev.id) }, "确认"),
            ],
            meta: text ? [text] : null,
          })),
          h("div", { className: "qbw-hint" }, "L0 静默、L1 仅记录；L2/L3 才弹窗。"),
          h("div", { className: "qbw-actions" },
            h(Btn, { kind: "qbw-btn2", onClick: () => ackGates(null), disabled: !(gates?.counts?.unacked > 0) }, "全部确认")))
        : null,
      h(Card, {
        title: "贴吧 · 抖音",
        note: "只读运行状态；登录、时段、额度等具体设置在「平台」页。",
      },
        h(SRow, {
          title: "贴吧",
          dot: tieba.verifiedAt ? "ok" : (tieba.hasBduss ? "warn" : ""),
          dotText: tieba.verifiedAt ? "已登录" : (tieba.hasBduss ? "已配置" : "未登录"),
          meta: [
            tieba.user ? `账号 ${tieba.user}` : null,
            `上次心跳 ${fmtTime(tieba.lastPromptAt)}`,
            `上次互动 ${fmtTime(tieba.lastActionAt)}`,
            tieba.lastSummary ? `上次总结：${tieba.lastSummary}` : null,
            tieba.error ? `读取失败：${tieba.error}` : null,
          ].filter(Boolean),
        }),
        h(SRow, {
          title: "抖音",
          dot: douyin.browser?.running ? "ok" : (douyin.login?.persisted ? "warn" : ""),
          dotText: douyin.browser?.running
            ? "窗口运行中"
            : (douyin.login?.persisted ? "已登录 · 窗口关着" : "未登录"),
          meta: [
            douyin.config?.enabled
              ? (douyin.policy?.allowed ? "允许刷：开" : `允许刷：被拦（${douyin.policy?.reason || "时段/额度"}）`)
              : "允许刷：关",
            douyin.policy?.daily ? `今天已看 ${Math.round((Number(douyin.policy.daily.usedSeconds) || 0) / 60)} 分钟` : null,
            douyin.watching ? "正在刷" : null,
            douyin.config?.silent ? "静默" : null,
            douyin.error ? `读取失败：${douyin.error}` : null,
          ].filter(Boolean),
        })),

      qqStart ? null : h("div", { className: "qbw-warnbox" }, "QQ 平台在配置里是关闭状态：桥接不会自动启动。"),
      biliStart ? null : h("div", { className: "qbw-warnbox" }, "B站 平台在配置里是关闭状态：生物钟不会自动醒来。"));
  }

  // ── 安装与维护 ──────────────────────────────────────────────────────────
  return h("div", null,
    h("div", { className: "qbw-infobox" }, "只管 SnowLuma 安装与诊断体检；更新 dsh-Dfy 请直接 git pull。"),

    h(Card, { title: "SnowLuma 安装" },
      (bridge.running && snow.everConnected === true && snow.diagnosis?.state && snow.diagnosis.state !== "ok")
        ? h("div", { className: "qbw-err" }, `连接异常（${snow.diagnosis.state}）：${snow.diagnosis.hint || "检查 SnowLuma 是否运行并已登录"}`)
        : null,
      h("p", null, "第一次使用：下载官方 SnowLuma2 → 解压 → 点「检测已安装的 SnowLuma」→ 启动 QQ 并扫码。"),
      h(KV, { label: "当前安装目录" }, snow.launcherPath || "未设置"),
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: () => window.open(snow.downloadUrl || "https://github.com/SnowLuma/SnowLuma/releases/latest", "_blank", "noopener") }, "官方下载页"),
        h(Btn, { onClick: () => detectSnow(), disabled: !!busy }, "检测已安装的 SnowLuma"),
        h(Btn, { kind: "qbw-btn2", onClick: () => setSnowImport(true), disabled: !!busy }, "手动选择"),
        h(Btn, { kind: "qbw-btn2", onClick: () => act("start-snowluma"), disabled: !!busy }, "只打开 SnowLuma")),
      h("div", { className: "qbw-hint" }, "「手动选择」只是告诉插件你装好的 SnowLuma 在哪：不下载、不安装、不移动、不删除任何文件。"),
      h(KV, { label: "控制台（扫码登录 / 加账号）" },
        snow.webui ? `${snow.webui.url}${snow.webui.up ? "（就绪）" : "（未启动）"}` : "未知"),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => act("open-snowluma-webui"), disabled: !!busy }, "打开 SnowLuma 控制台"),
        h(Btn, { kind: "qbw-btn2", onClick: scanSnow, disabled: !!busy }, busy === "snow-scan" ? "扫描中…" : "扫描当前账号"),
        h(Btn, { kind: "qbw-btn2", onClick: applySnow, disabled: !!busy }, busy === "snow-apply" ? "写入中…" : "按扫描结果写入配置")),
      snowScan ? h("div", { className: "qbw-meta" },
        snowScan?.snow ? h("span", { key: "a" }, `账号 ${snowScan.snow.nickname || "?"}（${snowScan.snow.uin || "?"}） · ${snowScan.snow.httpUrl || "—"}`) : null,
        h("span", { key: "g" }, `群 ${(snowScan.groups ?? []).length} 个`)) : null,
      h("div", { className: "qbw-hint" }, "扫二维码 / 添加 QQ 账号只能在 SnowLuma 自己的控制台里做（它要注入 QQ 进程，插件不能代做）；这里负责把「当前登录的账号」写进 dsh-Dfy 配置，省得手抄 token。")),

    h(Section, { title: "诊断与体检", note: "体检 / 路径 / 备份与日志：排障时再展开", defaultOpen: false },
      h(DiagPage, { busy, setBusy, toast, reload })),

    snowImport ? h(Modal, { title: "导入 SnowLuma 的安装位置", onClose: () => setSnowImport(false) },
      h("p", null, "这里导入的是你已经装好的 SnowLuma 的启动文件，不是安装包；不会下载、安装、移动或删除任何文件。"),
      h("ul", { style: { paddingLeft: "18px", fontSize: "12px", lineHeight: "20px" } },
        h("li", null, "SnowLuma.exe —— SnowLuma2 目录里的主程序"),
        h("li", null, "app\\launcher.bat —— 标准布局里的启动脚本"),
        h("li", null, "解压出来的 SnowLuma2 根目录")),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => pickSnow("file"), disabled: !!busy }, "选择文件…"),
        h(Btn, { kind: "qbw-btn2", onClick: () => pickSnow("dir") }, "选择目录"),
        h(Btn, { kind: "qbw-btn2", onClick: () => setSnowImport(false) }, "取消"))) : null,

    snowError ? h(Modal, { title: snowError.title, onClose: () => setSnowError(null) },
      h("p", null, snowError.message),
      snowError.hint ? h("p", { className: "qbw-hint" }, snowError.hint) : null,
      (snowError.tried ?? []).length ? h("div", { className: "qbw-out" }, snowError.tried.join("\n")) : null,
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => { setSnowError(null); pickSnow("dir"); } }, "浏览…选择目录"),
        h(Btn, { kind: "qbw-btn2", onClick: () => window.open(snow.downloadUrl || "https://github.com/SnowLuma/SnowLuma/releases/latest", "_blank", "noopener") }, "打开下载页"),
        h(Btn, { kind: "qbw-btn2", onClick: () => setSnowError(null) }, "关闭"))) : null);
}


/* ══ pages/80-bili.js ══ */
/* 养鱼（B站）：账号 / 扫码 / 运行状态 / 常用设置 / 分享与历史 / 全部参数。 */

// 高频设置：放在首屏直接改；其余（额度、四类动态、鱼群、监听、日记等）收进「全部 B站 参数」。
const BILI_COMMON_GROUP_NAMES = ["作息", "口味（文本）", "分享"];
const BILI_COMMON_GROUPS = BILI_FIELDS.filter((g) => BILI_COMMON_GROUP_NAMES.includes(g.group));
const BILI_MORE_GROUPS = BILI_FIELDS.filter((g) => !BILI_COMMON_GROUP_NAMES.includes(g.group));

// 有界数值改成下拉预设：少打字、少出错，也比一排数字输入框紧凑。
const BILI_NUM_SELECTS = {
  "night.skipChance": [[0, "0% · 今晚一定看"], [0.1, "10%"], [0.2, "20%"], [0.3, "30% · 默认"], [0.5, "50%"], [0.7, "70%"], [0.9, "90%"]],
  "night.maxVideos": [[3, "3 个"], [5, "5 个"], [8, "8 个"], [10, "10 个"], [15, "15 个"], [20, "20 个"]],
  "night.maxWakesPerDay": [[0, "0 次（不醒）"], [2, "2 次"], [4, "4 次"], [6, "6 次"], [8, "8 次"], [12, "12 次"]],
  "night.minGapMin": [[10, "10 分钟"], [20, "20 分钟"], [30, "30 分钟"], [60, "60 分钟"]],
  "quota.shareDaily": [[0, "不分享"], [1, "1 条"], [2, "2 条"], [3, "3 条"], [5, "5 条"], [10, "10 条"]],
  "share.minScore": [[0, "不限"], [3, "3 分"], [5, "5 分"], [8, "8 分"], [10, "10 分"], [15, "15 分"], [20, "20 分"]],
  "share.silentAfterDays": [[0, "不降额"], [3, "3 天"], [7, "7 天"], [14, "14 天"], [30, "30 天"]],
  "share.decayPerDay": [[0, "不降"], [0.5, "0.5 / 天"], [1, "1 / 天"], [2, "2 / 天"]],
};

/* 常用设置：两列紧凑布局；开关用勾选、有界数值用下拉、长文本占满整行。 */
function BiliFieldGrid({ groups, cfg, set, defaults }) {
  const renderCell = (f) => {
    const path = f.path.join(".");
    const value = getPath(cfg, f.path);
    const defaultValue = defaults ? getPath(defaults, f.path) : undefined;
    const wide = f.kind === "list" || f.kind === "textarea" || f.kind === "json";
    let control;
    if (f.kind === "switch") {
      const shown = value === undefined || value === null ? !!defaultValue : !!value;
      control = h("label", { className: "qbw-check" },
        h("input", {
          className: "qbw-switch", type: "checkbox", checked: shown,
          onChange: (e) => set(f.path, e.target.checked),
        }),
        h("span", null, shown ? "已开启" : "已关闭"));
    } else if (BILI_NUM_SELECTS[path]) {
      const presets = BILI_NUM_SELECTS[path];
      const shown = value === undefined || value === null ? defaultValue : value;
      const opts = presets.slice();
      if (shown !== undefined && shown !== null && !opts.some(([v]) => Number(v) === Number(shown))) {
        opts.push([shown, `当前：${shown}`]);
      }
      control = h("select", {
        className: "qbw-select",
        value: shown === undefined || shown === null ? "" : String(shown),
        onChange: (e) => {
          const raw = e.target.value;
          set(f.path, raw === "" ? undefined : Number(raw));
        },
      },
        shown === undefined || shown === null ? h("option", { value: "" }, "默认") : null,
        opts.map(([v, label]) => h("option", { key: String(v), value: String(v) }, label)));
    } else {
      control = h(Field, { f, value, defaultValue, onChange: (v) => set(f.path, v) });
    }
    return h("div", { key: path, className: "qbw-field-cell" + (wide ? " span2" : "") },
      h("div", { className: "qbw-field-label", title: f.hint || undefined }, f.label),
      control);
  };
  return h("div", null,
    groups.map((group) => h("div", { key: group.group },
      h("div", { className: "qbw-group" }, group.group, group.note ? h("small", null, group.note) : null),
      h("div", { className: "qbw-field-grid" }, group.fields.map(renderCell)))));
}

function BiliPage({ bili, qq, unified, setBili, setQq, setUnified, overview, busy, setBusy, toast, reload, onSave, defaults, goTab }) {
  const info = overview?.bili ?? {};
  const [accounts, setAccounts] = useState(null);
  const [checks, setChecks] = useState({});
  const [pending, setPending] = useState([]);
  const [qr, setQr] = useState(null);
  const [qrErr, setQrErr] = useState("");
  const [deps, setDeps] = useState("");
  const [scan, setScan] = useState("");

  const loadAccounts = useCallback(async () => {
    try { setAccounts(await api("/bili/accounts")); } catch { setAccounts(null); }
  }, []);
  const loadPending = useCallback(async () => {
    try { setPending((await api("/bili/pending")).items ?? []); } catch { /* 旧宿主没有 */ }
  }, []);
  useEffect(() => { loadAccounts(); loadPending(); }, [loadAccounts, loadPending]);

  // reload 是外壳每次渲染新建的函数（不是 useCallback）。直接放进扫码轮询的依赖里，
  // 外壳每 15 秒轮询一次状态就会重建一次 interval —— 旧实现确实在抖。用 ref 固定住。
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const verify = async (target) => {
    setChecks((s) => ({ ...s, [target]: { busy: true } }));
    try {
      const r = await api("/bili/account/verify", { method: "POST", body: { target } });
      setChecks((s) => ({ ...s, [target]: r }));
      toast(r.ok ? `✓ ${target === "owner" ? "主人" : "小肥鱼"} 登录有效：${r.account?.name}` : `✗ ${r.error || "核查失败"}`);
      await loadAccounts();
    } catch (e) { setChecks((s) => ({ ...s, [target]: { ok: false, error: e.message } })); }
  };

  useEffect(() => {
    if (!qr?.id || qr.done) return;
    const timer = setInterval(async () => {
      try {
        const r = await api(`/bili/qr/poll?id=${encodeURIComponent(qr.id)}`);
        if (r.ok || r.status === "confirmed" || r.status === "done" || r.account) {
          // 登录成功后直接把弹窗收掉：旧实现只把 done 置 true，
          // 弹窗上写着「已完成，窗口即将关闭」却一直不关，用户只能再点一次「取消」。
          setQr(null);
          toast(`✓ 扫码登录成功${r.account?.name ? `：${r.account.name}` : ""}`);
          await loadAccounts();
          await reloadRef.current?.();
        } else if (r.status === "expired" || r.error) {
          setQr((v) => ({ ...v, done: true }));
          setQrErr(r.error || "二维码已过期，请重新扫码");
        }
      } catch (e) { /* 继续等 */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [qr?.id, qr?.done, loadAccounts]);

  const startQr = async (target = "fish") => {
    setQrErr("");
    setBusy("qr");
    try {
      const r = await api("/bili/qr/start", { method: "POST", body: { target, allowSameAsOwner: target === "owner" } });
      setQr({ ...r, done: false, target });
    } catch (e) { setQrErr(e.message); }
    finally { setBusy(""); }
  };
  const cancelQr = async () => {
    if (qr?.id) await api("/bili/qr/cancel", { method: "POST", body: { id: qr.id } }).catch(() => {});
    setQr(null);
  };

  const runDeps = async () => {
    setBusy("deps");
    setDeps("检查中…");
    try {
      const r = await api("/bili/deps");
      const lines = (r.items ?? []).map((x) => `${x.ok ? "✓" : "✗"} ${x.name} — ${x.detail ?? ""}`);
      if (r.self) lines.push("", `她自己：${r.self.name}（mid ${r.self.mid}）`);
      setDeps([...lines, "", r.ok ? "全部可用 ✓" : "有项不可用 ✗"].join("\n"));
      await reload();
    } catch (e) { setDeps(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const scanPrefs = async (target = "fish") => {
    setBusy("prefs");
    setScan("扫描中…");
    try {
      const r = await api(`/preferences/scan?sources=history,favorites,local&limit=24&target=${target}`);
      setScan((r.items ?? []).map((x) => `${x.kind || "关键词"}：${x.word || x.name || x.title || ""}`).join("\n") || "没有新发现");
      await reload();
    } catch (e) { setScan(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const actPending = async (action, id) => {
    setBusy(`pending-${action}`);
    try {
      await api("/bili/pending", { method: "POST", body: { action, id } });
      toast("✓ 已处理");
      await loadPending();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const accountRow = (target, label) => {
    const acc = target === "owner" ? accounts?.owner : accounts?.fish;
    const chk = checks[target] || {};
    const configured = Boolean(acc?.configured);
    // 2026-11 用户反馈：没绑过的账号行只剩一个「主人」两个字 + 一个灰掉的按钮，
    // 看着像排版错了。原因：dot 为空时 SRow 连 dotText（「未登录」）都不渲染。
    // 所以未绑定时给 warn 圆点，让人一眼看出「这是没登录的槽位」，而不是孤立标题。
    return h(SRow, {
      key: target,
      title: label,
      dot: configured ? (chk.ok === false ? "bad" : "ok") : "warn",
      dotText: configured ? `${acc.name || "（未取到昵称）"} · ${acc.mid}` : "未登录",
      actions: [
        h(Btn, { key: "v", kind: "qbw-btn2", onClick: () => verify(target), disabled: !!chk.busy || !configured }, "核查登录"),
        h(Btn, {
          key: "q", kind: "qbw-btn2",
          onClick: () => startQr(target),
          disabled: !!busy,
        }, configured ? "重新扫码" : "扫码登录"),
      ],
      meta: [
        acc?.savedAt ? `保存于 ${fmtTime(acc.savedAt)}` : null,
        !configured
          ? (target === "owner"
            ? "未绑定：这是管理员自己的 B站 账号（可选，绑定后用于 QQ ⇄ B站 身份对齐）"
            : "未绑定：点右侧「扫码登录」把小肥鱼绑上 B站")
          : null,
        chk.ok === true ? `✓ 登录有效：${chk.account?.name || "—"}（${chk.account?.mid ?? "—"}）` : null,
        chk.ok === false ? `✗ ${chk.error || "核查失败"}` : null,
      ],
    });
  };

  return h("div", { className: "qbw-page-bili" },
    // 待确认的事优先：她决定要发的内容，不处理就不会发。
    pending.length
      ? h(Card, { title: `待你确认（${pending.length}）`, note: "她自己决定要发的内容，通过后才会发" },
        pending.slice(0, 10).map((item) => h(SRow, {
          key: item.id,
          title: item.title || item.kind || "待处理",
          actions: [
            h(Btn, { key: "a", onClick: () => actPending("approve", item.id), disabled: !!busy }, "通过"),
            h(Btn, { key: "r", kind: "qbw-btn2", onClick: () => actPending("reject", item.id), disabled: !!busy }, "拒绝"),
          ],
          meta: [item.text || item.summary || null],
        }))) : null,

    h(Card, { title: "账号与状态", note: "小肥鱼是主号；主人账号可选，绑定后用于 QQ ⇄ B站 身份对齐" },
      accountRow("fish", "小肥鱼"),
      accountRow("owner", "主人"),
      h(SRow, {
        title: "B站 记忆",
        dot: info.available ? "ok" : "warn",
        dotText: info.available ? "已生成" : (info.enabled ? "未生成" : "同步关闭"),
        meta: [
          `简报 ${info.briefChars ?? 0} 字`,
          info.blocked ? "隐私复检：命中已拦截" : "隐私复检：通过",
          `同步到 QQ：${info.enabled ? "开" : "关"}`,
          `生成：${fmtTime(info.generatedAt)}`,
        ],
        actions: [
          h(Btn, {
            key: "refresh", kind: "qbw-btn2", disabled: !!busy,
            onClick: async () => {
              setBusy("refresh-bili");
              try {
                const r = await api("/memory", { method: "POST", body: { action: "refresh-bili" } });
                toast(r.ok ? "✓ B站记忆已刷新" : `✗ ${r.error ?? "失败"}`);
                await reload();
              } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
            },
          }, "刷新记忆"),
          h(Btn, { key: "memory", kind: "qbw-btn3", onClick: () => goTab?.("memory") }, "记忆同步"),
        ],
      })),

    h(Card, { title: "常用设置", note: "作息 / 口味 / 分享直接影响她怎么玩；改完点底部「保存」生效" },
      h(BiliFieldGrid, {
        groups: BILI_COMMON_GROUPS,
        cfg: bili,
        set: setBili,
        defaults: defaults?.bili ?? null,
      })),
    qr ? h(Modal, { title: "扫码登录 B站", onClose: cancelQr, width: 420 },
      qr.done ? h("div", { className: "qbw-hint" }, "已完成，窗口即将关闭。") :
        h("div", null,
          qr.qrDataUrl || qr.image || qr.dataUrl || qr.qr
            ? h("img", { src: qr.qrDataUrl || qr.image || qr.dataUrl || qr.qr, style: { width: "100%", borderRadius: "8px" } })
            : h("div", { className: "qbw-hint" }, qr.url ? `在浏览器打开：${qr.url}` : "二维码生成中…"),
          h("div", { className: "qbw-hint", style: { marginTop: "8px" } }, "用 B站 App 扫码确认；登录成功后这里会自动刷新。"),
          h("div", { className: "qbw-actions" }, h(Btn, { kind: "qbw-btn2", onClick: cancelQr }, "取消")),
          qrErr ? h("div", { className: "qbw-err" }, qrErr) : null)) : null,

    h(Section, { title: "自动分享到 QQ", note: "定时视频 / 新动态；保存后重启 QQ 桥接生效", defaultOpen: false },
      h(FieldGroups, {
        groups: [{ group: "分享与动态", fields: QQ_BILI_SHARE_FIELDS }],
        cfg: qq,
        set: setQq,
        onSave,
        defaults: defaults?.qq ?? null,
      }),
      h("div", { className: "qbw-actions" },
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: async () => {
            setBusy("share-now");
            try {
              const r = await api("/bili/share-now", { method: "POST", body: { action: "share-now" } });
              toast(r.ok ? "✓ 已发一条分享" : `✗ ${r.error ?? "失败"}`);
              await reload();
            } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
          },
        }, busy === "share-now" ? "发送中…" : "立即分享一次"),
        h(Btn, { kind: "qbw-btn3", onClick: () => goTab?.("qq") }, "去 QQ 页重启桥接"))),

    h(Section, { title: "观看历史", note: "她真正看过 / 点过赞的视频，按当前角色隔离", defaultOpen: false },
      h(WatchPage, { busy, setBusy, toast, goTab })),

    h(AdvancedSettings, { note: "低频参数与维护工具：额度 / 四类动态 / 鱼群 / 监听 / 日记 / 工具链等；改完统一点底部保存" },
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: () => scanPrefs("fish"), disabled: !!busy }, busy === "prefs" ? "扫描中…" : "扫描口味"),
        h(Btn, { kind: "qbw-btn2", onClick: runDeps, disabled: !!busy }, busy === "deps" ? "检查中…" : "依赖检查")),
      scan ? h("div", { className: "qbw-out" }, scan) : null,
      deps ? h("div", { className: "qbw-out" }, deps) : null,
      h(FieldGroups, {
        groups: BILI_MORE_GROUPS,
        cfg: bili,
        set: setBili,
        categories: BILI_ADV_CATEGORIES,
        onSave,
        defaults: defaults?.bili ?? null,
      })));
}


/* ══ pages/85-tieba.js ══ */
/* 贴吧：BDUSS 登录 + 口味 / 作息 / 额度 / 社区预览 / 观看记录。 */

// 有界数值做成下拉预设，和 B站 页保持一致的手感（少打字、少出错）。
const TIEBA_GAP_PRESETS = [[2, "2 小时"], [4, "4 小时（默认）"], [6, "6 小时"], [8, "8 小时"], [12, "12 小时"]];
const TIEBA_MAX_THREADS = [[3, "3 条"], [5, "5 条（默认）"], [8, "8 条"], [10, "10 条"]];
const TIEBA_DAILY_REPLY = [[0, "不限"], [5, "5 条"], [10, "10 条"], [20, "20 条"], [30, "30 条（默认）"], [50, "50 条"]];
const TIEBA_DAILY_LIKE = [[0, "不限"], [10, "10 次"], [30, "30 次"], [60, "60 次（默认）"], [100, "100 次"]];
const TIEBA_DAILY_POST = [[0, "不限"], [1, "1 帖"], [3, "3 帖（默认）"], [5, "5 帖"]];
const TIEBA_GLOBAL_MIN = [[0, "不冷却"], [1, "1 分钟"], [2, "2 分钟（默认）"], [5, "5 分钟"], [10, "10 分钟"]];

// 观看记录里的互动标签（和 B站 观看历史的「操作」列同义）
const TIEBA_ACT_TEXT = { reply: "评论", like: "点赞", post: "发帖" };

function TiebaPage({ unified, setUnified, busy, setBusy, toast }) {
  const tieba = unified?.tieba ?? {};
  const prefs = tieba.preferences ?? {};
  const limits = tieba.limits ?? {};
  const [status, setStatus] = useState(null);
  const [feed, setFeed] = useState(null);
  const [replies, setReplies] = useState(null);
  const [err, setErr] = useState("");
  // 看过的帖子（对应 B站 的「观看历史」）
  const [views, setViews] = useState(null);
  const [viewQ, setViewQ] = useState("");
  const [viewErr, setViewErr] = useState("");

  // 扫码登录弹窗 + BDUSS 手动兜底（通常不需要）
  const [qr, setQr] = useState(null);
  const [qrErr, setQrErr] = useState("");
  const [bduss, setBduss] = useState("");

  const loadStatus = useCallback(async () => {
    try { setStatus(await api("/tieba")); setErr(""); }
    catch (e) { setErr(`读取贴吧状态失败：${e.message}`); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  // 看过的帖子：本地文件，没登录也能读出来。
  const loadViews = useCallback(async () => {
    setBusy("tieba-views");
    try { setViews(await api("/tieba/history?limit=300")); setViewErr(""); }
    catch (e) { setViewErr(e.message); }
    finally { setBusy(""); }
  }, [setBusy]);
  useEffect(() => { loadViews(); }, [loadViews]);

  // 扫码进度轮询（2 秒一次）：扫码→后端换 BDUSS→curl 验证→落盘，用户只扫码。
  useEffect(() => {
    if (!qr?.id || qr?.done) return;
    const timer = setInterval(async () => {
      try {
        const r = await api(`/tieba/qr/poll?id=${encodeURIComponent(qr.id)}`);
        if (r.status === "confirmed") {
          setQr(null);
          toast(`✓ 贴吧登录成功${r.user ? `：${r.user}` : ""}`);
          await loadStatus();
        } else if (r.status === "expired" || r.status === "failed") {
          setQr((v) => ({ ...v, done: true }));
          setQrErr(r.error || "二维码已过期，请重新扫码");
        }
      } catch (e) { /* 继续等 */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [qr?.id, qr?.done, loadStatus]);

  const startScan = async () => {
    setQrErr("");
    setErr("");
    setBusy("tieba-qr");
    try {
      const r = await api("/tieba/qr/start", { method: "POST" });
      if (r?.ok === false) throw new Error(r.error ?? "生成二维码失败");
      setQr({ ...r, done: false });
    } catch (e) {
      setQrErr(e.message);
      setErr(e.message);
      toast(`✗ ${e.message}`);
    } finally { setBusy(""); }
  };
  const cancelQr = async () => {
    if (qr?.id) await api("/tieba/qr/cancel", { method: "POST", body: { id: qr.id } }).catch(() => {});
    setQr(null);
  };

  // 手动兜底：把 BDUSS 交给后端，用 curl 验一遍后落盘。
  const saveLogin = async () => {
    if (!bduss.trim()) { toast("✗ 先把 BDUSS 粘贴进来"); return; }
    setBusy("tieba-login");
    setErr("");
    try {
      const r = await api("/tieba/login", { method: "POST", body: { cookie: bduss.trim() } });
      if (r?.ok === false) throw new Error(r.error ?? "登录失败");
      setBduss("");
      toast(`✓ 登录成功${r.user ? `：${r.user}` : ""}`);
      await loadStatus();
    } catch (e) {
      setErr(e.message);
      toast(`✗ ${e.message}`);
    } finally { setBusy(""); }
  };

  const call = async (action, body = {}, okText = "") => {
    setBusy(`tieba-${action}`);
    setErr("");
    try {
      const result = await api("/tieba", { method: "POST", body: { action, ...body } });
      if (result?.ok === false) throw new Error(result.error ?? "失败");
      if (okText) toast(okText);
      await loadStatus();
      return result;
    } catch (e) {
      setErr(e.message);
      toast(`✗ ${e.message}`);
      return null;
    } finally {
      setBusy("");
    }
  };

  const verifyLogin = async () => {
    setBusy("tieba-verify");
    try {
      const r = await api("/tieba/account/verify", { method: "POST" });
      if (r.ok) { toast(`✓ 登录有效${r.user ? `：${r.user}` : ""}`); await loadStatus(); }
      else { toast(`✗ ${r.error ?? "登录无效"}`); setErr(r.error ?? "登录无效"); }
    } catch (e) { setErr(`核查失败：${e.message}`); }
    finally { setBusy(""); }
  };

  const clearCreds = async () => {
    if (!confirm("确认清除贴吧登录凭据？清除后需要重新粘贴 BDUSS。")) return;
    setBusy("tieba-clear");
    try {
      await api("/tieba/credentials/clear", { method: "POST" });
      toast("✓ 已清除，请重新粘贴 BDUSS");
      await loadStatus();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const browseNow = async () => {
    await call("heartbeat-now", {}, "✓ 已经叫她逛贴吧；结果会出现在「上次总结」");
  };

  const loadFeed = async () => {
    // preview: 设置页的预览不算她「看过」，不写进观看记录。
    const result = await call("feed", { sort: tieba.sort === "time" ? "time" : "hot", preview: true }, "");
    if (result) setFeed(result);
  };
  const loadReplies = async () => {
    const result = await call("replyme", {}, "");
    if (result) setReplies(result);
  };

  const check = (key) => (key === "enabled" || key === "autoPost" ? tieba[key] === true : tieba[key] !== false);
  const toggleRow = (key, label, hint) => h(Row, { label, hint },
    h("label", { className: "qbw-check" },
      h("input", {
        className: "qbw-switch", type: "checkbox", checked: check(key),
        onChange: (e) => setUnified(["tieba", key], e.target.checked),
      }),
      h("span", null, check(key) ? "已开启" : "已关闭")));

  const selectRow = (path, label, hint, presets, fallback) => h(Row, { label, hint },
    h("select", {
      className: "qbw-select",
      value: String(pathValue(path) ?? fallback),
      onChange: (e) => setUnified(path, Number(e.target.value)),
    }, presets.map(([value, text]) => h("option", { key: String(value), value: String(value) }, text))));

  // 取 tieba 下的嵌套值（limits.replyDaily / preferences.like …）
  function pathValue(path) {
    let node = tieba;
    for (const key of path.slice(1)) node = node?.[key];
    return node;
  }

  // 看过的帖子：后端一次给 300 条，搜索在本地过滤（和 B站 的观看历史一致）。
  const viewItems = useMemo(() => {
    const all = Array.isArray(views?.items) ? views.items : [];
    const needle = viewQ.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((x) => `${x.title} ${x.author} ${x.abstract}`.toLowerCase().includes(needle));
  }, [views, viewQ]);
  const viewStats = views?.stats ?? {};

  const hasCreds = Boolean(status?.hasBduss);
  const verified = Boolean(status?.verifiedAt);
  const qrSrc = String(qr?.image ?? "").startsWith("data:") ? String(qr.image) : "";

  return h("div", { className: "qbw-page-tieba" },
    h(Card, {
      title: "贴吧账号",
      right: h(StatusDot, { ok: verified, warn: hasCreds && !verified },
        verified ? "已登录" : (hasCreds ? "已配置" : "未登录")),
      note: "点「扫码登录」，用手机百度 App 扫一下并确认；换 BDUSS、验证、保存全由插件自动完成，不需要复制任何东西。",
    },
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: startScan, disabled: !!busy }, busy === "tieba-qr" ? "生成中…" : "扫码登录"),
        h(Btn, { kind: "qbw-btn2", onClick: verifyLogin, disabled: !!busy || !hasCreds }, busy === "tieba-verify" ? "核查中…" : "核查登录"),
        h(Btn, { kind: "qbw-btn2", onClick: clearCreds, disabled: !!busy || !hasCreds, style: { color: "#d9534f" } }, "清除凭据"),
        h(Btn, { kind: "qbw-btn2", onClick: browseNow, disabled: !!busy }, busy === "tieba-heartbeat-now" ? "叫醒中…" : "现在逛一次")),
      h(KV, { label: "登录状态" }, verified ? `已核查 · ${fmtTime(status?.verifiedAt)}` : (hasCreds ? "已配置，未核查" : "未登录")),
      status?.credSource ? h(KV, { label: "凭据来源" }, status.credSource === "manual" ? "配置文件里的 BDUSS" : status.credSource === "cookie" ? "扫码登录（自动换取）" : "—") : null,
      status?.user ? h(KV, { label: "账号昵称" }, status.user) : null,
      h(KV, { label: "上次自动心跳" }, fmtTime(status?.lastPromptAt)),
      h(KV, { label: "上次互动" }, fmtTime(status?.lastActionAt)),
      h("div", { className: "qbw-group", style: { marginTop: "10px" } }, "手动兜底（扫码失败时才用）"),
      h(Row, { label: "BDUSS", hint: "带不带 BDUSS= 前缀都行；内容只存本机，不回显、不进日志" },
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
          h("input", {
            className: "qbw-input",
            type: "password",
            placeholder: hasCreds ? "已保存（粘贴新的可覆盖）" : "粘贴 BDUSS",
            value: bduss,
            onChange: (e) => setBduss(e.target.value),
          }),
          h(Btn, { kind: "qbw-btn3", onClick: saveLogin, disabled: !!busy }, busy === "tieba-login" ? "验证中…" : "保存并测试"))),
      h(Row, { label: "刷哪些吧", hint: "用逗号分隔；留空默认「抓虾吧」" },
        h(ListInput, {
          value: tieba.bars ?? ["抓虾吧"], placeholder: "例如 抓虾吧、贴吧",
          onChange: (v) => setUnified(["tieba", "bars"], v),
        })),
      status?.lastSummary ? h("div", { className: "qbw-hint" }, `上次总结：${status.lastSummary}`) : null),

    // 和 B站 的「口味（文本）」同一套语义：B站 刷视频，贴吧刷帖子，关键词直接作用在帖子标题/摘要上。
    h(Card, {
      title: "口味（文本）",
      note: "和 B站 一样按关键词加权：爱看 +2、额外关键词 +0.75、不爱看 −3 并沉底。帖子命中后「社区预览」里会显示匹配到的词。",
    },
      h(Row, { label: "爱看", hint: "逗号分隔；标题/摘要命中就优先看、优先互动" },
        h(ListInput, {
          value: prefs.like ?? [], placeholder: "例如 大模型、前端、猫",
          onChange: (v) => setUnified(["tieba", "preferences", "like"], v),
        })),
      h(Row, { label: "不爱看", hint: "命中就跳过，不评论也不点赞" },
        h(ListInput, {
          value: prefs.dislike ?? [], placeholder: "例如 带货、标题党、引战",
          onChange: (v) => setUnified(["tieba", "preferences", "dislike"], v),
        })),
      h(Row, { label: "额外关键词", hint: "只扩大范围，权重低于「爱看」" },
        h(ListInput, {
          value: prefs.keywords ?? [], placeholder: "例如 折腾、开源",
          onChange: (v) => setUnified(["tieba", "preferences", "keywords"], v),
        }))),

    h(Card, { title: "逛吧作息", note: "贴吧跟 B站 共用生物钟：B站 每次醒来时，按下面的间隔顺带逛一次" },
      toggleRow("enabled", "启用贴吧", "关闭后不自动逛，也不占用 B站 的唤醒回合"),
      toggleRow("heartbeatShare", "跟 B站 共用作息", "默认开；关掉后只能手动点「现在逛一次」"),
      selectRow(["tieba", "heartbeatGapHours"], "心跳间隔", "距离上次心跳 / 互动至少隔这么久", TIEBA_GAP_PRESETS, 4),
      selectRow(["tieba", "maxThreads"], "每次认真看几条", "一次醒来最多细看几条主帖（其余只扫标题）", TIEBA_MAX_THREADS, 5),
      h(Row, { label: "帖子排序", hint: "她浏览时先取哪种序；之后仍按口味分排序" },
        h("select", {
          className: "qbw-select", value: tieba.sort === "time" ? "time" : "hot",
          onChange: (e) => setUnified(["tieba", "sort"], e.target.value),
        },
          h("option", { value: "hot" }, "热门"),
          h("option", { value: "time" }, "最新")))),

    h(Card, { title: "每次醒来做什么", note: "对应 B站的「四类动态 / 分享」：她这一趟贴吧允许做的动作" },
      toggleRow("autoReply", "回复未读", "只回有意义、值得讨论的评论"),
      toggleRow("autoLike", "点赞", "每次至少赞 1 条对口味的内容"),
      toggleRow("autoComment", "评论主帖", "每次挑 1 条能接上话的主帖"),
      toggleRow("autoPost", "发新帖", "默认关；开启后她可以自己开话题"),
      h("div", { className: "qbw-group" }, "额度（代码闸门）"),
      selectRow(["tieba", "limits", "replyDaily"], "评论 · 每天上限", "0 = 不限（官方硬上限仍生效）", TIEBA_DAILY_REPLY, 30),
      selectRow(["tieba", "limits", "likeDaily"], "点赞 · 每天上限", "", TIEBA_DAILY_LIKE, 60),
      selectRow(["tieba", "limits", "postDaily"], "发帖 · 每天上限", "", TIEBA_DAILY_POST, 3),
      selectRow(["tieba", "limits", "globalMin"], "任意两条发言间隔", "和 B站 的「任意两条发言间隔」同义", TIEBA_GLOBAL_MIN, 2)),

    h(Card, { title: "社区预览", note: "只读预览：帖子列表（按口味排序）/ @我的，不会代替她自己逛" },
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: loadFeed, disabled: !!busy || !hasCreds }, busy === "tieba-feed" ? "读取中…" : "刷新帖子列表"),
        h(Btn, { kind: "qbw-btn2", onClick: loadReplies, disabled: !!busy || !hasCreds }, busy === "tieba-replyme" ? "读取中…" : "刷新 @我的")),
      feed ? h("div", { className: "qbw-rows" },
        (feed.threads ?? []).length
          ? feed.threads.slice(0, Math.max(10, Number(feed.shown) || 10)).map((thread) => h(SRow, {
            key: String(thread.id),
            title: `${thread.title || "（无标题）"}${thread.taste?.score > 0 ? ` · 口味 +${thread.taste.score}` : ""}`,
            meta: [
              `${thread.author || "—"} · 回复 ${thread.replyNum} · 浏览 ${thread.viewNum} · 赞 ${thread.agreeNum}`,
              thread.abstract,
              thread.taste?.liked?.length ? `命中：${thread.taste.liked.join("、")}` : null,
              thread.taste?.disliked?.length ? `⚠️ 不爱看：${thread.taste.disliked.join("、")}` : null,
            ].filter(Boolean),
            actions: [h(Btn, { key: "open", kind: "qbw-btn3", onClick: () => window.open(thread.url, "_blank", "noopener") }, "打开")],
          }))
          : h("div", { className: "qbw-hint" }, "帖子列表是空的。"))
        : h("div", { className: "qbw-hint" }, hasCreds ? "点「刷新帖子列表」看看社区（会按上面的口味排序）。" : "先粘贴 BDUSS 登录。"),
      replies ? h("div", { className: "qbw-rows" },
        (replies.replies ?? []).length
          ? replies.replies.slice(0, 10).map((item, index) => h(SRow, {
            key: `${item.threadId}-${item.postId}-${index}`,
            title: `${item.unread ? "未读 · " : ""}${item.title || "回复"}`,
            meta: [
              `内容：${item.content}`,
              item.quoteContent ? `引用：${item.quoteContent}` : null,
            ].filter(Boolean),
            actions: [h(Btn, { key: "open", kind: "qbw-btn3", onClick: () => window.open(item.url, "_blank", "noopener") }, "打开")],
          }))
          : h("div", { className: "qbw-hint" }, "还没有人回复她。"))
        : null),

    // 和 B站 的「观看历史」同一套：扫过 / 认真看过哪些帖子，自动记账。
    h(Card, {
      title: "看过的帖子",
      note: "和 B站 的「观看历史」一样：她扫过 / 点进去看过哪些帖子，自动记账（「刷新帖子列表」只是预览，不会记进去）。",
    },
      h("div", { className: "qbw-stats" },
        h("div", { className: "qbw-stat" }, h("div", null, "今天"), h("div", null, viewStats.today ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "最近 7 天"), h("div", null, viewStats.last7d ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "认真看"), h("div", null, viewStats.read ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "不同帖子"), h("div", null, viewStats.threads ?? 0, h("span", { className: "qbw-unit" }, " 条")))),

      h("div", { className: "qbw-search", style: { marginTop: "10px" } },
        h("input", {
          className: "qbw-input", placeholder: "搜标题 / 作者 / 摘要",
          value: viewQ, onChange: (e) => setViewQ(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: loadViews, disabled: !!busy }, busy === "tieba-views" ? "刷新中…" : "刷新")),

      views?.actions
        ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
          `操作：评论 ${views.actions.reply ?? 0} · 点赞 ${views.actions.like ?? 0} · 发帖 ${views.actions.post ?? 0}`)
        : null,
      viewErr ? h("div", { className: "qbw-err", style: { margin: "8px 0" } }, `✗ ${viewErr}`) : null,
      !views && !viewErr ? h("div", { className: "qbw-hint", style: { padding: "12px 0" } }, "读取看过的帖子…") : null,

      views && viewItems.length === 0
        ? h("div", { className: "qbw-hint" },
          viewQ ? "没有匹配的记录。" : "还没有记录。她下次逛贴吧（或点上面的「现在逛一次」）会自动记一笔。")
        : null,

      viewItems.length
        ? h("div", null, viewItems.map((item, index) => {
          const rowKey = `${item.threadId}|${item.at}|${index}`;
          const title = item.url
            ? h("a", { className: "qbw-vtitle", href: item.url, target: "_blank", rel: "noreferrer" }, item.title || `帖子 ${item.threadId}`)
            : h("span", { className: "qbw-vtitle" }, item.title || "（无标题）");
          const acts = Array.isArray(item.actions) ? item.actions : [];
          return h("div", { className: "qbw-sitem", key: rowKey },
            h("div", { className: "qbw-srow" },
              h("div", { className: "qbw-srow-main" }, title),
              h("div", { className: "qbw-srow-acts" },
                h(Badge, { kind: item.mode === "read" ? "ok" : "" },
                  item.mode === "read" ? (item.floors ? `认真看 · ${item.floors} 层` : "认真看") : "扫过"),
                item.score == null || item.score === 0
                  ? null
                  : h(Badge, null, `口味 ${item.score > 0 ? "+" : ""}${item.score}`),
                acts.length
                  ? h(Badge, null, acts.map((a) => TIEBA_ACT_TEXT[a.kind] ?? a.kind).join(" · "))
                  : null)),
            h("div", { className: "qbw-srow-meta" },
              h("span", null, fmtTime(item.at)),
              h("span", null, item.author || "—"),
              h("span", null, `回复 ${item.replyNum}`),
              h("span", null, `浏览 ${item.viewNum}`),
              item.liked?.length ? h("span", null, `命中：${item.liked.join("、")}`) : null,
              item.disliked?.length ? h("span", null, `⚠️ 不爱看：${item.disliked.join("、")}`) : null),
            item.abstract ? h("div", { className: "qbw-hint", style: { paddingTop: "3px" } }, item.abstract) : null);
        }))
        : null,

      views
        ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
          `共 ${views.total ?? viewItems.length} 条${viewQ ? `（过滤后 ${viewItems.length} 条）` : ""} · 数据文件 ${views.file || "—"}`)
        : null),

    qr ? h(Modal, { title: "扫码登录 百度贴吧", onClose: cancelQr, width: 420 },
      qr.done
        ? h("div", { className: "qbw-hint" }, qrErr || "已完成，窗口即将关闭。")
        : h("div", null,
          qrSrc
            ? h("img", { src: qrSrc, style: { width: "100%", maxWidth: "260px", borderRadius: "8px", display: "block", margin: "0 auto" } })
            : h("div", { className: "qbw-hint" }, "二维码生成中…"),
          h("div", { className: "qbw-hint", style: { marginTop: "8px" } }, "用手机百度 / 贴吧 App 扫码，并在手机上确认登录。"),
          qrErr ? h("div", { className: "qbw-err", style: { marginTop: "6px" } }, qrErr) : null,
          h("div", { className: "qbw-hint", style: { marginTop: "6px", fontSize: "11px" } }, "确认后插件会自动换取并验证登录态；过期请点「扫码登录」重新生成。"))) : null,

    err ? h("div", { className: "qbw-err" }, err) : null);
}


/* ══ pages/88-douyin.js ══ */
/* 抖音（第四个平台）：账号 / 观看时间与额度 / 手动操作 / 看过的视频。
   和 B站、贴吧同一套页面骨架：只看统一配置 unified.douyin，保存走外壳的「保存」。 */

const DOUYIN_MINUTES = [[5, "5 分钟"], [10, "10 分钟"], [15, "15 分钟（默认）"], [30, "30 分钟"], [60, "60 分钟"]];
const DOUYIN_REQUESTS = [[10, "10 次"], [30, "30 次（默认）"], [60, "60 次"], [100, "100 次"]];
const DOUYIN_DWELL = [[10, "10 秒"], [20, "20 秒"], [30, "30 秒（默认）"], [60, "60 秒"]];
const DOUYIN_MAX_VIDEOS = [[3, "3 条"], [5, "5 条（默认）"], [8, "8 条"], [10, "10 条"]];
const DOUYIN_GAP = [[15, "15 分钟"], [30, "30 分钟（默认）"], [60, "1 小时"], [120, "2 小时"]];

function DouyinPage({ unified, setUnified, busy, setBusy, toast }) {
  const dy = unified?.douyin ?? {};
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");
  const [views, setViews] = useState(null);
  const [viewQ, setViewQ] = useState("");
  const [viewErr, setViewErr] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [awemeInput, setAwemeInput] = useState("");
  const [comments, setComments] = useState(null);
  const [notices, setNotices] = useState(null);
  const [debrief, setDebrief] = useState(null);
  // 抖音私信 / 群聊：douyin-im 长连接（不需要浏览器）
  const [im, setIm] = useState(null);
  const [imContacts, setImContacts] = useState(null);
  const [imIds, setImIds] = useState([]);
  const [imMobile, setImMobile] = useState("");
  const [imCode, setImCode] = useState("");
  const [imNames, setImNames] = useState("");
  const [imTest, setImTest] = useState(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await api("/douyin")); setErr(""); }
    catch (e) { setErr(`读取抖音状态失败：${e.message}`); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  const loadIm = useCallback(async () => {
    try {
      const r = await api("/douyin", { method: "POST", body: { action: "im-status" } });
      setIm(r);
      if (Array.isArray(r?.allowlist)) setImIds(r.allowlist.map((item) => item.id));
      if (Array.isArray(r?.mentionNames)) setImNames(r.mentionNames.join("，"));
    } catch { /* 还没登录时静默 */ }
  }, []);
  useEffect(() => { loadIm(); }, [loadIm]);
  useEffect(() => {
    const phase = im?.phase;
    if (!phase || phase === "idle" || phase === "offline" || phase === "error") return;
    const timer = setInterval(() => { loadIm(); }, phase === "online" ? 15000 : 3000);
    return () => clearInterval(timer);
  }, [im?.phase, loadIm]);

  // 自动观看时状态会变（翻了几条、剩多少分钟），页面开着就每 15 秒刷一次。
  useEffect(() => {
    if (!status?.watching) return;
    const timer = setInterval(() => { loadStatus().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [status?.watching, loadStatus]);

  const loadViews = useCallback(async () => {
    setBusy("douyin-views");
    try { setViews(await api("/douyin/history?limit=300")); setViewErr(""); }
    catch (e) { setViewErr(e.message); }
    finally { setBusy(""); }
  }, [setBusy]);
  useEffect(() => { loadViews(); }, [loadViews]);

  const call = async (action, body = {}, okText = "") => {
    setBusy(`douyin-${action}`);
    setErr("");
    try {
      const result = await api("/douyin", { method: "POST", body: { action, ...body } });
      if (result?.ok === false) throw new Error(result.error ?? "失败");
      if (okText) toast(okText);
      await loadStatus();
      if (action === "start" || action === "stop") loadViews().catch(() => {});
      return result;
    } catch (e) {
      setErr(e.message);
      toast(`✗ ${e.message}`);
      return null;
    } finally {
      setBusy("");
    }
  };

  const openWindow = () => call("open", {}, "✓ 已打开抖音专用窗口（在里面扫码登录）");
  const browseNow = () => call("start", { reason: "手动" }, "✓ 已开始刷一轮；结果会出现在「看过的视频」");
  const stopNow = () => call("stop", {}, "✓ 已停止并暂停");
  const nextOne = () => call("next", {}, "✓ 已到下一条");
  const readCurrent = () => call("current", {}, "");
  const doSearch = async () => {
    if (!query.trim()) { toast("✗ 先输入搜索词"); return; }
    const result = await call("search", { query: query.trim() }, "");
    if (result) setResults(result.results ?? []);
  };

  // 读评论 / 通知：只读，不占观看额度；评论图片会落到本机目录。
  const loadComments = async () => {
    const raw = awemeInput.trim();
    if (!raw) { toast("✗ 先粘贴视频链接或作品 id"); return; }
    const body = /^\d{6,25}$/.test(raw) ? { awemeId: raw, max: 20 } : { url: raw, max: 20 };
    const result = await call("comments", body, "");
    if (result) setComments(result);
  };
  const loadNotices = async () => {
    const result = await call("notices", { count: 20 }, "");
    if (result) setNotices(result);
  };
  // 「看懂一条」：文案 + 时长 + 数据 + 弹幕 + 热评（不下载、不装模型）。
  const loadDebrief = async () => {
    const raw = awemeInput.trim();
    const body = /^\d{6,25}$/.test(raw) ? { awemeId: raw } : (raw ? { url: raw } : {});
    const result = await call("debrief", body, "");
    if (result) setDebrief(result);
  };

  // 抖音私信：扫码/短信登录 → 读取好友和群 → 勾选许可 → 打开开关。
  const imLoginQr = async () => {
    await call("im-login-qr", {}, "✓ 请用抖音 App 扫码，并在手机上确认");
    loadIm();
  };
  const imLoginSms = async () => {
    await call("im-login-sms", { mobile: imMobile.trim() }, "✓ 验证码已发送（看手机）");
    loadIm();
  };
  const imSubmitCode = async () => {
    await call("im-sms-code", { code: imCode.trim() }, "✓ 验证码已提交");
    loadIm();
  };
  const imLogoutNow = async () => {
    await call("im-logout", {}, "✓ 已退出抖音 IM");
    setImContacts(null);
    loadIm();
  };
  const imLoadContacts = async () => {
    const result = await call("im-contacts", {}, "✓ 好友和群已读取");
    if (result) setImContacts(result);
    loadIm();
  };
  const imToggleId = (id) => setImIds((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const imSaveAndToggle = async (next) => {
    const names = imNames.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
    const picked = (imContacts?.contacts ?? []).filter((item) => imIds.includes(item.id));
    const list = picked.length ? picked : (im?.allowlist ?? []);
    if (next && !list.length) { toast("✗ 先点「读取好友和群」，勾选要回的人/群"); return; }
    await call("im-config", {
      enabled: next,
      allowlist: list.map((item) => ({ id: item.id, name: item.name, isGroup: item.isGroup === true })),
      mentionNames: names.length ? names : ["大肥鱼"],
    }, "");
    if (next) await call("im-start", {}, "✓ 已开启自动回复（不需要开浏览器）");
    else await call("im-stop", {}, "✓ 已关闭自动回复");
    loadIm();
  };
  const imSaveConfig = async (patch = {}) => {
    await call("im-config", patch, "✓ 已保存");
    loadIm();
  };
  const imRunSelftest = async () => {
    setImTest(null);
    const result = await call("im-selftest", {}, "");
    if (result) {
      setImTest(result);
      toast(`✓ 回复链路正常：${String(result.reply ?? "").slice(0, 30)}`);
    }
  };

  const policy = status?.policy;
  const browser = status?.browser ?? {};
  const page = status?.page;
  const allowed = Boolean(policy?.allowed);
  const watching = Boolean(status?.watching);
  const loginBlocked = Boolean(page?.loginRequired);
  const remainingMin = policy?.daily?.remainingSeconds == null ? null : Math.round(policy.daily.remainingSeconds / 60);
  const usedMin = policy?.daily?.usedSeconds == null ? 0 : Math.round(policy.daily.usedSeconds / 60);

  const boolRow = (key, label, hint) => {
    const on = dy[key] === true;
    return h(Row, { label, hint },
      h("label", { className: "qbw-check" },
        h("input", {
          className: "qbw-switch", type: "checkbox", checked: on,
          onChange: (e) => setUnified(["douyin", key], e.target.checked),
        }),
        h("span", null, on ? "已开启" : "已关闭")));
  };
  const selectRow = (key, label, hint, presets, fallback) =>
    h(Row, { label, hint },
      h("select", {
        className: "qbw-select",
        value: String(dy[key] ?? fallback),
        onChange: (e) => setUnified(["douyin", key], Number(e.target.value)),
      }, presets.map(([value, text]) => h("option", { key: String(value), value: String(value) }, text))));

  const viewItems = useMemo(() => {
    const all = Array.isArray(views?.items) ? views.items : [];
    const needle = viewQ.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) => `${item.title} ${item.author}`.toLowerCase().includes(needle));
  }, [views, viewQ]);
  const viewStats = views?.stats ?? {};

  const login = status?.login ?? {};
  const persisted = login.persisted === true;

  const debriefBlock = debrief
    ? h("div", { style: { marginTop: "8px" } },
      h("div", { className: "qbw-hint", style: { whiteSpace: "pre-wrap", lineHeight: 1.5 } }, debrief.text || debrief.desc || ""),
      debrief.note ? h("div", { className: "qbw-hint", style: { marginTop: "4px" } }, `⚠️ ${debrief.note}`) : null)
    : null;

  // 抖音 IM 的小块：先算成变量，避免 return 里嵌套过深。
  const imPhaseText = im?.phase === "online"
    ? `已上线：${im.nickname || im.uid || "抖音账号"}`
    : im?.phase === "need-qr" ? "等待扫码"
      : im?.phase === "need-sms" ? `等待短信验证码（${im.smsMobile || "手机"}）`
        : im?.phase === "verification" ? "需要完成安全验证"
          : im?.phase === "starting" ? "正在连接…"
            : im?.phase === "error" ? `出错：${im.error || "未知错误"}`
              : im?.phase === "offline" ? "已掉线（会自动重连）"
                : "未登录";

  const imLoginBlock = h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
    h("div", { className: "qbw-actions" },
      h(Btn, { onClick: imLoginQr, disabled: !!busy }, busy === "douyin-im-login-qr" ? "获取二维码中…" : "扫码登录"),
      h("input", {
        className: "qbw-input", placeholder: "手机号（短信登录）",
        value: imMobile, onChange: (e) => setImMobile(e.target.value),
      }),
      h(Btn, { kind: "qbw-btn2", onClick: imLoginSms, disabled: !!busy }, "发验证码")),
    im?.phase === "need-sms"
      ? h("div", { className: "qbw-actions", style: { marginTop: "8px" } },
        h("input", {
          className: "qbw-input", placeholder: "短信验证码",
          value: imCode, onChange: (e) => setImCode(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: imSubmitCode, disabled: !!busy }, "提交验证码"))
      : null,
    im?.qr
      ? h("div", { style: { marginTop: "10px" } },
        h("img", {
          src: im.qr, alt: "抖音登录二维码",
          style: { width: "180px", height: "180px", display: "block", borderRadius: "8px" },
        }),
        h("div", { className: "qbw-hint" }, "用抖音 App 扫码，并在手机上确认登录。"))
      : null,
    im?.phase === "verification"
      ? h("div", { className: "qbw-hint" }, "已打开抖音的验证页；完成验证后会自动继续登录。")
      : null);

  const imContactsBlock = imContacts
    ? ((imContacts.contacts ?? []).length
      ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
        (imContacts.contacts ?? []).map((item) => h("label", {
          key: item.id, className: "qbw-check",
          style: { display: "flex", gap: "8px", alignItems: "center", padding: "4px 0" },
        },
          h("input", {
            type: "checkbox", className: "qbw-switch",
            checked: imIds.includes(item.id),
            onChange: () => imToggleId(item.id),
          }),
          h("span", null, `${item.name || item.id}${item.isGroup ? `（群聊${item.memberCount ? ` · ${item.memberCount} 人` : ""}）` : ""}`))))
      : h("div", { className: "qbw-hint" }, "没有读到好友或群。"))
    : null;

  const imAllowBlock = !imContacts && (im?.allowlist ?? []).length
    ? h("div", { className: "qbw-hint", style: { marginTop: "6px" } },
      `已许可：${im.allowlist.map((item) => `${item.name || item.id}${item.isGroup ? "（群）" : ""}`).join("、")}`)
    : null;

  // 评论区 / 通知列表先算成变量，避免在 JSX 里写多层嵌套括号（容易少一个括号）。
  const commentList = comments
    ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
      h("div", { className: "qbw-hint" },
        `${comments.items?.length ?? 0} 条 · 图片 ${comments.imageCount ?? 0} 张${comments.imageCount ? `（已存到 ${comments.imageDir}）` : ""}${comments.hasMore ? " · 还有更多" : ""}`),
      (comments.items ?? []).map((item) => h("div", { className: "qbw-sitem", key: item.cid },
        h("div", { className: "qbw-srow" },
          h("div", { className: "qbw-srow-main" },
            h("span", { className: "qbw-srow-title" }, `${item.nick || "匿名"}：${item.text || "（无正文）"}`)),
          h("div", { className: "qbw-srow-acts" },
            item.replyCount ? h(Badge, null, `回复 ${item.replyCount}`) : null,
            item.likeCount ? h(Badge, null, `赞 ${item.likeCount}`) : null)),
        h("div", { className: "qbw-srow-meta" },
          h("span", null, fmtTime(item.createTime ? item.createTime * 1000 : null)),
          item.cid ? h("span", null, `cid ${item.cid}`) : null),
        item.images?.length
          ? h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", paddingTop: "6px" } },
            item.images.map((image) => h("img", {
              key: image.file, src: image.url, referrerPolicy: "no-referrer",
              style: { width: "88px", height: "88px", objectFit: "cover", borderRadius: "6px" },
            })))
          : null)))
    : null;

  const noticeList = notices
    ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
      h("div", { className: "qbw-hint" },
        `共 ${notices.total ?? 0} 条${notices.atCount ? ` · @我 ${notices.atCount}` : ""}${notices.warnings?.length ? ` · ${notices.warnings.join("；")}` : ""}`),
      (notices.items ?? []).map((item, index) => h("div", { className: "qbw-sitem", key: item.nid || `${index}` },
        h("div", { className: "qbw-srow" },
          h("div", { className: "qbw-srow-main" },
            h("span", { className: "qbw-srow-title" }, `${item.typeName}${item.nickname ? ` · ${item.nickname}` : ""}${item.content ? `：${item.content}` : ""}`)),
          item.videoUrl
            ? h("div", { className: "qbw-srow-acts" },
              h("a", { className: "qbw-vtitle", href: item.commentUrl || item.videoUrl, target: "_blank", rel: "noreferrer" }, "打开"))
            : null),
        h("div", { className: "qbw-srow-meta" },
          h("span", null, fmtTime(item.createTime ? item.createTime * 1000 : null))))))
    : null;

  return h("div", { className: "qbw-page-douyin" },
    h(Card, {
      title: "抖音账号",
      right: h(StatusDot, {
        ok: persisted || (Boolean(browser.ready) && !loginBlocked),
        warn: Boolean(browser.running) && !persisted && !loginBlocked,
      },
        loginBlocked ? "需要登录" : (browser.running ? (persisted ? "已登录 · 运行中" : "运行中") : (persisted ? "已登录 · 窗口关着" : "未登录"))),
      note: "抖音用本机 Microsoft Edge 的网页版，登录状态存在专用资料目录里。窗口关掉不等于退出登录：下次需要刷的时候（手动或到点自动）插件会重新打开同一个窗口，不用再扫码。",
    },
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: openWindow, disabled: !!busy }, busy === "douyin-open" ? "打开中…（首次约 10 秒）" : (persisted ? "打开抖音窗口" : "打开抖音（登录）")),
        h(Btn, { kind: "qbw-btn2", onClick: loadStatus, disabled: !!busy }, "刷新状态"),
        h(Btn, { kind: "qbw-btn2", onClick: readCurrent, disabled: !!busy }, busy === "douyin-current" ? "读取中…（会自动开窗口）" : "读取当前作品")),
      h(KV, { label: "专用窗口" }, browser.running
        ? `运行中 · 端口 ${browser.port}`
        : "已关闭（不影响：需要时会自动重新打开同一个窗口）"),
      h(KV, { label: "登录状态" }, loginBlocked
        ? "需要登录：在专用窗口里扫码"
        : (persisted
          ? `已登录（保存在专用资料目录${login.checkedAt ? ` · ${fmtTime(login.checkedAt)} 检查` : ""}）`
          : (browser.running ? "窗口运行中；点「读取当前作品」确认登录" : (login.error ? `未确认（${login.error}）` : "未登录：点上面的按钮扫码")))),
      page?.title ? h(KV, { label: "当前作品" },
        page.url
          ? h("a", { href: page.url, target: "_blank", rel: "noreferrer" }, `${page.title}${page.author ? ` · @${page.author}` : ""}`)
          : `${page.title}${page.author ? ` · @${page.author}` : ""}`) : null,
      status?.lastSummary?.note
        ? h(KV, { label: "上次总结" }, `${status.lastSummary.note}（${fmtTime(status.lastSummary.at)}）`) : null,
      browser.launchFailure ? h("div", { className: "qbw-err", style: { marginTop: "8px" } }, `✗ ${browser.launchFailure}`) : null),

    h(Card, {
      title: "观看时间与额度",
      note: "和 B站 的作息同一套语义：只在这几个时段里允许看，每天最多看多少分钟；超出后网页端会自己暂停。改完点外壳的「保存」立即生效。",
    },
      boolRow("enabled", "允许刷抖音", "总开关；关掉后手动操作也会被拒，只能打开窗口登录"),
      boolRow("autoWatch", "到点自动刷", "关掉后只保留手动「现在刷一轮」"),
      boolRow("silent", "静默刷（最小化 + 静音）", "开启后每次动作都会把专用窗口最小化并静音，桌面不弹窗；登录/验证时不会隐藏"),
      h(Row, { label: "允许时段", hint: "HH:MM-HH:MM，可以加多个；24:00 表示当天结束" },
        h(ListInput, {
          value: dy.windows ?? ["20:00-24:00"],
          placeholder: "20:00-24:00",
          onChange: (v) => setUnified(["douyin", "windows"], v),
        })),
      selectRow("dailyMinutes", "每天最多看几分钟", "网页端按实际播放时间记账，重启不清零", DOUYIN_MINUTES, 15),
      selectRow("dailyRequests", "每天模型请求次数", "留给需要模型判断的工具；本地自走循环不消耗它", DOUYIN_REQUESTS, 30),
      selectRow("dwellSeconds", "每条停留多久", "停留到时间就划下一条", DOUYIN_DWELL, 30),
      selectRow("maxVideosPerWake", "每次最多看几条", "一轮结束就停，下一轮等间隔", DOUYIN_MAX_VIDEOS, 5),
      selectRow("gapMinutes", "两轮之间至少隔多久", "避免时段一开始就一直刷", DOUYIN_GAP, 30),
      h(KV, { label: "现在能不能刷" }, allowed ? `可以 · 当前窗口 ${policy?.allowedWindow ? `${policy.allowedWindow.start}~${policy.allowedWindow.end}` : "不限"}` : (policy?.reason || status?.policyError || "—")),
      h(KV, { label: "今天已看 / 剩余" }, `${usedMin} 分钟 / ${remainingMin == null ? "不限" : `${remainingMin} 分钟`}`)),

    h(Card, {
      title: "手动操作",
      note: "「现在刷一轮」走本地循环（打开推荐流 → 停留 → 下一条），不依赖 DSH 的模型；受上面的时段和额度约束。",
    },
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: browseNow, disabled: !!busy || watching || !allowed }, busy === "douyin-start" ? "启动中…" : "现在刷一轮"),
        h(Btn, { kind: "qbw-btn2", onClick: stopNow, disabled: !!busy || !watching }, busy === "douyin-stop" ? "停止中…" : "停止并暂停"),
        h(Btn, { kind: "qbw-btn2", onClick: nextOne, disabled: !!busy || watching || !allowed }, "下一条")),
      h("div", { className: "qbw-search", style: { marginTop: "10px" } },
        h("input", {
          className: "qbw-input", placeholder: "搜索抖音（会占用额度）",
          value: query, onChange: (e) => setQuery(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: doSearch, disabled: !!busy || watching || !allowed }, busy === "douyin-search" ? "搜索中…" : "搜索")),
      results && results.length
        ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
          results.map((item) => h(SRow, {
            key: `${item.index}-${item.id ?? item.title}`,
            title: `${item.index + 1}. ${item.title || "（无标题）"}`,
            meta: [item.author ? `@${item.author}` : null, item.url || null].filter(Boolean),
          })))
        : (results ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } }, "没有搜到可见结果。") : null),
      watching
        ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
          `正在刷：已看 ${status.watch?.viewed ?? 0} / ${status.watch?.maxVideos ?? 0} 条（${fmtTime(status.watch?.startedAt)} 开始）`)
        : null),

    h(Card, {
      title: "评论区 · 互动通知",
      note: "只读：别人的视频也能读评论区（不占观看额度）。评论里的图片会下载到本机目录并显示在下面；MCP 工具会把前几张图直接交给模型（需要模型支持图像）。",
    },
      h("div", { className: "qbw-search" },
        h("input", {
          className: "qbw-input", placeholder: "粘贴视频链接或作品 id（留空则读当前作品）",
          value: awemeInput, onChange: (e) => setAwemeInput(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: loadComments, disabled: !!busy }, busy === "douyin-comments" ? "读取中…" : "读取评论"),
        h(Btn, { kind: "qbw-btn2", onClick: loadDebrief, disabled: !!busy }, busy === "douyin-debrief" ? "读取中…" : "看懂这条")),
      debriefBlock,
      commentList,

      h("div", { className: "qbw-group", style: { marginTop: "12px" } }, "互动通知"),
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: loadNotices, disabled: !!busy }, busy === "douyin-notices" ? "读取中…" : "读取通知")),
      noticeList),

    h(Card, {
      title: "私信 / 群聊（长连接）",
      note: "走抖音 IM 协议，不需要开浏览器：登录一次后，新私信/群消息会投进 DSH 会话，回复自动发回去；群里默认只在被 @ 或叫到昵称时回。",
    },
      h(Row, { label: "自动回复私信 / 群消息", hint: "长连接，不需要开窗口；先登录并勾选许可会话" },
        h("label", { className: "qbw-check" },
          h("input", {
            className: "qbw-switch", type: "checkbox", checked: im?.enabled === true,
            disabled: !!busy,
            onChange: (e) => imSaveAndToggle(e.target.checked),
          }),
          h("span", null, im?.enabled === true ? "已开启" : "已关闭"))),
      h(KV, { label: "登录状态" }, imPhaseText),
      im?.error ? h("div", { className: "qbw-err", style: { marginTop: "6px" } }, `✗ ${im.error}`) : null,
      im?.phase === "online"
        ? h("div", null,
          h(KV, { label: "账号" }, `${im.nickname || "—"}${im.uid ? ` · ${im.uid}` : ""}`),
          h(KV, { label: "好友 / 群" }, `${im.friends ?? 0} / ${im.groups ?? 0}`),
          h(KV, { label: "今天已回复" }, `${im.today?.replies ?? 0} 条（上限 ${im.dailyReplyLimit ?? 80}）`))
        : imLoginBlock,
      h(KV, { label: "已许可会话" }, (im?.allowlist ?? []).length
        ? im.allowlist.map((item) => `${item.name || item.id}${item.isGroup ? "（群）" : ""}`).join("、")
        : "还没有：先登录 → 读取好友和群 → 勾选"),
      h(AdvancedSettings, { note: "换账号 / 换许可会话 / 调群聊规则时用；平时不用管" },
        h("div", { className: "qbw-actions" },
          h(Btn, { onClick: imLoadContacts, disabled: !!busy || im?.phase !== "online" }, busy === "douyin-im-contacts" ? "读取中…" : "读取好友和群"),
          h(Btn, { kind: "qbw-btn2", onClick: imRunSelftest, disabled: !!busy }, busy === "douyin-im-selftest" ? "自检中…" : "自检回复链路"),
          h(Btn, { kind: "qbw-btn3", onClick: imLogoutNow, disabled: !!busy || im?.phase !== "online" }, "退出登录")),
        imTest ? h("div", { className: "qbw-hint", style: { marginTop: "6px" } }, `自检回复：${imTest.reply}（会话 ${imTest.sessionId}）`) : null,
        imContactsBlock,
        imAllowBlock,
        h(Row, { label: "群聊响应昵称", hint: "群里被 @ 或正文出现这些名字才回" },
          h("input", {
            className: "qbw-input", value: imNames, placeholder: "大肥鱼，肥鱼",
            onChange: (e) => setImNames(e.target.value),
            onBlur: () => imSaveConfig({ mentionNames: imNames.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean) }),
          })),
        h(Row, { label: "群聊只在被叫到时回", hint: "关掉后群里每一条都会回（不建议）" },
          h("label", { className: "qbw-check" },
            h("input", {
              type: "checkbox", className: "qbw-switch", checked: im?.groupMentionOnly !== false,
              onChange: (e) => imSaveConfig({ groupMentionOnly: e.target.checked }),
            }),
            h("span", null, im?.groupMentionOnly !== false ? "已开启" : "已关闭"))),
        h(Row, { label: "每日回复上限", hint: "超过后当天不再自动回，避免刷屏" },
          h("input", {
            className: "qbw-input", type: "number", min: 1, max: 500,
            defaultValue: String(im?.dailyReplyLimit ?? 80),
            onBlur: (e) => imSaveConfig({ dailyReplyLimit: Number(e.target.value) || 80 }),
          }))),
      h("div", { className: "qbw-hint", style: { marginTop: "6px", lineHeight: 1.6 } },
        im?.enabled
          ? "已开启：不用开浏览器，有新消息会自己回；回复会出现在侧栏的抖音会话里。"
          : "打开开关前：先登录，再在「高级设置」里勾选要回的好友/群并保存。")),

    h(Card, {
      title: "看过的视频",
      note: "本地记账：自动观看和手动翻页都会记一笔（同一条 10 分钟内不重复记）。",
    },
      h("div", { className: "qbw-stats" },
        h("div", { className: "qbw-stat" }, h("div", null, "今天"), h("div", null, viewStats.today ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "最近 7 天"), h("div", null, viewStats.last7d ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "不同视频"), h("div", null, viewStats.videos ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "累计"), h("div", null, viewStats.total ?? 0, h("span", { className: "qbw-unit" }, " 条")))),

      h("div", { className: "qbw-search", style: { marginTop: "10px" } },
        h("input", {
          className: "qbw-input", placeholder: "搜标题 / 作者",
          value: viewQ, onChange: (e) => setViewQ(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: loadViews, disabled: !!busy }, busy === "douyin-views" ? "刷新中…" : "刷新")),

      viewErr ? h("div", { className: "qbw-err", style: { margin: "8px 0" } }, `✗ ${viewErr}`) : null,
      !views && !viewErr ? h("div", { className: "qbw-hint", style: { padding: "12px 0" } }, "读取看过的视频…") : null,
      views && viewItems.length === 0
        ? h("div", { className: "qbw-hint" },
          viewQ ? "没有匹配的记录。" : "还没有记录。点上面「现在刷一轮」（或自动到点）后会记在这里。")
        : null,
      viewItems.length
        ? h("div", null, viewItems.map((item, index) => h("div", { className: "qbw-sitem", key: `${item.id}|${item.at}|${index}` },
          h("div", { className: "qbw-srow" },
            h("div", { className: "qbw-srow-main" },
              item.url
                ? h("a", { className: "qbw-vtitle", href: item.url, target: "_blank", rel: "noreferrer" }, item.title || `作品 ${item.id}`)
                : h("span", { className: "qbw-vtitle" }, item.title || `作品 ${item.id}`)),
            item.duration ? h("div", { className: "qbw-srow-acts" }, h(Badge, null, `${Math.round(item.duration)} 秒`)) : null),
          h("div", { className: "qbw-srow-meta" },
            h("span", null, fmtTime(item.at)),
            h("span", null, item.author ? `@${item.author}` : "—")))))
        : null,
      views
        ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
          `共 ${views.total ?? viewItems.length} 条${viewQ ? `（过滤后 ${viewItems.length} 条）` : ""} · 数据文件 ${views.file || "—"}`)
        : null),

    err ? h("div", { className: "qbw-err" }, err) : null);
}


/* ══ pages/90-qq.js ══ */
/* QQ：桥接启停 / 管理员 / 名单 / 模式 / 群分层 / 收尾判断 / 全部 QQ 参数。 */

const QQ_LARGE_PRESETS = [[50, "50 人"], [100, "100 人"], [200, "200 人"], [300, "300 人"], [500, "500 人"], [1000, "1000 人"]];
const QQ_ACTIVE_PRESETS = [[20, "20 条"], [40, "40 条"], [60, "60 条"], [100, "100 条"], [200, "200 条"]];
const QQ_COOLDOWN_PRESETS = [5, 10, 20, 30, 60, 120];

// 有界阈值用下拉：比数字输入框更快，也不会输成奇怪的值。
function QqNumberSelect({ value, presets, onChange }) {
  const opts = presets.slice();
  if (value !== undefined && value !== null && !opts.some(([v]) => Number(v) === Number(value))) {
    opts.push([value, `当前：${value}`]);
  }
  return h("select", {
    className: "qbw-select",
    value: value === undefined || value === null ? "" : String(value),
    onChange: (e) => onChange(e.target.value === "" ? undefined : Number(e.target.value)),
  },
    value === undefined || value === null ? h("option", { value: "" }, "默认") : null,
    opts.map(([v, label]) => h("option", { key: String(v), value: String(v) }, label)));
}

function QqPage({ qq, unified, setQq, setUnified, overview, busy, setBusy, toast, reload, save, onSave, defaults }) {
  const bridge = overview?.bridge ?? {};
  const admin = unified?.admin ?? {};
  // 后端 /config 返回的管理员是 normalizeAdmin() 后的规范形状：
  //   { qq, biliMid, biliName, displayName, gentle }
  // 旧面板只读 admin.mid / admin.name（旧字段名），保存后这两格永远空白 ——
  // 用户看到的是「B站 mid 和称呼保存了但没回显」。这里按规范键读，兼容旧数据。
  const adminMid = admin.biliMid ?? admin.mid ?? "";
  const adminName = admin.displayName ?? admin.name ?? admin.biliName ?? "";
  const allow = unified?.allow ?? {};
  const deny = unified?.deny ?? {};
  const [mode, setMode] = useState(null);
  const [greeting, setGreeting] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [policyErr, setPolicyErr] = useState("");
  const [groups, setGroups] = useState([]);

  useEffect(() => { setMode(overview?.mode?.effective ?? overview?.mode?.local ?? bridge.mode ?? "chat"); }, [overview, bridge.mode]);

  const act = async (action) => {
    setBusy(action);
    try {
      const res = await api("/bridge", { method: "POST", body: { action } });
      toast(res.ok ? `✓ ${res.message ?? "完成"}` : `✗ ${res.error ?? "失败"}`);
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const testGreeting = async () => {
    setBusy("greeting");
    try {
      const r = await api("/bridge", { method: "POST", body: { action: "greeting-test" } });
      setGreeting(r.message || r.text || r.error || JSON.stringify(r));
    } catch (e) { setGreeting(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const switchMode = async (next) => {
    const previous = mode;
    setMode(next);
    try {
      await api("/mode", { method: "POST", body: { mode: next } });
      toast(`✓ 模式已切到 ${next}`);
      await reload();
    } catch (e) {
      // 切换失败要把下拉框退回原值，否则界面显示「已切到 reserved2」，
      // 实际桥接还在旧模式 —— 用户会照着错的模式排查。
      setMode(previous);
      toast(`✗ ${e.message}`);
    }
  };
  // 群分层：静默读取（桥接没跑时不打扰），失败时记下原因让保存按钮禁用。
  const loadPolicy = async (silent = false) => {
    try {
      const r = await api("/group-policy");
      setPolicy(r.policy ?? {});
      setGroups(r.groups ?? []);
      setPolicyErr("");
    } catch (e) {
      setPolicyErr(e.message);
      if (!silent) toast(`✗ ${e.message}`);
    }
  };
  // 挂载时就读一次：面板上的阈值输入框默认写的是 200 / 60，
  // 不读的话用户一点「保存群分层」就会用这两个默认值 + 空 overrides 覆盖掉真实配置。
  useEffect(() => { loadPolicy(true); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);
  const persistPolicy = async (next) => {
    setBusy("policy");
    try {
      const r = await api("/group-policy", {
        method: "POST",
        body: {
          largeThreshold: Number(next.largeThreshold) || 200,
          activeMessageThreshold: Number(next.activeMessageThreshold) || 60,
          overrides: next.overrides ?? {},
        },
      });
      setPolicy(r.policy ?? next);
      setPolicyErr("");
      toast("✓ 群分层已保存");
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const closure = qq?.socialV2?.closure ?? {};
  const setClosure = (key, value) => setQq(["socialV2", "closure", key], value);
  const tools = Object.keys(qq?.socialV2?.tools ?? {});
  const qqGroups = tools.length
    ? [...QQ_FIELDS, { group: "二代 · 工具开关", note: "关掉即从模型工具面移除", fields: tools.map((key) => F(`socialV2.tools.${key}`, TOOL_LABELS[key] ?? key, key, "switch")) }]
    : QQ_FIELDS;

  return h("div", { className: "qbw-page-qq" },
    // 一、运行：状态 + 启停 + 模式，放在最上面
    h(Card, {
      title: "QQ 桥接",
      right: h(StatusDot, { ok: bridge.running && bridge.ok, warn: bridge.running && !bridge.ok }, bridge.running ? (bridge.ok ? "运行中" : "异常") : "未运行"),
    },
      h(KV, { label: "端口" }, bridge.port ?? "—"),
      h(KV, { label: "当前模式" }, overview?.mode?.effective ?? mode ?? "—"),
      h(KV, { label: "白名单" }, `群 ${overview?.mode?.allowGroups ?? 0} · 私 ${overview?.mode?.allowPrivate ?? 0}`),
      h(Row, { label: "插件模式", hint: "chat = 逐条回复；reserved2 = 工具化收发 + 自主潜水" },
        h("select", { className: "qbw-select", value: mode ?? "", onChange: (e) => switchMode(e.target.value) },
          h("option", { value: "chat" }, "chat"),
          h("option", { value: "reserved2" }, "reserved2"))),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => act("start"), disabled: !!busy || bridge.running }, "启动"),
        h(Btn, { kind: "qbw-btn2", onClick: () => act("stop"), disabled: !!busy || !bridge.running }, "停止"),
        h(Btn, { kind: "qbw-btn2", onClick: () => act("restart"), disabled: !!busy }, "重启"),
        h(Btn, { kind: "qbw-btn2", onClick: () => save(true), disabled: !!busy }, "保存并热重载"),
        h(Btn, { kind: "qbw-btn3", onClick: testGreeting, disabled: !!busy }, "测试问候")),
      greeting ? h("div", { className: "qbw-out" }, greeting) : null),

    // 二、身份与权限：管理员 + 白名单/黑名单统一成一张卡
    h(Card, { title: "身份与权限", note: "管理员决定谁是主人；白名单决定回哪些会话，黑名单优先级更高" },
      h("div", { className: "qbw-group" }, "管理员（QQ ⇄ B站 · 同一个人）"),
      h(Row, { label: "主人 QQ" },
        h("input", { className: "qbw-input", value: admin.qq ?? "", placeholder: "例如 1000000001", onChange: (e) => setUnified(["admin", "qq"], e.target.value) })),
      h(Row, { label: "主人 B站 mid", hint: "填了之后身份对齐会按这个 mid 认人" },
        h("input", { className: "qbw-input", value: adminMid, placeholder: "例如 123456", onChange: (e) => setUnified(["admin", "biliMid"], e.target.value) })),
      h(Row, { label: "称呼", hint: "对齐表里没有称呼时的兜底" },
        h("input", { className: "qbw-input", value: adminName, placeholder: "例如 主人", onChange: (e) => setUnified(["admin", "displayName"], e.target.value) })),

      h("div", { className: "qbw-group" }, "谁能找她"),
      h(Row, { label: "群号", hint: "逗号分隔；只回这些群" }, h(ListInput, { value: allow.groups ?? [], onChange: (v) => setUnified(["allow", "groups"], v) })),
      h(Row, { label: "私聊 QQ", hint: "逗号分隔；管理员必须在里面" }, h(ListInput, { value: allow.private ?? [], onChange: (v) => setUnified(["allow", "private"], v) })),
      h(Row, { label: "名单为空时放行全部", hint: "默认关；开了等于不设白名单" },
        h("label", { className: "qbw-check" },
          h("input", { className: "qbw-switch", type: "checkbox", checked: unified?.allowAllWhenEmpty === true, onChange: (e) => setUnified(["allowAllWhenEmpty"], e.target.checked) }),
          h("span", null, unified?.allowAllWhenEmpty === true ? "已开启" : "已关闭"))),
      (admin.qq && !(allow.private ?? []).map(String).includes(String(admin.qq)))
        ? h("div", { className: "qbw-warnbox" }, `⚠️ 管理员 QQ ${admin.qq} 不在私聊白名单里：私聊和审批会被拦截。`)
        : null,
      h(Section, { title: "黑名单", note: "优先级高于白名单；默认收起，误伤时再展开", defaultOpen: false },
        h(Row, { label: "用户 QQ" }, h(ListInput, { value: deny.users ?? [], onChange: (v) => setUnified(["deny", "users"], v) })),
        h(Row, { label: "群号" }, h(ListInput, { value: deny.groups ?? [], onChange: (v) => setUnified(["deny", "groups"], v) })),
        h(Row, { label: "私聊 QQ" }, h(ListInput, { value: deny.private ?? [], onChange: (v) => setUnified(["deny", "private"], v) })))),

    // 三、群聊行为：低频参数统一收起，展开后群分层 / 收尾判断各自成块
    h(Section, { title: "群聊行为（低频）", note: "群分层 / 对话收尾：默认不用动，误判时再展开", defaultOpen: false },
      h(Section, { title: "群分层", note: "小群保留积极唤醒；大群 / 高活跃群只保留真正点名", collapsible: false },
        h(Row, { label: "大群人数阈值" },
          h(QqNumberSelect, {
            value: policy?.largeThreshold,
            presets: QQ_LARGE_PRESETS,
            onChange: (v) => setPolicy((p) => ({ ...(p ?? {}), largeThreshold: v })),
          })),
        h(Row, { label: "高活跃阈值（近 10 分钟消息）" },
          h(QqNumberSelect, {
            value: policy?.activeMessageThreshold,
            presets: QQ_ACTIVE_PRESETS,
            onChange: (v) => setPolicy((p) => ({ ...(p ?? {}), activeMessageThreshold: v })),
          })),
        h("div", { className: "qbw-hint" }, "人数过多或过于活跃的群会加快 Token 消耗，请谨慎设置阈值。"),
        policyErr ? h("div", { className: "qbw-warnbox" }, `读不到当前群分层（${policyErr}）：先启动桥接再保存，否则会用默认值覆盖已有配置。`) : null,
        h("div", { className: "qbw-actions" },
          h(Btn, { onClick: () => persistPolicy(policy ?? {}), disabled: !!busy || !policy }, busy === "policy" ? "保存中…" : "保存群分层"),
          h(Btn, { kind: "qbw-btn2", onClick: () => { setPolicyOpen(true); loadPolicy(); }, disabled: !!busy }, "查看群列表"))),

      h(Section, { title: "对话收尾判断", note: "每段对话有自然终点：结束不是潜水，被叫到 / 私聊仍会醒", collapsible: false },
        h(Row, { label: "启用收尾判断" },
          h("label", { className: "qbw-check" },
            h("input", { className: "qbw-switch", type: "checkbox", checked: closure.enabled !== false, onChange: (e) => setClosure("enabled", e.target.checked) }),
            h("span", null, closure.enabled !== false ? "已开启" : "已关闭"))),
        h(Row, { label: "收尾后软冷却" },
          (() => {
            const minutes = Math.round(Number(closure.cooldownMs ?? 1200000) / 60000);
            const presets = QQ_COOLDOWN_PRESETS.includes(minutes) ? QQ_COOLDOWN_PRESETS.slice() : [...QQ_COOLDOWN_PRESETS, minutes];
            return h("select", {
              className: "qbw-select", value: String(minutes),
              onChange: (e) => setClosure("cooldownMs", Math.max(1, Number(e.target.value) || 1) * 60000),
            },
              presets.map((value) => h("option", { key: String(value), value: String(value) }, `${value} 分钟`)));
          })()),
        h(Section, { title: "高级判断参数", note: "默认不动：只有误判收尾 / 该醒没醒时才调", defaultOpen: false },
          h(Row, { label: "对方还在问时拒绝收尾" },
            h("input", { className: "qbw-switch", type: "checkbox", checked: closure.requireNoOpenQuestion !== false, onChange: (e) => setClosure("requireNoOpenQuestion", e.target.checked) })),
          h(Row, { label: "每次唤醒注入判断参数" },
            h("input", { className: "qbw-switch", type: "checkbox", checked: closure.promptInWake !== false, onChange: (e) => setClosure("promptInWake", e.target.checked) }))),
        h("div", { className: "qbw-hint" }, "改完先保存，再点上方「保存并热重载」生效。"))),

    // 四、低频全量参数
    h(AdvancedSettings, { note: "全部 QQ 参数：接入、仿真、鱼群、唤醒、发送、工具与媒体；改完统一点底部保存" },
      h(FieldGroups, {
        groups: qqGroups,
        cfg: qq,
        set: setQq,
        categories: QQ_ADV_CATEGORIES,
        onSave,
        defaults: defaults?.qq ?? null,
      })),

    policyOpen ? h(Modal, { title: "群分层", onClose: () => setPolicyOpen(false), width: 560 },
      groups.length === 0 ? h("div", { className: "qbw-hint" }, "桥接没在跑或还没进群：没有可判定的群。") : null,
      groups.slice(0, 30).map((g) => h("div", { key: g.key, className: "qbw-item" },
        h("div", null,
          h("div", { className: "qbw-label" }, g.name || g.key, h(Badge, null, g.tier === "large" ? "大群" : "小群")),
          h("div", { className: "qbw-hint" }, `${g.key} · 人数 ${g.memberCount || "未知"} · 近10分钟 ${g.activityCount ?? 0} 条 · 判定 ${g.source}`)),
        h("select", {
          className: "qbw-select",
          value: policy?.overrides?.[g.key] || g.override || "auto",
          onChange: (e) => {
            const next = { ...(policy ?? {}), overrides: { ...(policy?.overrides ?? {}), [g.key]: e.target.value } };
            setPolicy(next);
            persistPolicy(next);
          },
        },
          h("option", { value: "auto" }, "自动"),
          h("option", { value: "small" }, "强制小群"),
          h("option", { value: "large" }, "强制大群"))))) : null);
}


/* ══ 99-whale-widget.js ══ */
/* ─────────────────────────────────────────────────────────────────────────
 * 99-whale-widget —— 合并后挂件的兜底注入
 * 正常路径由宿主半边（whale-widget/lib/index.js）的 tapIndex / index-inject
 * 把 /dsh-whale/widget.js 注入 HTML；这里再补一条客户端注入，保证“客户端 bundle
 * 已加载但 HTML 注入没生效”的环境也能出现挂件。重复注入会由挂件自身的
 * window.__dshWhaleWidget 守卫拦掉。
 * ───────────────────────────────────────────────────────────────────────── */
function appendWhaleWidget() {
  try {
    if (window.__dshWhaleWidget) return;
    if (document.querySelector("script[data-dsh-whale-widget]")) return;
    if (document.querySelector('script[src*="/dsh-whale/widget.js"]')) return;
    const script = document.createElement("script");
    script.src = "/dsh-whale/widget.js?merged=1";
    script.async = true;
    script.dataset.dshWhaleWidget = "1";
    script.onerror = function () {};
    const parent = document.body || document.head || document.documentElement;
    if (parent) parent.appendChild(script);
  } catch (err) {}
}


    return module.exports;
  },
});
