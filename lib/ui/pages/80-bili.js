/* 养鱼（B站）：账号 / 扫码 / 口味与作息 / 分享到 QQ / 全部 B站参数。 */

function BiliPage({ bili, qq, unified, setBili, setQq, setUnified, overview, busy, setBusy, toast, reload, save, goTab }) {
  const info = overview?.bili ?? {};
  const [accounts, setAccounts] = useState(null);
  const [checks, setChecks] = useState({});
  const [pending, setPending] = useState([]);
  const [qr, setQr] = useState(null);
  const [qrErr, setQrErr] = useState("");
  const [deps, setDeps] = useState("");
  const [scan, setScan] = useState("");
  const [query, setQuery] = useState("");

  const loadAccounts = useCallback(async () => {
    try { setAccounts(await api("/bili/accounts")); } catch { setAccounts(null); }
  }, []);
  const loadPending = useCallback(async () => {
    try { setPending((await api("/bili/pending")).items ?? []); } catch { /* 旧宿主没有 */ }
  }, []);
  useEffect(() => { loadAccounts(); loadPending(); }, [loadAccounts, loadPending]);

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
          setQr((v) => ({ ...v, done: true }));
          toast(`✓ 扫码登录成功${r.account?.name ? `：${r.account.name}` : ""}`);
          await loadAccounts();
          await reload();
        } else if (r.status === "expired" || r.error) {
          setQr((v) => ({ ...v, done: true }));
          setQrErr(r.error || "二维码已过期，请重新扫码");
        }
      } catch (e) { /* 继续等 */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [qr?.id, qr?.done, loadAccounts, reload]);

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

  const filtered = query.trim()
    ? BILI_FIELDS
      .map((g) => ({ ...g, fields: g.fields.filter((f) => `${g.group} ${f.label} ${f.hint ?? ""} ${f.path.join(".")}`.toLowerCase().includes(query.trim().toLowerCase())) }))
      .filter((g) => g.fields.length)
    : BILI_FIELDS;

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

  return h("div", null,
    h(Card, {
      title: "B站 记忆",
      right: h(StatusDot, { ok: info.available, warn: info.enabled && !info.available }, info.available ? "已生成" : "暂无"),
    },
      h(KV, { label: "简报" }, `${info.briefChars ?? 0} 字`),
      h(KV, { label: "隐私复检" }, info.blocked ? "命中已拦截" : "通过"),
      h(KV, { label: "同步到 QQ" }, info.enabled ? "开" : "关"),
      h(KV, { label: "生成时间" }, fmtTime(info.generatedAt)),
      h("div", { className: "qbw-actions" },
        h(Btn, {
          kind: "qbw-btn2", disabled: !!busy,
          onClick: async () => {
            setBusy("refresh-bili");
            try {
              const r = await api("/memory", { method: "POST", body: { action: "refresh-bili" } });
              toast(r.ok ? "✓ B站记忆已刷新" : `✗ ${r.error ?? "失败"}`);
              await reload();
            } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
          },
        }, "刷新记忆"),
        h(Btn, { kind: "qbw-btn3", onClick: () => goTab?.("memory") }, "记忆同步"))),

    h(Card, { title: "B站 登录账号", note: "「核查」会读凭据文件再问一次 B站，确认登录还有效、mid 没串" },
      accountRow("fish", "小肥鱼"),
      accountRow("owner", "主人")),

    qr ? h(Modal, { title: "扫码登录 B站", onClose: cancelQr, width: 420 },
      qr.done ? h("div", { className: "qbw-hint" }, "已完成，窗口即将关闭。") :
        h("div", null,
          qr.qrDataUrl || qr.image || qr.dataUrl || qr.qr
            ? h("img", { src: qr.qrDataUrl || qr.image || qr.dataUrl || qr.qr, style: { width: "100%", borderRadius: "8px" } })
            : h("div", { className: "qbw-hint" }, qr.url ? `在浏览器打开：${qr.url}` : "二维码生成中…"),
          h("div", { className: "qbw-hint", style: { marginTop: "8px" } }, "用 B站 App 扫码确认；登录成功后这里会自动刷新。"),
          h("div", { className: "qbw-actions" }, h(Btn, { kind: "qbw-btn2", onClick: cancelQr }, "取消")),
          qrErr ? h("div", { className: "qbw-err" }, qrErr) : null)) : null,

    pending.length
      ? h(Card, { title: `待处理（${pending.length}）`, note: "她自己决定要发的内容，等你确认" },
        pending.slice(0, 10).map((item) => h(SRow, {
          key: item.id,
          title: item.title || item.kind || "待处理",
          actions: [
            h(Btn, { key: "a", onClick: () => actPending("approve", item.id), disabled: !!busy }, "通过"),
            h(Btn, { key: "r", kind: "qbw-btn2", onClick: () => actPending("reject", item.id), disabled: !!busy }, "拒绝"),
          ],
          meta: [item.text || item.summary || null],
        }))) : null,

    h(AdvancedSettings, { note: "口味扫描 / 依赖检查 / 全部 B站 参数：调教时再展开" },
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: () => scanPrefs("fish"), disabled: !!busy }, busy === "prefs" ? "扫描中…" : "扫描口味"),
        h(Btn, { kind: "qbw-btn2", onClick: runDeps, disabled: !!busy }, busy === "deps" ? "检查中…" : "依赖检查")),
      scan ? h("div", { className: "qbw-out" }, scan) : null,
      deps ? h("div", { className: "qbw-out" }, deps) : null,
      h("div", { className: "qbw-search" },
        h("input", { className: "qbw-input", placeholder: "搜索 B站 参数", value: query, onChange: (e) => setQuery(e.target.value) }),
        query ? h(Btn, { kind: "qbw-btn2", onClick: () => setQuery("") }, "清空") : null),
      h(FieldGroups, {
        groups: filtered,
        cfg: bili,
        set: setBili,
        categories: BILI_ADV_CATEGORIES,
        onSave: () => save(false),
      })),

    h(Card, { title: "B站 → QQ 自动分享", note: "写根配置的 biliBridge；保存后重启 QQ 桥接才生效" },
      h(FieldGroups, {
        groups: [{ group: "分享与动态", fields: QQ_BILI_SHARE_FIELDS }],
        cfg: qq,
        set: setQq,
        onSave: () => save(false),
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
    );
}
