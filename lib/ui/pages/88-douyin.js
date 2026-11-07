/* 抖音（第四个平台）：账号 / 观看时间与额度 / 手动操作 / 看过的视频。
   和 B站、贴吧同一套页面骨架：只看统一配置 unified.douyin，保存走外壳的「保存」。 */

const DOUYIN_MINUTES = [[5, "5 分钟"], [10, "10 分钟"], [15, "15 分钟（默认）"], [30, "30 分钟"], [60, "60 分钟"]];
const DOUYIN_REQUESTS = [[10, "10 次"], [30, "30 次（默认）"], [60, "60 次"], [100, "100 次"]];
const DOUYIN_DWELL = [[10, "10 秒"], [20, "20 秒"], [30, "30 秒（默认）"], [60, "60 秒"]];
const DOUYIN_MAX_VIDEOS = [[3, "3 条"], [5, "5 条（默认）"], [8, "8 条"], [10, "10 条"]];
const DOUYIN_GAP = [[15, "15 分钟"], [30, "30 分钟（默认）"], [60, "1 小时"], [120, "2 小时"]];

function DouyinPage({ unified, setUnified, busy, setBusy, toast }) {
  const dy = unified?.douyin ?? {};
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");
  const [views, setViews] = useState(null);
  const [viewQ, setViewQ] = useState("");
  const [viewErr, setViewErr] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [awemeInput, setAwemeInput] = useState("");
  const [comments, setComments] = useState(null);
  const [notices, setNotices] = useState(null);
  const [debrief, setDebrief] = useState(null);
  // 抖音私信 / 群聊：douyin-im 长连接（不需要浏览器）
  const [im, setIm] = useState(null);
  const [imContacts, setImContacts] = useState(null);
  const [imIds, setImIds] = useState([]);
  const [imMobile, setImMobile] = useState("");
  const [imCode, setImCode] = useState("");
  const [imNames, setImNames] = useState("");
  const [imTest, setImTest] = useState(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await api("/douyin")); setErr(""); }
    catch (e) { setErr(`读取抖音状态失败：${e.message}`); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  const loadIm = useCallback(async () => {
    try {
      const r = await api("/douyin", { method: "POST", body: { action: "im-status" } });
      setIm(r);
      if (Array.isArray(r?.allowlist)) setImIds(r.allowlist.map((item) => item.id));
      if (Array.isArray(r?.mentionNames)) setImNames(r.mentionNames.join("，"));
    } catch { /* 还没登录时静默 */ }
  }, []);
  useEffect(() => { loadIm(); }, [loadIm]);
  useEffect(() => {
    const phase = im?.phase;
    if (!phase || phase === "idle" || phase === "offline" || phase === "error") return;
    const timer = setInterval(() => { loadIm(); }, phase === "online" ? 15000 : 3000);
    return () => clearInterval(timer);
  }, [im?.phase, loadIm]);

  // 自动观看时状态会变（翻了几条、剩多少分钟），页面开着就每 15 秒刷一次。
  useEffect(() => {
    if (!status?.watching) return;
    const timer = setInterval(() => { loadStatus().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [status?.watching, loadStatus]);

  const loadViews = useCallback(async () => {
    setBusy("douyin-views");
    try { setViews(await api("/douyin/history?limit=300")); setViewErr(""); }
    catch (e) { setViewErr(e.message); }
    finally { setBusy(""); }
  }, [setBusy]);
  useEffect(() => { loadViews(); }, [loadViews]);

  const call = async (action, body = {}, okText = "") => {
    setBusy(`douyin-${action}`);
    setErr("");
    try {
      const result = await api("/douyin", { method: "POST", body: { action, ...body } });
      if (result?.ok === false) throw new Error(result.error ?? "失败");
      if (okText) toast(okText);
      await loadStatus();
      if (action === "start" || action === "stop") loadViews().catch(() => {});
      return result;
    } catch (e) {
      setErr(e.message);
      toast(`✗ ${e.message}`);
      return null;
    } finally {
      setBusy("");
    }
  };

  const openWindow = () => call("open", {}, "✓ 已打开抖音专用窗口（在里面扫码登录）");
  const browseNow = () => call("start", { reason: "手动" }, "✓ 已开始刷一轮；结果会出现在「看过的视频」");
  const stopNow = () => call("stop", {}, "✓ 已停止并暂停");
  const nextOne = () => call("next", {}, "✓ 已到下一条");
  const readCurrent = () => call("current", {}, "");
  const doSearch = async () => {
    if (!query.trim()) { toast("✗ 先输入搜索词"); return; }
    const result = await call("search", { query: query.trim() }, "");
    if (result) setResults(result.results ?? []);
  };

  // 读评论 / 通知：只读，不占观看额度；评论图片会落到本机目录。
  const loadComments = async () => {
    const raw = awemeInput.trim();
    if (!raw) { toast("✗ 先粘贴视频链接或作品 id"); return; }
    const body = /^\d{6,25}$/.test(raw) ? { awemeId: raw, max: 20 } : { url: raw, max: 20 };
    const result = await call("comments", body, "");
    if (result) setComments(result);
  };
  const loadNotices = async () => {
    const result = await call("notices", { count: 20 }, "");
    if (result) setNotices(result);
  };
  // 「看懂一条」：文案 + 时长 + 数据 + 弹幕 + 热评（不下载、不装模型）。
  const loadDebrief = async () => {
    const raw = awemeInput.trim();
    const body = /^\d{6,25}$/.test(raw) ? { awemeId: raw } : (raw ? { url: raw } : {});
    const result = await call("debrief", body, "");
    if (result) setDebrief(result);
  };

  // 抖音私信：扫码/短信登录 → 读取好友和群 → 勾选许可 → 打开开关。
  const imLoginQr = async () => {
    await call("im-login-qr", {}, "✓ 请用抖音 App 扫码，并在手机上确认");
    loadIm();
  };
  const imLoginSms = async () => {
    await call("im-login-sms", { mobile: imMobile.trim() }, "✓ 验证码已发送（看手机）");
    loadIm();
  };
  const imSubmitCode = async () => {
    await call("im-sms-code", { code: imCode.trim() }, "✓ 验证码已提交");
    loadIm();
  };
  const imLogoutNow = async () => {
    await call("im-logout", {}, "✓ 已退出抖音 IM");
    setImContacts(null);
    loadIm();
  };
  const imLoadContacts = async () => {
    const result = await call("im-contacts", {}, "✓ 好友和群已读取");
    if (result) setImContacts(result);
    loadIm();
  };
  const imToggleId = (id) => setImIds((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const imSaveAndToggle = async (next) => {
    const names = imNames.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
    const picked = (imContacts?.contacts ?? []).filter((item) => imIds.includes(item.id));
    const list = picked.length ? picked : (im?.allowlist ?? []);
    if (next && !list.length) { toast("✗ 先点「读取好友和群」，勾选要回的人/群"); return; }
    await call("im-config", {
      enabled: next,
      allowlist: list.map((item) => ({ id: item.id, name: item.name, isGroup: item.isGroup === true })),
      mentionNames: names.length ? names : ["大肥鱼"],
    }, "");
    if (next) await call("im-start", {}, "✓ 已开启自动回复（不需要开浏览器）");
    else await call("im-stop", {}, "✓ 已关闭自动回复");
    loadIm();
  };
  const imSaveConfig = async (patch = {}) => {
    await call("im-config", patch, "✓ 已保存");
    loadIm();
  };
  const imRunSelftest = async () => {
    setImTest(null);
    const result = await call("im-selftest", {}, "");
    if (result) {
      setImTest(result);
      toast(`✓ 回复链路正常：${String(result.reply ?? "").slice(0, 30)}`);
    }
  };

  const policy = status?.policy;
  const browser = status?.browser ?? {};
  const page = status?.page;
  const allowed = Boolean(policy?.allowed);
  const watching = Boolean(status?.watching);
  const loginBlocked = Boolean(page?.loginRequired);
  const remainingMin = policy?.daily?.remainingSeconds == null ? null : Math.round(policy.daily.remainingSeconds / 60);
  const usedMin = policy?.daily?.usedSeconds == null ? 0 : Math.round(policy.daily.usedSeconds / 60);

  const boolRow = (key, label, hint) => {
    const on = dy[key] === true;
    return h(Row, { label, hint },
      h("label", { className: "qbw-check" },
        h("input", {
          className: "qbw-switch", type: "checkbox", checked: on,
          onChange: (e) => setUnified(["douyin", key], e.target.checked),
        }),
        h("span", null, on ? "已开启" : "已关闭")));
  };
  const selectRow = (key, label, hint, presets, fallback) =>
    h(Row, { label, hint },
      h("select", {
        className: "qbw-select",
        value: String(dy[key] ?? fallback),
        onChange: (e) => setUnified(["douyin", key], Number(e.target.value)),
      }, presets.map(([value, text]) => h("option", { key: String(value), value: String(value) }, text))));

  const viewItems = useMemo(() => {
    const all = Array.isArray(views?.items) ? views.items : [];
    const needle = viewQ.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) => `${item.title} ${item.author}`.toLowerCase().includes(needle));
  }, [views, viewQ]);
  const viewStats = views?.stats ?? {};

  const login = status?.login ?? {};
  const persisted = login.persisted === true;

  const debriefBlock = debrief
    ? h("div", { style: { marginTop: "8px" } },
      h("div", { className: "qbw-hint", style: { whiteSpace: "pre-wrap", lineHeight: 1.5 } }, debrief.text || debrief.desc || ""),
      debrief.note ? h("div", { className: "qbw-hint", style: { marginTop: "4px" } }, `⚠️ ${debrief.note}`) : null)
    : null;

  // 抖音 IM 的小块：先算成变量，避免 return 里嵌套过深。
  const imPhaseText = im?.phase === "online"
    ? `已上线：${im.nickname || im.uid || "抖音账号"}`
    : im?.phase === "need-qr" ? "等待扫码"
      : im?.phase === "need-sms" ? `等待短信验证码（${im.smsMobile || "手机"}）`
        : im?.phase === "verification" ? "需要完成安全验证"
          : im?.phase === "starting" ? "正在连接…"
            : im?.phase === "error" ? `出错：${im.error || "未知错误"}`
              : im?.phase === "offline" ? "已掉线（会自动重连）"
                : "未登录";

  const imLoginBlock = h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
    h("div", { className: "qbw-actions" },
      h(Btn, { onClick: imLoginQr, disabled: !!busy }, busy === "douyin-im-login-qr" ? "获取二维码中…" : "扫码登录"),
      h("input", {
        className: "qbw-input", placeholder: "手机号（短信登录）",
        value: imMobile, onChange: (e) => setImMobile(e.target.value),
      }),
      h(Btn, { kind: "qbw-btn2", onClick: imLoginSms, disabled: !!busy }, "发验证码")),
    im?.phase === "need-sms"
      ? h("div", { className: "qbw-actions", style: { marginTop: "8px" } },
        h("input", {
          className: "qbw-input", placeholder: "短信验证码",
          value: imCode, onChange: (e) => setImCode(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: imSubmitCode, disabled: !!busy }, "提交验证码"))
      : null,
    im?.qr
      ? h("div", { style: { marginTop: "10px" } },
        h("img", {
          src: im.qr, alt: "抖音登录二维码",
          style: { width: "180px", height: "180px", display: "block", borderRadius: "8px" },
        }),
        h("div", { className: "qbw-hint" }, "用抖音 App 扫码，并在手机上确认登录。"))
      : null,
    im?.phase === "verification"
      ? h("div", { className: "qbw-hint" }, "已打开抖音的验证页；完成验证后会自动继续登录。")
      : null);

  const imContactsBlock = imContacts
    ? ((imContacts.contacts ?? []).length
      ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
        (imContacts.contacts ?? []).map((item) => h("label", {
          key: item.id, className: "qbw-check",
          style: { display: "flex", gap: "8px", alignItems: "center", padding: "4px 0" },
        },
          h("input", {
            type: "checkbox", className: "qbw-switch",
            checked: imIds.includes(item.id),
            onChange: () => imToggleId(item.id),
          }),
          h("span", null, `${item.name || item.id}${item.isGroup ? `（群聊${item.memberCount ? ` · ${item.memberCount} 人` : ""}）` : ""}`))))
      : h("div", { className: "qbw-hint" }, "没有读到好友或群。"))
    : null;

  const imAllowBlock = !imContacts && (im?.allowlist ?? []).length
    ? h("div", { className: "qbw-hint", style: { marginTop: "6px" } },
      `已许可：${im.allowlist.map((item) => `${item.name || item.id}${item.isGroup ? "（群）" : ""}`).join("、")}`)
    : null;

  // 评论区 / 通知列表先算成变量，避免在 JSX 里写多层嵌套括号（容易少一个括号）。
  const commentList = comments
    ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
      h("div", { className: "qbw-hint" },
        `${comments.items?.length ?? 0} 条 · 图片 ${comments.imageCount ?? 0} 张${comments.imageCount ? `（已存到 ${comments.imageDir}）` : ""}${comments.hasMore ? " · 还有更多" : ""}`),
      (comments.items ?? []).map((item) => h("div", { className: "qbw-sitem", key: item.cid },
        h("div", { className: "qbw-srow" },
          h("div", { className: "qbw-srow-main" },
            h("span", { className: "qbw-srow-title" }, `${item.nick || "匿名"}：${item.text || "（无正文）"}`)),
          h("div", { className: "qbw-srow-acts" },
            item.replyCount ? h(Badge, null, `回复 ${item.replyCount}`) : null,
            item.likeCount ? h(Badge, null, `赞 ${item.likeCount}`) : null)),
        h("div", { className: "qbw-srow-meta" },
          h("span", null, fmtTime(item.createTime ? item.createTime * 1000 : null)),
          item.cid ? h("span", null, `cid ${item.cid}`) : null),
        item.images?.length
          ? h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", paddingTop: "6px" } },
            item.images.map((image) => h("img", {
              key: image.file, src: image.url, referrerPolicy: "no-referrer",
              style: { width: "88px", height: "88px", objectFit: "cover", borderRadius: "6px" },
            })))
          : null)))
    : null;

  const noticeList = notices
    ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
      h("div", { className: "qbw-hint" },
        `共 ${notices.total ?? 0} 条${notices.atCount ? ` · @我 ${notices.atCount}` : ""}${notices.warnings?.length ? ` · ${notices.warnings.join("；")}` : ""}`),
      (notices.items ?? []).map((item, index) => h("div", { className: "qbw-sitem", key: item.nid || `${index}` },
        h("div", { className: "qbw-srow" },
          h("div", { className: "qbw-srow-main" },
            h("span", { className: "qbw-srow-title" }, `${item.typeName}${item.nickname ? ` · ${item.nickname}` : ""}${item.content ? `：${item.content}` : ""}`)),
          item.videoUrl
            ? h("div", { className: "qbw-srow-acts" },
              h("a", { className: "qbw-vtitle", href: item.commentUrl || item.videoUrl, target: "_blank", rel: "noreferrer" }, "打开"))
            : null),
        h("div", { className: "qbw-srow-meta" },
          h("span", null, fmtTime(item.createTime ? item.createTime * 1000 : null))))))
    : null;

  return h("div", { className: "qbw-page-douyin" },
    h(Card, {
      title: "抖音账号",
      right: h(StatusDot, {
        ok: persisted || (Boolean(browser.ready) && !loginBlocked),
        warn: Boolean(browser.running) && !persisted && !loginBlocked,
      },
        loginBlocked ? "需要登录" : (browser.running ? (persisted ? "已登录 · 运行中" : "运行中") : (persisted ? "已登录 · 窗口关着" : "未登录"))),
      note: "抖音用本机 Microsoft Edge 的网页版，登录状态存在专用资料目录里。窗口关掉不等于退出登录：下次需要刷的时候（手动或到点自动）插件会重新打开同一个窗口，不用再扫码。",
    },
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: openWindow, disabled: !!busy }, busy === "douyin-open" ? "打开中…（首次约 10 秒）" : (persisted ? "打开抖音窗口" : "打开抖音（登录）")),
        h(Btn, { kind: "qbw-btn2", onClick: loadStatus, disabled: !!busy }, "刷新状态"),
        h(Btn, { kind: "qbw-btn2", onClick: readCurrent, disabled: !!busy }, busy === "douyin-current" ? "读取中…（会自动开窗口）" : "读取当前作品")),
      h(KV, { label: "专用窗口" }, browser.running
        ? `运行中 · 端口 ${browser.port}`
        : "已关闭（不影响：需要时会自动重新打开同一个窗口）"),
      h(KV, { label: "登录状态" }, loginBlocked
        ? "需要登录：在专用窗口里扫码"
        : (persisted
          ? `已登录（保存在专用资料目录${login.checkedAt ? ` · ${fmtTime(login.checkedAt)} 检查` : ""}）`
          : (browser.running ? "窗口运行中；点「读取当前作品」确认登录" : (login.error ? `未确认（${login.error}）` : "未登录：点上面的按钮扫码")))),
      page?.title ? h(KV, { label: "当前作品" },
        page.url
          ? h("a", { href: page.url, target: "_blank", rel: "noreferrer" }, `${page.title}${page.author ? ` · @${page.author}` : ""}`)
          : `${page.title}${page.author ? ` · @${page.author}` : ""}`) : null,
      status?.lastSummary?.note
        ? h(KV, { label: "上次总结" }, `${status.lastSummary.note}（${fmtTime(status.lastSummary.at)}）`) : null,
      browser.launchFailure ? h("div", { className: "qbw-err", style: { marginTop: "8px" } }, `✗ ${browser.launchFailure}`) : null),

    h(Card, {
      title: "观看时间与额度",
      note: "和 B站 的作息同一套语义：只在这几个时段里允许看，每天最多看多少分钟；超出后网页端会自己暂停。改完点外壳的「保存」立即生效。",
    },
      boolRow("enabled", "允许刷抖音", "总开关；关掉后手动操作也会被拒，只能打开窗口登录"),
      boolRow("autoWatch", "到点自动刷", "关掉后只保留手动「现在刷一轮」"),
      boolRow("silent", "静默刷（最小化 + 静音）", "开启后每次动作都会把专用窗口最小化并静音，桌面不弹窗；登录/验证时不会隐藏"),
      h(Row, { label: "允许时段", hint: "HH:MM-HH:MM，可以加多个；24:00 表示当天结束" },
        h(ListInput, {
          value: dy.windows ?? ["20:00-24:00"],
          placeholder: "20:00-24:00",
          onChange: (v) => setUnified(["douyin", "windows"], v),
        })),
      selectRow("dailyMinutes", "每天最多看几分钟", "网页端按实际播放时间记账，重启不清零", DOUYIN_MINUTES, 15),
      selectRow("dailyRequests", "每天模型请求次数", "留给需要模型判断的工具；本地自走循环不消耗它", DOUYIN_REQUESTS, 30),
      selectRow("dwellSeconds", "每条停留多久", "停留到时间就划下一条", DOUYIN_DWELL, 30),
      selectRow("maxVideosPerWake", "每次最多看几条", "一轮结束就停，下一轮等间隔", DOUYIN_MAX_VIDEOS, 5),
      selectRow("gapMinutes", "两轮之间至少隔多久", "避免时段一开始就一直刷", DOUYIN_GAP, 30),
      h(KV, { label: "现在能不能刷" }, allowed ? `可以 · 当前窗口 ${policy?.allowedWindow ? `${policy.allowedWindow.start}~${policy.allowedWindow.end}` : "不限"}` : (policy?.reason || status?.policyError || "—")),
      h(KV, { label: "今天已看 / 剩余" }, `${usedMin} 分钟 / ${remainingMin == null ? "不限" : `${remainingMin} 分钟`}`)),

    h(Card, {
      title: "手动操作",
      note: "「现在刷一轮」走本地循环（打开推荐流 → 停留 → 下一条），不依赖 DSH 的模型；受上面的时段和额度约束。",
    },
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: browseNow, disabled: !!busy || watching || !allowed }, busy === "douyin-start" ? "启动中…" : "现在刷一轮"),
        h(Btn, { kind: "qbw-btn2", onClick: stopNow, disabled: !!busy || !watching }, busy === "douyin-stop" ? "停止中…" : "停止并暂停"),
        h(Btn, { kind: "qbw-btn2", onClick: nextOne, disabled: !!busy || watching || !allowed }, "下一条")),
      h("div", { className: "qbw-search", style: { marginTop: "10px" } },
        h("input", {
          className: "qbw-input", placeholder: "搜索抖音（会占用额度）",
          value: query, onChange: (e) => setQuery(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: doSearch, disabled: !!busy || watching || !allowed }, busy === "douyin-search" ? "搜索中…" : "搜索")),
      results && results.length
        ? h("div", { className: "qbw-rows", style: { marginTop: "8px" } },
          results.map((item) => h(SRow, {
            key: `${item.index}-${item.id ?? item.title}`,
            title: `${item.index + 1}. ${item.title || "（无标题）"}`,
            meta: [item.author ? `@${item.author}` : null, item.url || null].filter(Boolean),
          })))
        : (results ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } }, "没有搜到可见结果。") : null),
      watching
        ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
          `正在刷：已看 ${status.watch?.viewed ?? 0} / ${status.watch?.maxVideos ?? 0} 条（${fmtTime(status.watch?.startedAt)} 开始）`)
        : null),

    h(Card, {
      title: "评论区 · 互动通知",
      note: "只读：别人的视频也能读评论区（不占观看额度）。评论里的图片会下载到本机目录并显示在下面；MCP 工具会把前几张图直接交给模型（需要模型支持图像）。",
    },
      h("div", { className: "qbw-search" },
        h("input", {
          className: "qbw-input", placeholder: "粘贴视频链接或作品 id（留空则读当前作品）",
          value: awemeInput, onChange: (e) => setAwemeInput(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: loadComments, disabled: !!busy }, busy === "douyin-comments" ? "读取中…" : "读取评论"),
        h(Btn, { kind: "qbw-btn2", onClick: loadDebrief, disabled: !!busy }, busy === "douyin-debrief" ? "读取中…" : "看懂这条")),
      debriefBlock,
      commentList,

      h("div", { className: "qbw-group", style: { marginTop: "12px" } }, "互动通知"),
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: loadNotices, disabled: !!busy }, busy === "douyin-notices" ? "读取中…" : "读取通知")),
      noticeList),

    h(Card, {
      title: "私信 / 群聊（长连接）",
      note: "走抖音 IM 协议，不需要开浏览器：登录一次后，新私信/群消息会投进 DSH 会话，回复自动发回去；群里默认只在被 @ 或叫到昵称时回。",
    },
      h(Row, { label: "自动回复私信 / 群消息", hint: "长连接，不需要开窗口；先登录并勾选许可会话" },
        h("label", { className: "qbw-check" },
          h("input", {
            className: "qbw-switch", type: "checkbox", checked: im?.enabled === true,
            disabled: !!busy,
            onChange: (e) => imSaveAndToggle(e.target.checked),
          }),
          h("span", null, im?.enabled === true ? "已开启" : "已关闭"))),
      h(KV, { label: "登录状态" }, imPhaseText),
      im?.error ? h("div", { className: "qbw-err", style: { marginTop: "6px" } }, `✗ ${im.error}`) : null,
      im?.phase === "online"
        ? h("div", null,
          h(KV, { label: "账号" }, `${im.nickname || "—"}${im.uid ? ` · ${im.uid}` : ""}`),
          h(KV, { label: "好友 / 群" }, `${im.friends ?? 0} / ${im.groups ?? 0}`),
          h(KV, { label: "今天已回复" }, `${im.today?.replies ?? 0} 条（上限 ${im.dailyReplyLimit ?? 80}）`))
        : imLoginBlock,
      h(KV, { label: "已许可会话" }, (im?.allowlist ?? []).length
        ? im.allowlist.map((item) => `${item.name || item.id}${item.isGroup ? "（群）" : ""}`).join("、")
        : "还没有：先登录 → 读取好友和群 → 勾选"),
      h(AdvancedSettings, { note: "换账号 / 换许可会话 / 调群聊规则时用；平时不用管" },
        h("div", { className: "qbw-actions" },
          h(Btn, { onClick: imLoadContacts, disabled: !!busy || im?.phase !== "online" }, busy === "douyin-im-contacts" ? "读取中…" : "读取好友和群"),
          h(Btn, { kind: "qbw-btn2", onClick: imRunSelftest, disabled: !!busy }, busy === "douyin-im-selftest" ? "自检中…" : "自检回复链路"),
          h(Btn, { kind: "qbw-btn3", onClick: imLogoutNow, disabled: !!busy || im?.phase !== "online" }, "退出登录")),
        imTest ? h("div", { className: "qbw-hint", style: { marginTop: "6px" } }, `自检回复：${imTest.reply}（会话 ${imTest.sessionId}）`) : null,
        imContactsBlock,
        imAllowBlock,
        h(Row, { label: "群聊响应昵称", hint: "群里被 @ 或正文出现这些名字才回" },
          h("input", {
            className: "qbw-input", value: imNames, placeholder: "大肥鱼，肥鱼",
            onChange: (e) => setImNames(e.target.value),
            onBlur: () => imSaveConfig({ mentionNames: imNames.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean) }),
          })),
        h(Row, { label: "群聊只在被叫到时回", hint: "关掉后群里每一条都会回（不建议）" },
          h("label", { className: "qbw-check" },
            h("input", {
              type: "checkbox", className: "qbw-switch", checked: im?.groupMentionOnly !== false,
              onChange: (e) => imSaveConfig({ groupMentionOnly: e.target.checked }),
            }),
            h("span", null, im?.groupMentionOnly !== false ? "已开启" : "已关闭"))),
        h(Row, { label: "每日回复上限", hint: "超过后当天不再自动回，避免刷屏" },
          h("input", {
            className: "qbw-input", type: "number", min: 1, max: 500,
            defaultValue: String(im?.dailyReplyLimit ?? 80),
            onBlur: (e) => imSaveConfig({ dailyReplyLimit: Number(e.target.value) || 80 }),
          }))),
      h("div", { className: "qbw-hint", style: { marginTop: "6px", lineHeight: 1.6 } },
        im?.enabled
          ? "已开启：不用开浏览器，有新消息会自己回；回复会出现在侧栏的抖音会话里。"
          : "打开开关前：先登录，再在「高级设置」里勾选要回的好友/群并保存。")),

    h(Card, {
      title: "看过的视频",
      note: "本地记账：自动观看和手动翻页都会记一笔（同一条 10 分钟内不重复记）。",
    },
      h("div", { className: "qbw-stats" },
        h("div", { className: "qbw-stat" }, h("div", null, "今天"), h("div", null, viewStats.today ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "最近 7 天"), h("div", null, viewStats.last7d ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "不同视频"), h("div", null, viewStats.videos ?? 0, h("span", { className: "qbw-unit" }, " 条"))),
        h("div", { className: "qbw-stat" }, h("div", null, "累计"), h("div", null, viewStats.total ?? 0, h("span", { className: "qbw-unit" }, " 条")))),

      h("div", { className: "qbw-search", style: { marginTop: "10px" } },
        h("input", {
          className: "qbw-input", placeholder: "搜标题 / 作者",
          value: viewQ, onChange: (e) => setViewQ(e.target.value),
        }),
        h(Btn, { kind: "qbw-btn2", onClick: loadViews, disabled: !!busy }, busy === "douyin-views" ? "刷新中…" : "刷新")),

      viewErr ? h("div", { className: "qbw-err", style: { margin: "8px 0" } }, `✗ ${viewErr}`) : null,
      !views && !viewErr ? h("div", { className: "qbw-hint", style: { padding: "12px 0" } }, "读取看过的视频…") : null,
      views && viewItems.length === 0
        ? h("div", { className: "qbw-hint" },
          viewQ ? "没有匹配的记录。" : "还没有记录。点上面「现在刷一轮」（或自动到点）后会记在这里。")
        : null,
      viewItems.length
        ? h("div", null, viewItems.map((item, index) => h("div", { className: "qbw-sitem", key: `${item.id}|${item.at}|${index}` },
          h("div", { className: "qbw-srow" },
            h("div", { className: "qbw-srow-main" },
              item.url
                ? h("a", { className: "qbw-vtitle", href: item.url, target: "_blank", rel: "noreferrer" }, item.title || `作品 ${item.id}`)
                : h("span", { className: "qbw-vtitle" }, item.title || `作品 ${item.id}`)),
            item.duration ? h("div", { className: "qbw-srow-acts" }, h(Badge, null, `${Math.round(item.duration)} 秒`)) : null),
          h("div", { className: "qbw-srow-meta" },
            h("span", null, fmtTime(item.at)),
            h("span", null, item.author ? `@${item.author}` : "—")))))
        : null,
      views
        ? h("div", { className: "qbw-hint", style: { marginTop: "8px" } },
          `共 ${views.total ?? viewItems.length} 条${viewQ ? `（过滤后 ${viewItems.length} 条）` : ""} · 数据文件 ${views.file || "—"}`)
        : null),

    err ? h("div", { className: "qbw-err" }, err) : null);
}
