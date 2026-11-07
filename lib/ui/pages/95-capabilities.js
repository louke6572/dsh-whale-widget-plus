/* 系统 · 模块中心：把设置里的每一项能力做成可替换的「模块」。
   一个模块 = 一项能力（douyin.feed / voice.speak …）；同一时刻只跑一个主实现。
   切换前先跑契约测试，结构不符就拒绝；运行期连续失败会自动回退到备用实现。 */

function CapabilitiesPage({ busy, setBusy, toast }) {
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState({});
  const [contracts, setContracts] = useState({});

  const load = useCallback(async () => {
    try {
      const result = await api("/capabilities");
      setData(result);
    } catch (e) {
      toast(`✗ 读取能力槽失败：${e.message}`);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const valueOf = (cap) => {
    const picked = choices[cap.id];
    if (picked !== undefined) return picked;
    return cap.disabled ? data?.off : cap.active;
  };

  const runSwitch = async (cap) => {
    const provider = valueOf(cap);
    if (provider == null) { toast("✗ 先选一个实现（或选「停用」）"); return; }
    setBusy(`cap:${cap.id}`);
    try {
      const result = await api("/capabilities", { method: "POST", body: { action: "switch", capability: cap.id, provider } });
      setData(result);
      setChoices((prev) => { const next = { ...prev }; delete next[cap.id]; return next; });
      const switched = result.switch || {};
      toast(switched.disabled ? `✓ ${cap.title} 已停用` : `✓ ${cap.title} 已切到 ${switched.provider}`);
    } catch (e) {
      toast(`✗ ${e.message}`);
      await load();
    } finally {
      setBusy("");
    }
  };

  const runTest = async (cap) => {
    const picked = valueOf(cap);
    if (picked === data?.off) { toast("✗ 停用状态没有可测试的实现"); return; }
    const provider = picked || cap.defaultProvider;
    if (!provider) { toast("✗ 这项能力还没有可用实现"); return; }
    setBusy(`test:${cap.id}`);
    try {
      const result = await api("/capabilities", { method: "POST", body: { action: "test", capability: cap.id, provider } });
      setData(result);
      setContracts((prev) => ({ ...prev, [cap.id]: result.contract }));
      toast(result.contract?.ok ? `✓ 契约测试通过（${result.contract.ms} ms）` : `✗ ${result.contract?.error || "契约测试失败"}`);
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const resetStats = async () => {
    setBusy("cap-reset");
    try {
      setData(await api("/capabilities", { method: "POST", body: { action: "reset-stats" } }));
      toast("✓ 已清空能力统计");
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const describeStats = (cap) => {
    const rate = cap.rate == null ? "暂无调用" : `成功率 ${cap.rate}%`;
    return `${rate}（成功 ${cap.ok} / 失败 ${cap.fail}）`;
  };

  return h("div", { className: "qbw-page-capabilities" },
    h(Card, {
      title: "模块中心",
      note: "每个模块是一项能力，而不是一个纯 UI 开关：谁实现它，鱼调用到的就是谁。切换前会先用契约里的样例输入跑一次真实调用；连续失败达到阈值会自动回退。",
      right: h("div", { style: { display: "flex", gap: "8px" } },
        h(Btn, { kind: "qbw-btn3", onClick: resetStats, disabled: !!busy }, busy === "cap-reset" ? "清空中…" : "清空统计"),
        h(Btn, { kind: "qbw-btn3", onClick: load, disabled: !!busy }, "刷新")),
    },
      !data ? h("div", { className: "qbw-hint" }, "读取中…") : null,
      (data?.capabilities ?? []).map((cap) => h("div", { key: cap.id, style: { marginTop: "14px" } },
        h(Card, {
          title: `${cap.title}`,
          note: `${cap.description}（契约 ${cap.id}）`,
        },
          h("div", { className: "qbw-row" },
            h("div", null,
              h("div", null, "当前实现"),
              h("div", { className: "qbw-hint" },
                cap.disabled
                  ? "已停用：鱼调用这项能力会收到明确提示，不会静默失败。"
                  : `正在由 ${cap.active} 负责${cap.backup ? `（备用：${cap.backup}）` : ""}`)),
            h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
              h("select", {
                className: "qbw-select",
                value: valueOf(cap) || "",
                onChange: (e) => setChoices((prev) => ({ ...prev, [cap.id]: e.target.value })),
              },
                h("option", { value: "" }, `使用内置默认（${cap.defaultProvider || "—"}）`),
                (cap.providers ?? []).map((provider) => h("option", { key: provider.id, value: provider.id },
                  `${provider.name}${provider.builtin ? "（内置）" : "（第三方）"}${provider.active ? " · 当前" : ""}`)),
                h("option", { value: data?.off }, "停用（不启用任何实现）")),
              h(Btn, { onClick: () => runSwitch(cap), disabled: !!busy }, busy === `cap:${cap.id}` ? "测试并切换中…" : "切换并测试"),
              h(Btn, { kind: "qbw-btn3", onClick: () => runTest(cap), disabled: !!busy }, busy === `test:${cap.id}` ? "测试中…" : "只测试"))),
          h(KV, { label: "健康度" }, describeStats(cap)),
          h(KV, { label: "失败阈值" },
            `${cap.failureThreshold} 次连续失败${cap.autoRollback ? "自动回退" : "不自动回退"}`),
          cap.lastError ? h("div", { className: "qbw-err", style: { marginTop: "6px" } }, `最近失败：${cap.lastError}`) : null,
          contracts[cap.id]
            ? h("div", { className: contracts[cap.id].ok ? "qbw-ok" : "qbw-err", style: { marginTop: "6px" } },
              contracts[cap.id].ok
                ? `契约测试通过：${cap.id} ← ${contracts[cap.id].provider}（${contracts[cap.id].ms} ms）`
                : `契约测试失败：${contracts[cap.id].error}`)
            : null,
          h("div", { className: "qbw-group" }, "可用实现"),
          h("div", { className: "qbw-rows" }, (cap.providers ?? []).map((provider) => h("div", { className: "qbw-row", key: provider.id },
            h("div", null,
              h("div", null, provider.name,
                provider.active ? h("span", { className: "qbw-ok" }, " · 当前") : null),
              h("div", { className: "qbw-hint" },
                `${provider.id} · ${provider.builtin ? "内置" : "第三方"} · 风险 ${provider.risk}`,
                provider.stats.lastError ? ` · 最近失败：${provider.stats.lastError}` : "")),
            h("span", { className: "qbw-hint" },
              provider.stats.rate == null ? "暂无调用" : `成功率 ${provider.stats.rate}%（${provider.stats.ok}/${provider.stats.ok + provider.stats.fail}）`)))))))),
    (data?.events ?? []).length
      ? h("div", { style: { marginTop: "14px" } },
        h(Card, { title: "最近事件", note: "切换、拒绝切换、运行失败与自动回退都在这里留痕（最多 20 条）。" },
          h("div", { className: "qbw-list" }, data.events.map((item, index) => h("div", { className: "qbw-row", key: `${item.at}-${index}` },
            h("div", null,
              h("div", null, `${item.kind}${item.capability ? ` · ${item.capability}` : ""}`),
              h("div", { className: "qbw-hint" },
                [item.from && `从 ${item.from}`, item.to && `到 ${item.to}`, item.provider && `实现 ${item.provider}`, item.error].filter(Boolean).join(" · ") || "—")),
            h("span", { className: "qbw-hint" }, fmtTime(item.at)))))))
      : null,
  );
}
