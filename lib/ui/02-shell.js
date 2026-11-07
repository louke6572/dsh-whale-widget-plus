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
  { title: "系统", pages: [["tokens", "额度"], ["voice", "语音设置"], ["capabilities", "模块中心"], ["install", "安装与维护"]] },
];
const NAV_NAME = "dsh-Dfy";

/* 设置页 id → 功能模块 id（与 backend/lib/modules.js 对应）。
   没在表里的页（概览/模型/额度/模块中心/安装与维护）是壳的一部分，不参与启停。 */
const PAGE_MODULE = {
  bili: "bili", tieba: "tieba", douyin: "douyin", qq: "qq",
  characters: "characters", memory: "memory", pet: "pet", voice: "voice",
};

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
  // 模块中心里停用的栏位，从导航里消失；当前页被停用时退回概览。
  const enabledModules = unified?.modules ?? {};
  const visibleGroups = useMemo(() => NAV_GROUPS
    .map((g) => ({ ...g, pages: g.pages.filter(([id]) => enabledModules[PAGE_MODULE[id] ?? ""] !== false) }))
    .filter((g) => g.pages.length > 0), [unified]);
  useEffect(() => {
    if (!visibleGroups.some((g) => g.pages.some(([id]) => id === tab))) setTab("overview");
  }, [visibleGroups, tab]);
  const groupOf = visibleGroups.find((g) => g.pages.some(([id]) => id === tab)) ?? visibleGroups[0] ?? NAV_GROUPS[0];

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
    if (id === "capabilities") return h(CapabilitiesPage, shared);
    if (id === "memory") return h(MemoryPage, shared);
    return h("div", { className: "qbw-hint" }, `未知页面：${id}`);
  };

  const renderNav = () => {
    const gi = visibleGroups.indexOf(groupOf);
    return h("div", { className: "qbw-nav" },
      h("div", { className: "qbw-nav-groups" },
        visibleGroups.map((g, i) => h("button", {
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
