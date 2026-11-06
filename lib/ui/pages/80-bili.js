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
