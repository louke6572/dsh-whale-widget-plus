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
