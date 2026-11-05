/* 记忆同步：记忆卡容量 + QQ ⇄ B站 双向脱敏同步。 */

function MemoryPage({ qq, unified, rawUnified, setUnified, overview, busy, setBusy, toast, reload, goTab }) {
  const [data, setData] = useState(null);
  const [card, setCard] = useState(null);
  const [err, setErr] = useState("");

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
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: () => run("compact", () => api("/memory-card", { method: "POST", body: { action: "compact", targetRatio: 0.8 } }), (r) => `✓ 已压缩（降级 ${r.steps ?? 0} 档）`),
        }, "压缩到 80%"),
        h(Btn, { kind: "qbw-btn3", onClick: () => goTab?.("characters") }, "角色与存档"))),

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

    err ? h("div", { className: "qbw-err" }, err) : null);
}
