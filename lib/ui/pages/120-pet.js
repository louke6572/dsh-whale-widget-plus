/* 我的 dsh-Dfy 桌宠：主动找主人的载体与节奏。挂件核心由 dsh-Dfy 主包统一负责。 */

function PetPage({ qq, setQq, unified, setUnified, busy, setBusy, toast, reload }) {
  const P = qq?.purpose ?? {};
  const pv = (key, fallback) => (P[key] === undefined || P[key] === null || P[key] === "" ? fallback : P[key]);
  const setP = (key, value) => setQq(["purpose", key], value);
  const carrier = P.carrier === "pet" ? "pet" : "qq";

  const [purpose, setPurpose] = useState(null);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");

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
      h(KV, { label: "气泡里快捷回复" }, petAvail.online ? "可用（点气泡上的「回复」）" : "挂件在线后可用"),
      // 演示按钮：不生成模型回复，只推一条假事件，专门用来验证气泡链路；顺带回显挂件是否在轮询。
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: demoBubble, disabled: !!busy }, busy === "bubble-demo" ? "演示中…" : "演示气泡"),
        h("span", { className: "qbw-hint" }, petAvail.online ? "挂件在线，会收到气泡" : "挂件未在线：桌面收不到气泡（先把 dsh-Dfy 挂件页面开着）"))),

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
