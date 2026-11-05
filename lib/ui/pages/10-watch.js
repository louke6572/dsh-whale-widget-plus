/* 观看历史：她真正看过 / 点过赞的视频，按当前角色隔离。 */

function WatchPage({ busy, setBusy, toast, goTab }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setBusy("watch-load");
    try { setData(await api("/watch-history?limit=300")); setErr(""); }
    catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }, [setBusy]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const all = Array.isArray(data?.items) ? data.items : [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((x) => `${x.title} ${x.up} ${x.bvid}`.toLowerCase().includes(needle));
  }, [data, q]);

  const stats = data?.stats ?? {};
  const actions = data?.actions ?? {};
  const actionsReady = Boolean(data && data.actions);
  const fmtDur = (sec) => {
    const n = Number(sec) || 0;
    if (!n) return "—";
    return n >= 3600
      ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
      : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  };
  const modeText = (item) => item.mode === "memory" ? "旧记忆" : item.mode === "full" ? (item.frames ? "深看 · 有截图" : "深看") : item.mode === "frames" ? "抽帧" : "浅看";
  const timeText = (item) => {
    if (item.unknownDate) return "日期未知";
    if (item.dateOnly) return `${new Date(item.at).toLocaleDateString("zh-CN")}（旧记忆）`;
    return fmtTime(item.at);
  };
  const badgeOf = (kind) => kind === "gather" ? "warn" : (kind === "ta" || kind === "share" ? "ok" : "");
  const toggleRow = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const actionCell = (item, rowKey) => {
    if (!actionsReady) return h("span", { className: "qbw-hint" }, "—");
    const list = Array.isArray(item.actions) ? item.actions : [];
    if (!list.length) return h("span", { className: "qbw-hint" }, "仅看了");
    const open = expanded.has(rowKey);
    const shown = open ? list : list.slice(0, 3);
    const rest = list.length - shown.length;
    return h("div", { className: "qbw-list", style: { gap: "3px" } },
      shown.map((action, index) => h("div", { key: `${action.kind}|${action.at}|${index}`, style: { display: "flex", gap: "6px", alignItems: "baseline", flexWrap: "wrap" } },
        h(Badge, { kind: badgeOf(action.kind) }, action.label),
        action.text ? h("span", { className: "qbw-hint", style: { maxWidth: "240px" } }, action.text) : null,
        h("span", { className: "qbw-hint" }, fmtTime(action.at).slice(5, 16)),
        action.beforeFirstWatch ? h("span", { className: "qbw-hint" }, "早于本地观看") : null)),
      rest > 0 ? h(Btn, { kind: "qbw-btn2", onClick: () => toggleRow(rowKey) }, `展开 +${rest}`) : null,
      open && list.length > 3 ? h(Btn, { kind: "qbw-btn2", onClick: () => toggleRow(rowKey) }, "收起") : null);
  };

  return h("div", null,
    h("div", { className: "qbw-hint", style: { marginBottom: "8px" } },
      "她真正看过 / 点过赞的视频，按当前角色隔离。debrief 与 watch-video 自动记账。"),

    h("div", { className: "qbw-stats" },
      h("div", { className: "qbw-stat" }, h("div", null, "今天"), h("div", null, stats.today ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
      h("div", { className: "qbw-stat" }, h("div", null, "最近 7 天"), h("div", null, stats.last7d ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
      h("div", { className: "qbw-stat" }, h("div", null, "深看 / 抽帧"), h("div", null, stats.deep ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
      h("div", { className: "qbw-stat" }, h("div", null, "不同视频"), h("div", null, stats.uniqueVideos ?? 0, h("span", { className: "qbw-unit" }, " 条")))),

    h("div", { className: "qbw-search", style: { marginTop: "10px" } },
      h("input", { className: "qbw-input", placeholder: "搜标题 / UP / BV", value: q, onChange: (e) => setQ(e.target.value) }),
      h(Btn, { kind: "qbw-btn2", onClick: load, disabled: !!busy }, busy === "watch-load" ? "刷新中…" : "刷新")),

    actionsReady
      ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
        `操作：评论 ${actions.comments ?? 0}（主评论 ${actions.main ?? 0} · 聚拢 ${actions.gather ?? 0} · 回复 ${actions.reply ?? 0} · 搭话 ${actions.ta ?? 0} · 分享 ${actions.share ?? 0}）· 收藏 ${actions.favorite ?? 0} · 动态 ${actions.dynamic ?? 0} · 仅看 ${actions.watchedOnly ?? 0}`)
      : null,
    data && !actionsReady
      ? h("div", { className: "qbw-warnbox", style: { marginTop: "8px" } }, "操作列需要新版宿主：重启 DSH 或重载插件后再刷新。")
      : null,
    err ? h("div", { className: "qbw-err", style: { margin: "8px 0" } }, `✗ ${err}`) : null,
    !data && !err ? h("div", { className: "qbw-hint", style: { padding: "20px 0" } }, "读取观看历史…") : null,

    data && items.length === 0
      ? h(Card, null, h("div", { className: "qbw-hint" }, q ? "没有匹配的记录。" : "还没有观看记录。下一次 debrief / watch-video 会自动记一笔。"))
      : null,

    items.length
      ? h("div", { style: { marginTop: "4px" } },
        items.map((item, i) => {
          const rowKey = `${item.bvid}|${item.at}|${i}`;
          const title = item.bvid
            ? h("a", { className: "qbw-vtitle", href: `https://www.bilibili.com/video/${item.bvid}`, target: "_blank", rel: "noreferrer" }, item.title || item.bvid)
            : h("span", { className: "qbw-vtitle" }, item.title || "（无标题）");
          return h("div", { className: "qbw-sitem", key: rowKey },
            h("div", { className: "qbw-srow" },
              h("div", { className: "qbw-srow-main" }, title),
              h("div", { className: "qbw-srow-acts" },
                h(Badge, { kind: item.mode === "full" || item.mode === "frames" ? "ok" : "" }, modeText(item)),
                item.score == null ? null : h(Badge, null, `${item.score}/20`))),
            h("div", { className: "qbw-srow-meta" },
              h("span", null, timeText(item)),
              h("span", null, item.up || "—"),
              h("span", null, fmtDur(item.duration)),
              item.bvid ? h("span", null, item.bvid) : null),
            h("div", { style: { paddingTop: "3px" } }, actionCell(item, rowKey)));
        }))
      : null,

    data
      ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
        `共 ${data.total ?? items.length} 条${q ? `（过滤后 ${items.length} 条）` : ""} · 数据文件 ${data.file || "—"}`)
      : null);
}
