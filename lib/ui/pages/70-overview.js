/* 概览（运行状态）/ 安装与更新：一页两视图，互不挤在一起。 */

function OverviewPage({ view = "home", overview, reload, busy, setBusy, toast, goTab, autoStart, openConsole }) {
  const bridge = overview?.bridge ?? {};
  const biliStatus = overview?.bili ?? {};
  const memory = overview?.memory ?? {};
  const align = overview?.alignment ?? {};
  const scheduler = overview?.scheduler ?? {};
  const snow = overview?.snowluma ?? {};
  // 网关是独立进程：桥接在跑 ≠ 消息发得出去（3100 能应答只说明桥接活着）。
  const gateway = bridge?.snowluma ?? {};
  const gatewayConnected = gateway.connected === true;
  const platformStart = overview?.platformStart ?? {};
  const qqStart = platformStart.qq !== false;
  const biliStart = platformStart.bili !== false;

  const [gates, setGates] = useState(null);
  const [snowError, setSnowError] = useState(null);
  const [snowImport, setSnowImport] = useState(false);

  // toast 是宿主每次渲染新建的函数：用 ref 固定住，避免定时器/useCallback 每次渲染都重建。
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const say = (msg) => { try { toastRef.current?.(msg); } catch { /* 宿主没给 toast 时忽略 */ } };

  const loadGates = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("gates-refresh");
    try {
      const r = await api("/gate-events?limit=30&includeAcked=0");
      setGates(r);
      if (manual) say(`✓ 已刷新：未确认 ${(r.events ?? []).length} 条`);
    } catch (e) {
      // 手动刷新失败要说话；自动轮询失败保持旧数据，别把页面清空成「没数据」
      if (manual) say(`✗ 刷新失败：${e.message}`);
    } finally {
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { if (view === "home") loadGates(); }, [view, loadGates]);

  const act = async (action) => {
    setBusy(action);
    try {
      const res = await api("/bridge", { method: "POST", body: { action } });
      toast(res.ok ? `✓ ${res.message ?? "完成"}` : `✗ ${res.error ?? "失败"}`);
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  // 全部停止：QQ 桥接 + B站 一起停（和顶部「一键开始」对称，只有一个入口）。
  const stopAll = async () => {
    setBusy("stop-all");
    try {
      const res = await api("/bridge", { method: "POST", body: { action: "stop-selected", components: ["qq", "bili"] } });
      const bad = (res.items ?? []).filter((x) => !x.ok);
      say(bad.length
        ? `✗ ${bad.length} 项没停下：${bad.map((x) => `${x.label}（${x.error || ""}）`).join("、")}`
        : `✓ 已全部停止${(res.items ?? []).length ? `：${res.items.map((x) => x.label).join("、")}` : ""}`);
      await reload();
    } catch (e) { say(`✗ 全部停止失败：${e.message}`); } finally { setBusy(""); }
  };

  const [snowScan, setSnowScan] = useState(null);
  // 面板直连 SnowLuma 控制台：账号 + QQ 注入进程，全部在设置页里操作。
  const [snowApi, setSnowApi] = useState(null);
  const [webuiPwd, setWebuiPwd] = useState("");
  // 配好一次之后向导收起来，日常只剩「加/删账号」——像 DSH 配好模型后直接用。
  const [forceWizard, setForceWizard] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const loadSnowApi = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("snow-refresh");
    try {
      const r = await api("/snowluma");
      setSnowApi(r);
      if (manual) {
        say(`✓ 已刷新：账号 ${(r.accounts ?? []).length} 个 · 进程 ${(r.processes ?? []).length} 个${r.note ? `（${r.note}）` : ""}`);
      }
    } catch (e) {
      // 关键：失败时**保留上一次的数据**。之前这里 setSnowApi(null)，网络抖一下就误报「控制台没在运行」。
      if (manual) say(`✗ 刷新失败：${e.message}`);
    } finally {
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { if (view === "home") loadSnowApi(); }, [view, loadSnowApi]);
  // 向导进度自己走（账号登录 / 注入完成后不用手动刷新）
  useEffect(() => {
    if (view !== "home") return undefined;
    const timer = setInterval(() => { void loadSnowApi(); }, 20_000);
    return () => clearInterval(timer);
  }, [view, loadSnowApi]);
  const connectWebui = async () => {
    setBusy("webui-login");
    try {
      await api("/snowluma", { method: "POST", body: { action: "login", password: webuiPwd } });
      setWebuiPwd("");
      toast("✓ 已连上 SnowLuma 控制台");
      await loadSnowApi();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const processAct = async (action, pid) => {
    setBusy("proc");
    try {
      const r = await api("/snowluma", { method: "POST", body: { action, pid } });
      toast(`✓ ${r.message ?? "完成"}`);
      await loadSnowApi();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const forgetWebui = async () => {
    setBusy("webui-logout");
    try {
      await api("/snowluma", { method: "POST", body: { action: "logout" } });
      toast("已断开 SnowLuma 控制台，密码已清除");
      await loadSnowApi();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const scanSnow = async () => {
    setBusy("snow-scan");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "install-scan" } });
      setSnowScan(r);
      const s = r?.snow ?? {};
      toast(r?.ok ? `✓ 已连上 SnowLuma：${s.nickname || "?"}${s.uin ? `（${s.uin}）` : ""} · 群 ${(r.groups ?? []).length} 个` : `✗ ${r?.error || "没连上 SnowLuma"}`);
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };
  const applySnow = async () => {
    setBusy("snow-apply");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "install-apply", discoverSnow: true } });
      toast(`✓ ${(r?.changed ?? []).join("、") || "已写入"}${r?.needRestart ? "（重启桥接后生效）" : ""}`);
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
  };

  const detectSnow = async (picked = "") => {
    setBusy("detect");
    try {
      const r = await api("/bridge", { method: "POST", body: { action: "detect-snowluma", ...(picked ? { path: picked } : {}) } });
      if (r.ok) { toast(`✓ ${r.message}`); await reload(); }
      else setSnowError({ title: r.title || "没找到 SnowLuma", message: r.error || "没找到 SnowLuma", hint: r.hint || "", tried: r.tried ?? [] });
    } catch (e) {
      setSnowError({ title: "检测失败", message: e.message, hint: "确认 DSH 插件正常后重试；也可以直接选目录。" });
    } finally { setBusy(""); }
  };
  const pickSnow = async (mode) => {
    setSnowImport(false);
    const r = await browseNative(mode, mode === "file" ? "选择 SnowLuma 的启动文件（SnowLuma.exe 或 app\\launcher.bat）" : "选择 SnowLuma2 根目录（里面有 app）");
    if (r.ok && r.path) await detectSnow(String(r.path));
    else if (!r.cancelled) toast(`✗ ${r.error || "打不开选择框"}`);
  };
  const ackGates = async (id) => {
    try {
      await api("/gate-events", { method: "POST", body: id ? { ids: [id] } : { all: true } });
      say(id ? "✓ 已确认这条提醒" : "✓ 已全部确认");
      await loadGates();
    } catch (e) { say(`✗ 确认失败：${e.message}`); }
  };

  const buckets = [];
  for (const ev of gates?.events ?? []) {
    const text = ev.impact || ev.reason?.message || ev.event || "";
    const key = `${ev.level}|${ev.gate}|${text}`;
    const hit = buckets.find((b) => b.key === key);
    if (hit) hit.count += 1; else buckets.push({ key, count: 1, ev, text });
  }

  if (view === "home") {
    // 步骤逻辑在 01-core 的 buildSetupSteps（可单测）：核心完成条件 = 桥接在跑且网关连通。
    const webuiUp = Boolean(snowApi?.webui?.up);
    const accounts = snowApi?.accounts ?? [];
    const processes = snowApi?.processes ?? [];
    const firstFree = processes.find((p) => !(p.loaded === true || p.injected === true || p.hooked === true) && p.pid);
    const wizard = buildSetupSteps({
      launcherPath: snow.launcherPath,
      detected: snow.detected === true,
      webuiUp,
      hasPassword: Boolean(snowApi?.hasPassword),
      accounts,
      bridgeRunning: Boolean(bridge.running),
      gatewayConnected,
      processPid: firstFree?.pid ?? null,
    });
    const steps = wizard.steps;
    const currentStep = steps.find((s) => !s.done);
    const doneCount = steps.filter((s) => s.done).length;
    const configured = wizard.ready;
    const runStep = (id) => {
      if (id === "detect") return detectSnow();
      if (id === "start-snowluma") return act("start-snowluma");
      if (id === "process-load") return processAct("process-load", firstFree?.pid);
      if (id === "refresh") return loadSnowApi({ manual: true });
      if (id === "auto-start") return autoStart();
      return undefined;
    };
    const loadedList = processes.filter((p) => p.loaded === true || p.injected === true || p.hooked === true);
    // 日常操作：加账号 = 注入一个没注入的 QQ 进程（之后手机扫码）；删账号 = 取消注入。
    const addAccount = async () => {
      if (firstFree) { await processAct("process-load", firstFree.pid); return; }
      toast("先打开 QQ 停在登录页（要加哪个号就登录哪个号），再点「+ 添加账号」");
      await loadSnowApi({ manual: true });
    };
    return h("div", null,
      configured && !forceWizard
        ? h(Card, {
          title: "SnowLuma 已就绪",
          right: h("div", { style: { display: "inline-flex", gap: "6px" } },
            h(Btn, { kind: "qbw-btn3", onClick: () => loadSnowApi({ manual: true }), disabled: !!busy }, busy === "snow-refresh" ? "刷新中…" : "刷新"),
            h(Btn, { kind: "qbw-btn3", onClick: () => setForceWizard(true) }, "重新配置")),
        },
          h("div", { className: "qbw-meta" },
            h("span", null, `● 账号 ${accounts.length || (gatewayConnected ? 1 : 0)} 个`),
            h("span", null, `● 网关 ${gatewayConnected ? "已连接" : "未连接"}`),
            h("span", null, `● 控制台 ${webuiUp ? "运行中" : "未运行"}`)),
          accounts.length
            ? h("div", { className: "qbw-meta" }, accounts.map((a) => h("span", { key: a.uin }, `${a.nickname || "QQ"}（${a.uin}）${a.online ? " · 在线" : ""}`)))
            : (gatewayConnected
              ? h("div", { className: "qbw-hint" }, "已登录（网关已连通）；账号明细没读到就点「刷新」或启用面板管账号")
              : h("div", { className: "qbw-hint" }, "还没有账号：点「+ 添加账号」")),
          h("div", { className: "qbw-actions" },
            h(Btn, { onClick: addAccount, disabled: !!busy }, busy === "proc" ? "处理中…" : "+ 添加账号"),
            h(Btn, { kind: "qbw-btn3", onClick: openConsole, disabled: !!busy }, "打开控制台"),
            wizard.optional.done ? null : h(Btn, {
              kind: "qbw-btn3",
              onClick: () => { setForceWizard(true); setShowPwd(true); },
              disabled: !!busy,
            }, "启用面板管账号")),
          h("div", { className: "qbw-hint" },
            wizard.optional.done
              ? "面板内管账号：已启用（加号 / 退号都在这里）"
              : "面板内管账号：未启用（可选，填一次控制台密码即可，不影响正常收发）"),
          loadedList.length
            ? h("div", null, loadedList.map((p) => h(SRow, {
              key: String(p.pid),
              title: `已注入 ${p.name || "QQ"} · PID ${p.pid}`,
              dot: "ok",
              dotText: "运行中",
              actions: h(Btn, { kind: "qbw-btn3", onClick: () => processAct("process-unload", p.pid), disabled: !!busy }, "退出"),
            })))
            : null,
          h("div", { className: "qbw-hint" }, "日常只需要这两件事：加账号（点一下后手机扫码）、退出账号（点「退出」）。"))
        : null,
      (configured && !forceWizard) ? null : h(Card, {
        title: "上手向导",
        right: h(Badge, { kind: currentStep ? "warn" : "ok" }, currentStep ? `${doneCount}/${steps.length} 步 · 还剩 ${steps.length - doneCount} 步` : "全部完成"),
      },
        h("div", { className: "qbw-hint" },
          currentStep ? `下一步：第 ${steps.indexOf(currentStep) + 1} 步「${currentStep.label}」—— 点右边按钮就行` : "全部就绪，可以直接用了"),
        steps.map((s, i) => h(SRow, {
          key: s.id,
          title: `${i + 1}. ${s.label}`,
          dot: s.done ? "ok" : "",
          dotText: s.done ? "已完成" : (s === currentStep ? "现在做这一步" : "等上一步"),
          meta: s.hint ? [h("span", { key: "h" }, s.hint)] : null,
          actions: (!s.done && s === currentStep) ? h(Btn, { onClick: () => runStep(s.actionId), disabled: !!busy }, s.actionLabel) : null,
        })),
        // 可选增强：面板内加/删账号。未启用也不影响「已就绪」，只是日常要开它的网页。
        h(SRow, {
          title: `（可选）${wizard.optional.label}`,
          dot: wizard.optional.done ? "ok" : "",
          dotText: wizard.optional.done ? "已启用" : "可选",
          meta: [h("span", { key: "h" }, wizard.optional.hint)],
          actions: wizard.optional.done ? null : (showPwd
            ? h("div", { className: "qbw-actions" },
              h("input", {
                className: "qbw-input", type: "password", style: { flex: "1 1 180px" },
                placeholder: "SnowLuma 控制台密码", value: webuiPwd,
                onChange: (e) => setWebuiPwd(e.target.value),
              }),
              h(Btn, { onClick: connectWebui, disabled: !!busy || !webuiPwd }, busy === "webui-login" ? "连接中…" : "连上控制台"))
            : h(Btn, { kind: "qbw-btn3", onClick: () => setShowPwd(true) }, "填密码")),
        }),
        h("div", { className: "qbw-hint" }, "所有步骤都在这个面板里完成；只有 QQ 扫码必须你本人用手机扫（腾讯侧限制）。"),
        configured ? h("div", { className: "qbw-actions" },
          h(Btn, { kind: "qbw-btn3", onClick: () => setForceWizard(false) }, "收起向导（已经配好了）")) : null),
      h(Card, {
        title: "运行状态",
        right: h(Btn, { kind: "qbw-btn3", onClick: stopAll, disabled: !!busy }, busy === "stop-all" ? "停止中…" : "全部停止"),
      },
        h(SRow, {
          title: "QQ 桥接",
          dot: bridge.running ? (bridge.ok ? "ok" : "warn") : "",
          dotText: bridge.running ? (bridge.ok ? "运行中" : "异常") : "未运行",
          actions: [
            h(Btn, { key: "s", onClick: () => act("start"), disabled: !!busy || bridge.running }, "启动"),
            h(Btn, { key: "r", kind: "qbw-btn2", onClick: () => act("restart"), disabled: !!busy }, "重启"),
            h(Btn, { key: "t", kind: "qbw-btn2", onClick: () => act("stop"), disabled: !!busy || !bridge.running }, "停止"),
          ],
          meta: [
            h("span", { key: "p" }, "端口 ", h("b", null, bridge.port ?? "—")),
            h("span", { key: "m" }, "模式 ", h("b", null, overview?.mode?.effective ?? overview?.mode?.local ?? bridge.mode ?? "—")),
            h("span", { key: "w" }, "白名单 ", h("b", null, `群 ${overview?.mode?.allowGroups ?? 0} · 私 ${overview?.mode?.allowPrivate ?? 0}`)),
          ],
        }),
        h(SRow, {
          title: "B站记忆",
          dot: biliStatus.available ? "ok" : (biliStatus.enabled ? "warn" : ""),
          dotText: biliStatus.available ? "已生成" : "暂无",
          actions: h(Btn, {
            kind: "qbw-btn2", disabled: !!busy,
            onClick: async () => {
              setBusy("refresh-bili");
              try {
                const r = await api("/memory", { method: "POST", body: { action: "refresh-bili" } });
                toast(r.ok ? "✓ B站记忆已刷新" : `✗ ${r.error ?? "失败"}`);
                await reload();
              } catch (e) { toast(`✗ ${e.message}`); } finally { setBusy(""); }
            },
          }, "刷新"),
          meta: [
            h("span", { key: "b" }, "简报 ", h("b", null, `${biliStatus.briefChars ?? 0} 字`)),
            h("span", { key: "p" }, "隐私 ", h("b", null, biliStatus.blocked ? "命中已拦截" : "通过")),
            h("span", { key: "s" }, "同步 ", h("b", null, biliStatus.enabled ? "开" : "关")),
            h("span", { key: "t" }, fmtTime(biliStatus.generatedAt)),
          ],
        }),
        h(SRow, {
          title: "生物钟",
          dot: scheduler.running ? "ok" : "",
          dotText: scheduler.running ? "在跑" : "已停",
          actions: h(Btn, { kind: "qbw-btn3", onClick: () => goTab?.("memory") }, "记忆 / 对齐"),
          meta: [
            h("span", { key: "a" }, "对齐 ", h("b", null, `${align.links ?? 0} 条 / 候选 ${align.candidates ?? 0}`)),
            h("span", { key: "q" }, "QQ→B站 ", h("b", null, memory.qqToBili?.enabled ? "开" : "关")),
            h("span", { key: "b" }, "B站→QQ ", h("b", null, memory.biliToQq?.enabled ? "开" : "关")),
          ],
        }),
        h(SRow, {
          title: "SnowLuma 网关",
          dot: gatewayConnected ? "ok" : (bridge.running ? "warn" : ""),
          dotText: gatewayConnected ? "已连接" : (bridge.running ? "未连接" : "未启动"),
          meta: [
            h("span", { key: "st" }, "状态 ", h("b", null, gatewayConnected ? "网关已连上，消息能发出去" : "网关没连上，消息发不出去")),
            snow.webui?.url ? h("span", { key: "w" }, "控制台 ", h("b", null, `${snow.webui.url}${snow.webui.up ? "" : "（未启动）"}`)) : null,
            !gatewayConnected && (snow.diagnosis?.hint || gateway.hint)
              ? h("span", { key: "h" }, snow.diagnosis?.hint || gateway.hint) : null,
          ],
        })),

      // ── SnowLuma 账号（面板直连控制台，不用再开它的网页）──────────────────────
      // 配好后日常视图已经管账号了，这张卡只在向导/重配时出现，避免重复入口。
      (configured && !forceWizard) ? null : h(Card, {
        title: "SnowLuma 账号",
        right: h(Btn, { kind: "qbw-btn3", onClick: () => loadSnowApi({ manual: true }), disabled: !!busy }, busy === "snow-refresh" ? "刷新中…" : "刷新"),
      },
        !snowApi?.webui?.up
          ? h("div", { className: "qbw-hint" }, snowApi?.note || "SnowLuma 控制台没在运行：按上面向导第 2 步启动")
          : !snowApi?.hasPassword
            ? h("div", null,
              accounts.length
                ? h("div", { className: "qbw-meta" }, accounts.map((a) => h("span", { key: a.uin }, `● ${a.nickname || "QQ"}（${a.uin}）${a.online ? " · 在线" : ""}`)))
                : h("div", { className: "qbw-hint" }, "还没发现账号：先把 QQ 打开登录，再点「刷新」"),
              h("div", { className: "qbw-hint" }, "上面的账号来自 SnowLuma 的本地配置（不用密码也能看到）；要在这个面板里加号/退号，填一次控制台密码即可（可选）。"),
              showPwd
                ? h("div", { className: "qbw-actions" },
                  h("input", {
                    className: "qbw-input", type: "password", style: { flex: "1 1 180px" },
                    placeholder: "SnowLuma 控制台密码", value: webuiPwd,
                    onChange: (e) => setWebuiPwd(e.target.value),
                  }),
                  h(Btn, { onClick: connectWebui, disabled: !!busy || !webuiPwd }, busy === "webui-login" ? "连接中…" : "连上控制台"))
                : h("div", { className: "qbw-actions" },
                  h(Btn, { kind: "qbw-btn3", onClick: () => setShowPwd(true) }, "填密码（可选）")))
            : h("div", null,
              (snowApi.accounts ?? []).length
                ? h("div", { className: "qbw-meta" }, snowApi.accounts.map((a) => h("span", { key: a.uin }, `● ${a.nickname || "?"}（${a.uin}）`)))
                : h("div", { className: "qbw-hint" }, "还没有已登录的 QQ 账号：在下面把 QQ 进程注入后扫码登录"),
              (snowApi.processes ?? []).slice(0, 6).map((p, i) => {
                const loaded = p.loaded === true || p.injected === true || p.hooked === true;
                return h(SRow, {
                  key: String(p.pid ?? i),
                  title: `${p.name || p.title || "QQ"} · PID ${p.pid ?? "?"}`,
                  dot: loaded ? "ok" : "",
                  dotText: loaded ? "已注入" : "未注入",
                  actions: h(Btn, {
                    kind: loaded ? "qbw-btn2" : "",
                    disabled: !!busy || !p.pid,
                    onClick: () => processAct(loaded ? "process-unload" : "process-load", p.pid),
                  }, loaded ? "取消注入" : "注入到 SnowLuma"),
                });
              }),
              (snowApi.processes ?? []).length
                ? null
                : h("div", { className: "qbw-hint" }, "没发现 QQ 进程：先把 QQ 打开停在登录页，再点右上角「刷新」"),
              h("div", { className: "qbw-actions" },
                h(Btn, { kind: "qbw-btn3", onClick: forgetWebui, disabled: !!busy }, "断开控制台（清除密码）"),
                snowApi.error ? h("span", { className: "qbw-hint" }, snowApi.error) : null))),

      buckets.length
        ? h(Card, {
          title: "安全提醒",
          right: h("div", { style: { display: "inline-flex", gap: "6px", alignItems: "center" } },
            h(Badge, { kind: (gates?.counts?.L3 ?? 0) > 0 ? "bad" : "warn" }, `未确认 ${gates?.counts?.unacked ?? 0} 条`),
            h(Btn, { kind: "qbw-btn3", onClick: () => loadGates({ manual: true }), disabled: !!busy }, busy === "gates-refresh" ? "刷新中…" : "刷新")),
        },
          buckets.slice(0, 4).map(({ key, count, ev, text }) => h(SRow, {
            key,
            title: `${ev.level} · ${ev.gate}`,
            dot: ev.level === "L3" ? "bad" : "warn",
            actions: [
              count > 1 ? h(Badge, { key: "c" }, `×${count}`) : null,
              h(Badge, { key: "a", kind: ev.ack ? "ok" : "warn" }, ev.ack ? "已确认" : "未确认"),
              h(Btn, { key: "k", kind: "qbw-btn3", onClick: () => ackGates(ev.id) }, "确认"),
            ],
            meta: text ? [text] : null,
          })),
          h("div", { className: "qbw-hint" }, "L0 静默、L1 仅记录；L2/L3 才弹窗。"),
          h("div", { className: "qbw-actions" },
            h(Btn, { kind: "qbw-btn2", onClick: () => ackGates(null), disabled: !(gates?.counts?.unacked > 0) }, "全部确认")))
        : null,
      qqStart ? null : h("div", { className: "qbw-warnbox" }, "QQ 平台在配置里是关闭状态：桥接不会自动启动。"),
      biliStart ? null : h("div", { className: "qbw-warnbox" }, "B站 平台在配置里是关闭状态：生物钟不会自动醒来。"));
  }

  // ── 安装与维护 ──────────────────────────────────────────────────────────
  return h("div", null,
    h("div", { className: "qbw-infobox" }, "只管 SnowLuma 安装与诊断体检；更新 dsh-Dfy 请直接 git pull。"),

    h(Card, { title: "SnowLuma 安装" },
      (bridge.running && snow.everConnected === true && snow.diagnosis?.state && snow.diagnosis.state !== "ok")
        ? h("div", { className: "qbw-err" }, `连接异常（${snow.diagnosis.state}）：${snow.diagnosis.hint || "检查 SnowLuma 是否运行并已登录"}`)
        : null,
      h("p", null, "第一次使用：下载官方 SnowLuma2 → 解压 → 点「检测已安装的 SnowLuma」→ 启动 QQ 并扫码。"),
      h(KV, { label: "当前安装目录" }, snow.launcherPath || "未设置"),
      h("div", { className: "qbw-actions" },
        h(Btn, { kind: "qbw-btn2", onClick: () => window.open(snow.downloadUrl || "https://github.com/SnowLuma/SnowLuma/releases/latest", "_blank", "noopener") }, "官方下载页"),
        h(Btn, { onClick: () => detectSnow(), disabled: !!busy }, "检测已安装的 SnowLuma"),
        h(Btn, { kind: "qbw-btn2", onClick: () => setSnowImport(true), disabled: !!busy }, "手动选择"),
        h(Btn, { kind: "qbw-btn2", onClick: () => act("start-snowluma"), disabled: !!busy }, "只打开 SnowLuma")),
      h("div", { className: "qbw-hint" }, "「手动选择」只是告诉插件你装好的 SnowLuma 在哪：不下载、不安装、不移动、不删除任何文件。"),
      h(KV, { label: "控制台（扫码登录 / 加账号）" },
        snow.webui ? `${snow.webui.url}${snow.webui.up ? "（就绪）" : "（未启动）"}` : "未知"),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => act("open-snowluma-webui"), disabled: !!busy }, "打开 SnowLuma 控制台"),
        h(Btn, { kind: "qbw-btn2", onClick: scanSnow, disabled: !!busy }, busy === "snow-scan" ? "扫描中…" : "扫描当前账号"),
        h(Btn, { kind: "qbw-btn2", onClick: applySnow, disabled: !!busy }, busy === "snow-apply" ? "写入中…" : "按扫描结果写入配置")),
      snowScan ? h("div", { className: "qbw-meta" },
        snowScan?.snow ? h("span", { key: "a" }, `账号 ${snowScan.snow.nickname || "?"}（${snowScan.snow.uin || "?"}） · ${snowScan.snow.httpUrl || "—"}`) : null,
        h("span", { key: "g" }, `群 ${(snowScan.groups ?? []).length} 个`)) : null,
      h("div", { className: "qbw-hint" }, "扫二维码 / 添加 QQ 账号只能在 SnowLuma 自己的控制台里做（它要注入 QQ 进程，插件不能代做）；这里负责把「当前登录的账号」写进 dsh-Dfy 配置，省得手抄 token。")),

    h(Section, { title: "诊断与体检", note: "体检 / 路径 / 备份与日志：排障时再展开", defaultOpen: false },
      h(DiagPage, { busy, setBusy, toast, reload })),

    snowImport ? h(Modal, { title: "导入 SnowLuma 的安装位置", onClose: () => setSnowImport(false) },
      h("p", null, "这里导入的是你已经装好的 SnowLuma 的启动文件，不是安装包；不会下载、安装、移动或删除任何文件。"),
      h("ul", { style: { paddingLeft: "18px", fontSize: "12px", lineHeight: "20px" } },
        h("li", null, "SnowLuma.exe —— SnowLuma2 目录里的主程序"),
        h("li", null, "app\\launcher.bat —— 标准布局里的启动脚本"),
        h("li", null, "解压出来的 SnowLuma2 根目录")),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => pickSnow("file"), disabled: !!busy }, "选择文件…"),
        h(Btn, { kind: "qbw-btn2", onClick: () => pickSnow("dir") }, "选择目录"),
        h(Btn, { kind: "qbw-btn2", onClick: () => setSnowImport(false) }, "取消"))) : null,

    snowError ? h(Modal, { title: snowError.title, onClose: () => setSnowError(null) },
      h("p", null, snowError.message),
      snowError.hint ? h("p", { className: "qbw-hint" }, snowError.hint) : null,
      (snowError.tried ?? []).length ? h("div", { className: "qbw-out" }, snowError.tried.join("\n")) : null,
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => { setSnowError(null); pickSnow("dir"); } }, "浏览…选择目录"),
        h(Btn, { kind: "qbw-btn2", onClick: () => window.open(snow.downloadUrl || "https://github.com/SnowLuma/SnowLuma/releases/latest", "_blank", "noopener") }, "打开下载页"),
        h(Btn, { kind: "qbw-btn2", onClick: () => setSnowError(null) }, "关闭"))) : null);
}
