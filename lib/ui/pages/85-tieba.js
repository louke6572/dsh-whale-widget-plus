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
