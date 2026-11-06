/* 对话 · 全局模型：一份选择，插件后台任务直接用；也写成 DSH 默认，新建会话跟随。 */

function ModelPage({ busy, setBusy, toast }) {
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState({ provider: "", model: "" });

  const load = useCallback(async () => {
    try {
      const result = await api("/models");
      setCatalog(result);
      setDraft({ provider: result.saved?.provider || "", model: result.saved?.model || "" });
    } catch (e) {
      toast(`✗ 读取模型目录失败：${e.message}`);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const models = (catalog?.models ?? []).filter((item) => item.provider === draft.provider);
  const apply = async () => {
    if (draft.provider && !draft.model) { toast("✗ 先选一个模型"); return; }
    setBusy("model");
    try {
      const result = await api("/models", { method: "POST", body: { provider: draft.provider, model: draft.model } });
      setCatalog(result);
      setDraft({ provider: result.saved?.provider || "", model: result.saved?.model || "" });
      toast(result.saved?.provider ? "✓ 全局模型已切换" : "✓ 已恢复为跟随 DSH 默认");
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  return h("div", { className: "qbw-page-model" },
    h(Card, {
      title: "全局模型",
      note: "切换方法：① 提供商选「跟随 DSH 默认」或具体提供商；② 再选模型；③ 点「应用模型」。想恢复默认，把提供商选回「跟随 DSH 默认」再点应用即可。",
    },
      h(Row, { label: "模型", hint: "留空 = 跟随 DSH 默认；选一个 = 固定使用" },
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
          h("select", {
            className: "qbw-select", value: draft.provider,
            onChange: (e) => setDraft({ provider: e.target.value, model: "" }),
          },
            h("option", { value: "" }, "跟随 DSH 默认"),
            (catalog?.providers ?? []).map((item) => h("option", { key: item.id, value: item.id }, item.name || item.id))),
          draft.provider
            ? h("select", {
              className: "qbw-select", value: draft.model,
              onChange: (e) => setDraft((current) => ({ ...current, model: e.target.value })),
            },
              h("option", { value: "" }, "选模型"),
              models.map((item) => h("option", { key: item.id, value: item.id }, item.name || item.id)))
            : null,
          h(Btn, { onClick: apply, disabled: !!busy }, busy === "model" ? "应用中…" : "应用模型"))),
      h(KV, { label: "当前设置" }, catalog?.saved?.provider
        ? `${catalog.saved.provider} / ${catalog.saved.model}`
        : "跟随 DSH 默认"),
      h(KV, { label: "DSH 默认" }, catalog?.dshDefault?.provider
        ? `${catalog.dshDefault.provider} / ${catalog.dshDefault.model}`
        : "—"),
      h("div", { className: "qbw-group", style: { marginTop: "12px" } }, "这个设置会影响谁"),
      h("div", { className: "qbw-hint", style: { lineHeight: 1.6 } },
        "· 抖音私信 / 群聊自动回复、插件的后台任务：点「应用模型」后立即生效。",
        h("br"),
        "· 同时会写成 DSH 默认模型：之后新建的 QQ / B站 / 贴吧会话会跟随它。",
        h("br"),
        "· 已经开着的 QQ / B站 会话不会被强制改：请在对应会话的模型菜单里再切一次。"),
      catalog?.error ? h("div", { className: "qbw-err", style: { marginTop: "8px" } }, catalog.error) : null),
  );
}
