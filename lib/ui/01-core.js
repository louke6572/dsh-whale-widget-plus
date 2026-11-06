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
