/* 身份对齐：QQ ⇄ B站 是同一个人的映射；称呼优先于群名片 / B站昵称。 */

function AliasCell({ link, onSave, busy, disabled }) {
  const current = String(link?.label ?? "");
  const [value, setValue] = useState(current);
  useEffect(() => { setValue(current); }, [current]);
  const dirty = value.trim() !== current.trim();
  const commit = () => { if (dirty && !busy && !disabled) onSave(link.id, value.trim()); };
  return h("div", { style: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" } },
    h("input", {
      className: "qbw-input",
      style: { minWidth: "96px", flex: "0 1 120px" },
      placeholder: disabled ? "重启 DSH 后可设" : "设个称呼",
      value,
      disabled: !!disabled,
      onChange: (e) => setValue(e.target.value),
      onKeyDown: (e) => { if (e.key === "Enter") commit(); },
    }),
    dirty && !disabled ? h(Btn, { kind: "qbw-btn2", onClick: commit, disabled: !!busy }, "保存") : null);
}

function AlignPage({ busy, setBusy, toast, reload }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ qqId: "", qqName: "", qqGroups: "", biliId: "", biliName: "", label: "", note: "" });

  const load = useCallback(async () => {
    try { setData(await api("/align")); setErr(""); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const labelsReady = data ? data.labelsSupported === true : true;

  const add = async () => {
    setBusy("align-add");
    try {
      const link = {
        identities: {
          ...(form.qqId ? { qq: { id: form.qqId, name: form.qqName, groups: form.qqGroups.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } } : {}),
          ...(form.biliId ? { bili: { id: form.biliId, name: form.biliName } } : {}),
        },
        label: form.label.trim(),
        source: "manual",
        confidence: 1,
        verified: true,
        note: form.note,
      };
      await api("/align", { method: "POST", body: { action: "add", link } });
      toast(form.label.trim() ? `✓ 已添加对齐：以后只叫「${form.label.trim()}」` : "✓ 已添加对齐");
      setForm({ qqId: "", qqName: "", qqGroups: "", biliId: "", biliName: "", label: "", note: "" });
      await load(); await reload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const act = async (action, id, extra = {}) => {
    setBusy(action + id);
    try { await api("/align", { method: "POST", body: { action, id, ...extra } }); toast("✓ 完成"); await load(); await reload(); }
    catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const saveLabel = async (id, label) => {
    setBusy("align-label-" + id);
    try {
      await api("/align", { method: "POST", body: { action: "update", id, link: { label } } });
      toast(label ? `✓ 以后只叫「${label}」` : "✓ 已清掉称呼");
      await load(); await reload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const scan = async () => {
    setBusy("align-scan");
    try {
      const r = await api("/align", { method: "POST", body: { action: "scan" } });
      toast(`✓ 扫描完成：QQ +${r.qq?.added ?? 0}，B站 +${r.bili?.added ?? 0}`);
      await load(); await reload();
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), links: data.links }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qq-bili-align-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(String(reader.result ?? "{}"));
        setBusy("align-import");
        await api("/align", { method: "POST", body: { action: "import", payload, merge: true } });
        toast("✓ 已导入");
        await load(); await reload();
      } catch (e) {
        toast(`✗ ${e.message}`);
      } finally {
        setBusy("");
      }
    };
    reader.readAsText(file);
  };

  return h("div", null,
    h("div", { className: "qbw-infobox" },
      "这一层高于记忆同步开关：两边同步都关掉，只要对齐开着，人格卡仍认得出同一个人。",
      "称呼优先于群名片 / B站昵称；在 B站 公开场合禁止写出 QQ 号 / 群号。"),
    labelsReady ? null : h("div", { className: "qbw-warnbox" }, "当前宿主还是旧代码：称呼存不进去，重启 DSH 后可用；其它对齐功能不受影响。"),

    h(Card, { title: "手动添加" },
      h("div", { className: "qbw-hint", style: { marginBottom: "6px" } }, "只有 QQ 或只有 B站 也可以填；称呼留空 = 照旧按昵称叫。"),
      h(Row, { label: "以后只叫 TA（称呼）", hint: "优先于群名片 / B站昵称 / 人格卡称呼表" },
        h("input", { className: "qbw-input", placeholder: "例如 小零", value: form.label, disabled: !labelsReady, onChange: (e) => setForm((s) => ({ ...s, label: e.target.value })) })),
      h(Section, { title: "QQ 侧", collapsible: false },
        h(Row, { label: "QQ 号" }, h("input", { className: "qbw-input", placeholder: "QQ 号", value: form.qqId, onChange: (e) => setForm((s) => ({ ...s, qqId: e.target.value })) })),
        h(Row, { label: "群昵称" }, h("input", { className: "qbw-input", placeholder: "群昵称", value: form.qqName, onChange: (e) => setForm((s) => ({ ...s, qqName: e.target.value })) })),
        h(Row, { label: "所在群号", hint: "逗号分隔，可空" }, h("input", { className: "qbw-input", placeholder: "群号", value: form.qqGroups, onChange: (e) => setForm((s) => ({ ...s, qqGroups: e.target.value })) }))),
      h(Section, { title: "B站侧", collapsible: false },
        h(Row, { label: "B站 mid" }, h("input", { className: "qbw-input", placeholder: "B站 mid", value: form.biliId, onChange: (e) => setForm((s) => ({ ...s, biliId: e.target.value })) })),
        h(Row, { label: "B站昵称" }, h("input", { className: "qbw-input", placeholder: "B站昵称", value: form.biliName, onChange: (e) => setForm((s) => ({ ...s, biliName: e.target.value })) })),
        h(Row, { label: "备注" }, h("input", { className: "qbw-input", placeholder: "可选", value: form.note, onChange: (e) => setForm((s) => ({ ...s, note: e.target.value })) }))),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: add, disabled: !!busy || (!form.qqId && !form.biliId) }, "添加对齐"),
        h(Btn, { kind: "qbw-btn2", onClick: scan, disabled: !!busy }, "扫描候选"),
        h(Btn, { kind: "qbw-btn2", onClick: exportJson, disabled: !!busy }, "导出"),
        h("label", { className: "qbw-btn qbw-btn2", style: { display: "inline-flex", alignItems: "center", cursor: "pointer", height: "30px", padding: "0 12px" } },
          "导入",
          h("input", { type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: (e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; } })))),

    h(AdvancedSettings, { note: "候选对齐 / 自动扫描结果：默认不生效，确认后才写入" },
      h(Section, { title: `候选人（${data?.candidates?.length ?? 0}）`, collapsible: false },
        (data?.candidates ?? []).length === 0
          ? h("div", { className: "qbw-hint", style: { padding: "6px 0" } }, "没有候选。群友在群里说「我B站是…」后点「扫描候选」。")
          : (data.candidates ?? []).map((c) => h("div", { className: "qbw-item", key: c.id },
            h("div", null,
              h("div", { className: "qbw-label" }, `${c.platform === "qq" ? "QQ" : "B站"} ${c.identity?.name || c.identity?.id} → ${c.counterpartPlatform === "qq" ? "QQ" : "B站"} ${c.counterpart?.name || c.counterpart?.id || "（待补）"}`),
              h("div", { className: "qbw-hint" }, `${c.source} · 置信度 ${(Number(c.confidence) || 0).toFixed(2)} · ${c.evidence || ""}`)),
            h("div", { style: { display: "flex", gap: "6px" } },
              h(Btn, { onClick: () => act("approve", c.id), disabled: !!busy }, "确认"),
              h(Btn, { kind: "qbw-btn2", onClick: () => act("reject", c.id), disabled: !!busy }, "否定")))))),

    h(Section, { title: `已对齐（${data?.links?.length ?? 0}）`, note: "QQ ⇄ B站 · 称呼可直接改", defaultOpen: true },
      (data?.links ?? []).length === 0
        ? h("div", { className: "qbw-hint", style: { padding: "6px 0" } }, "还没有对齐记录。")
        : (data.links ?? []).map((link) => h("div", { className: "qbw-item", key: link.id },
          h("div", { style: { minWidth: 0 } },
            h("div", { className: "qbw-label" }, "QQ ", link.identities?.qq?.name || "?", h("span", { className: "qbw-hint" }, link.identities?.qq?.id ?? ""), " ⇄ B站 ", link.identities?.bili?.name || "?", h("span", { className: "qbw-hint" }, link.identities?.bili?.id ?? "")),
            h("div", { className: "qbw-hint" }, `来源 ${link.source || "manual"}`)),
          h("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
            h(AliasCell, { link, onSave: saveLabel, busy: !!busy, disabled: !labelsReady }),
            h(Btn, { kind: "qbw-btn2", onClick: () => act("remove", link.id), disabled: !!busy }, "删除"))))),
    err ? h("div", { className: "qbw-err" }, err) : null);
}
