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
