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
