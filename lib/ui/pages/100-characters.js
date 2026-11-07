/* 角色与记忆卡：角色包（新建/加载/删除/存档）+ 人格四层编辑。 */

function CharactersPage({ overview, busy, setBusy, toast, reload, goTab }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", personaText: "", memoryText: "", fullText: "" });

  const load = useCallback(async () => {
    try { setData(await api("/characters")); setErr(""); }
    catch (e) { setErr(`读取角色失败：${e.message}`); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, extra = {}, okText = "✓ 已完成") => {
    setBusy(`character-${action}`);
    try {
      const r = await api("/characters", { method: "POST", body: { action, ...extra } });
      if (r.ok === false) throw new Error(r.error ?? "失败");
      toast(okText);
      await load();
      if (action === "load" || action === "restore" || action === "create") await reload?.();
      return r;
    } catch (e) { toast(`✗ ${e.message}`); return null; }
    finally { setBusy(""); }
  };

  const create = async (loadIt) => {
    if (!form.name.trim()) { toast("✗ 先填角色名"); return; }
    let memoryCard;
    if (form.memoryText.trim()) {
      try { memoryCard = JSON.parse(form.memoryText); }
      catch { toast("✗ 记忆卡不是合法 JSON"); return; }
    }
    const r = await act("create", {
      name: form.name.trim(),
      personaText: form.personaText,
      memoryCard,
      fullRecords: form.fullText,
      load: loadIt,
    }, loadIt ? "✓ 角色已创建并加载" : "✓ 角色已创建");
    if (r) { setForm({ name: "", personaText: "", memoryText: "", fullText: "" }); setShowCreate(false); }
  };

  const current = data?.current ?? null;
  const characters = data?.characters ?? [];
  const snapshots = data?.snapshots ?? [];
  const percent = Number(overview?.memoryCard?.percent ?? 0);
  const fileTo = (key, accept) => h("input", {
    type: "file", accept,
    onChange: async (e) => {
      const input = e.target;
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      setForm((f) => ({ ...f, [key]: text }));
      // 清空选择：同一个文件第二次选时不会触发 change（恢复默认/重选同一份文件的场景）。
      input.value = "";
    },
  });

  return h("div", null,
    h(Card, {
      title: "角色人格",
      right: current ? h(Badge, { kind: "ok" }, current.name) : h(Badge, { kind: "warn" }, "还没有角色"),
    },
      h("p", null, "一个角色 = 人格卡 + 衰减记忆卡 + 全量卡 + B站账本；加载别的角色会先存档。"),
      h(KV, { label: "当前角色" }, current ? `${current.name}（epoch ${current.epoch}）` : "（未加载）"),
      h(KV, { label: "记忆卡" }, `${percent}% · ${snapshots.length} 个存档`),
      h("div", { className: "qbw-actions" },
        current ? h(Btn, { kind: "qbw-btn2", onClick: () => act("snapshot", { id: current.id, label: "手动" }, "✓ 已存一份"), disabled: !!busy }, "立即存档") : null,
        current ? h(Btn, { kind: "qbw-btn2", onClick: () => act("auto-snapshot", { id: current.id }, "✓ 自动存档已更新"), disabled: !!busy }, "更新自动存档") : null,
        current ? h(Btn, { kind: "qbw-btn2", onClick: () => goTab?.("memory") }, "管理记忆卡") : null,
        h(Btn, { onClick: () => setShowCreate((v) => !v), disabled: !!busy }, showCreate ? "收起新建" : "新建角色"))),

    err ? h("div", { className: "qbw-err" }, err) : null,

    h(PersonaEditor, { busy, setBusy, toast }),

    showCreate ? h(Card, { title: "新建角色", note: "可以只填名字；也可以把预设的人格卡 / 记忆卡一起导入" },
      h(Row, { label: "角色名" },
        h("input", { className: "qbw-input", value: form.name, placeholder: "例如 小咪", onChange: (e) => setForm((f) => ({ ...f, name: e.target.value })) })),
      h("div", { className: "qbw-group" }, "人格卡（Markdown）"),
      fileTo("personaText", ".md,.txt,text/markdown,text/plain"),
      h("textarea", { className: "qbw-textarea", value: form.personaText, placeholder: "# 角色卡：名字\n\n你是谁、说话方式…", onChange: (e) => setForm((f) => ({ ...f, personaText: e.target.value })) }),
      h("div", { className: "qbw-group" }, "记忆卡 JSON（可选）"),
      fileTo("memoryText", ".json,application/json"),
      h("textarea", { className: "qbw-textarea", value: form.memoryText, placeholder: "{\"version\":1,\"records\":[]}", onChange: (e) => setForm((f) => ({ ...f, memoryText: e.target.value })) }),
      h("div", { className: "qbw-group" }, "全量记忆 JSONL（可选，只存档）"),
      fileTo("fullText", ".jsonl,.json,text/plain"),
      h("textarea", { className: "qbw-textarea", value: form.fullText, placeholder: "{\"id\":\"...\"}", onChange: (e) => setForm((f) => ({ ...f, fullText: e.target.value })) }),
      h("div", { className: "qbw-actions" },
        h(Btn, { onClick: () => create(true), disabled: !!busy }, "创建并加载"),
        h(Btn, { kind: "qbw-btn2", onClick: () => create(false), disabled: !!busy }, "只创建"))) : null,

    h(Section, { title: `全部角色（${characters.length}）`, note: "加载别的角色会自动保存当前角色", defaultOpen: true },
      characters.length
        ? characters.map((item) => h("div", { key: item.id, className: "qbw-item" },
          h("div", null,
            h("div", { className: "qbw-label" }, item.name,
              item.current ? h(Badge, { kind: "ok" }, "当前") : null,
              h(Badge, null, `${item.snapshots ?? 0} 档`)),
            h("div", { className: "qbw-hint" }, `人格 ${item.personaChars ?? 0} 字 · 全量记忆 ${fmtBytes(item.fullMemoryBytes)} · 更新 ${fmtTime(item.updatedAt)}`)),
          h("div", { style: { display: "flex", gap: "6px", flex: "0 0 auto" } },
            item.current ? null : h(Btn, { onClick: () => act("load", { id: item.id }, `✓ 已加载「${item.name}」`), disabled: !!busy }, "加载"),
            item.current ? null : h(Btn, {
              kind: "qbw-btn2", disabled: !!busy,
              onClick: async () => {
                if (!confirm(`删除角色「${item.name}」？整个目录会移进 backups/deleted-character-*，可手动恢复。`)) return;
                await act("delete", { id: item.id }, "✓ 已归档删除");
              },
            }, "删除"))))
        : h("div", { className: "qbw-hint" }, "还没有角色；点上方「新建角色」。")),

    h(LearningCard, { busy, setBusy, toast }),

    h(AdvancedSettings, { note: "存档 / 回档：低频操作，展开再用" },
      h(Section, { title: `存档（${snapshots.length}）`, note: "自动存档 12 槽 · 手动/切换前不覆盖", collapsible: false },
        snapshots.length
          ? snapshots.map((item) => h("div", { key: item.slot, className: "qbw-item" },
            h("div", null,
              h("div", { className: "qbw-label" }, item.slot,
                item.slot === "before-switch" ? h(Badge, { kind: "warn" }, "切换前") : null),
              h("div", { className: "qbw-hint" }, `${fmtTime(item.createdAt)} · ${item.reason || ""} · 记忆 ${fmtBytes(item.memoryBytes)}`)),
            current ? h(Btn, {
              kind: "qbw-btn2", disabled: !!busy,
              onClick: async () => {
                if (!confirm(`把「${current.name}」回档到 ${item.slot}？会先给当前状态再存一份。`)) return;
                await act("restore", { id: current.id, slot: item.slot }, "✓ 已回档");
              },
            }, "回档") : null))
          : h("div", { className: "qbw-hint" }, "还没有存档；切换角色或点「立即存档」。"))));
}

/* 自我学习：贴吧 / B站 / 抖音 的观看记录 → 经历 + 近况（后端 learning-loop）。 */
function LearningCard({ busy, setBusy, toast }) {
  const [st, setSt] = useState(null);
  const load = useCallback(async () => {
    try { setSt(await api("/learning/status")); } catch (e) { /* 后端还没升级 */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (action, okText, body = {}) => {
    setBusy(`learning-${action}`);
    try {
      const r = await api(`/learning/${action}`, { method: "POST", body });
      if (r.ok === false) throw new Error(r.error ?? r.reason ?? "失败");
      toast(okText);
      await load();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };
  const enabled = st?.enabled !== false;
  return h(Card, {
    title: "自我学习",
    right: st?.running ? h(Badge, { kind: "warn" }, "学习中") : null,
    note: "她刷过的贴吧 / B站 / 抖音会定期变成「经历 + 近况」，注入 QQ、桌宠、抖音的对话；核心人格卡不会被改。",
  },
    h(Row, { label: "自动学习", hint: "关掉后只能手动「立即学习」" },
      h("label", { className: "qbw-check" },
        h("input", {
          type: "checkbox", className: "qbw-switch", checked: enabled,
          onChange: (e) => act("config", e.target.checked ? "✓ 已开启自动学习" : "✓ 已暂停自动学习", { enabled: e.target.checked }),
        }),
        h("span", null, enabled ? "已开启" : "已关闭"))),
    h(KV, { label: "上次学习" }, st?.lastRunAt ? fmtTime(st.lastRunAt) : "还没学过"),
    h(KV, { label: "已沉淀" }, st ? `${st.stats?.items ?? 0} 条经历 · ${st.stats?.runs ?? 0} 次` : "—"),
    st?.interests?.length ? h(KV, { label: "最近兴趣" }, st.interests.join("、")) : null,
    st?.brief ? h("div", { className: "qbw-hint", style: { marginTop: "6px", whiteSpace: "pre-wrap" } }, st.brief) : null,
    st?.persona ? h("div", { className: "qbw-hint", style: { marginTop: "6px", whiteSpace: "pre-wrap" } }, `自动近况：${st.persona}`) : null,
    st?.lastError ? h("div", { className: "qbw-err", style: { marginTop: "6px" } }, st.lastError) : null,
    h("div", { className: "qbw-actions" },
      h(Btn, { onClick: () => act("run", "✓ 学习完成", { force: true }), disabled: !!busy }, busy === "learning-run" ? "学习中…" : "立即学习"),
      h(Btn, { kind: "qbw-btn2", onClick: () => act("rollback", "✓ 已回滚自动近况"), disabled: !!busy }, "回滚人设"),
      h(Btn, { kind: "qbw-btn3", onClick: load }, "刷新")),
    h("div", { className: "qbw-hint", style: { marginTop: "6px" } }, "学习内容只来自三平台「看过的记录」；不读聊天、不编造没看到的细节。"));
}

/* 人格四层：core / tone / daily / scene，各自一个文件。 */
function PersonaEditor({ busy, setBusy, toast }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ core: "", tone: "", daily: "", scenes: {} });
  const [scene, setScene] = useState("default");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api("/persona");
      const layers = r.layers ?? {};
      setData(r);
      setDraft({
        core: layers.core?.text ?? r.text ?? "",
        tone: layers.tone?.text ?? "",
        daily: layers.daily?.text ?? "",
        scenes: layers.scenes ?? {},
      });
      setErr("");
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const scenes = Object.keys(data?.layers?.scenes ?? {});
  const setLayer = (key, value) => setDraft((prev) => key === "scene"
    ? { ...prev, scenes: { ...prev.scenes, [scene]: { ...(prev.scenes?.[scene] ?? {}), text: value } } }
    : { ...prev, [key]: value });

  const saveAll = async () => {
    setBusy("persona-save");
    const jobs = [["core", "core", draft.core]];
    if (String(draft.tone || "").trim() || String(data?.layers?.tone?.text || "").trim()) jobs.push(["tone", "tone", draft.tone]);
    if (String(draft.daily || "").trim() || String(data?.layers?.daily?.text || "").trim()) jobs.push(["daily", "daily", draft.daily]);
    const sceneText = draft.scenes?.[scene]?.text ?? "";
    if (String(sceneText).trim() || String(data?.layers?.scenes?.[scene]?.text || "").trim()) jobs.push(["scene", "scene", sceneText]);
    const failures = [];
    for (const [layer, label, text] of jobs) {
      try { await api("/persona", { method: "POST", body: { layer, scene: layer === "scene" ? scene : "", text } }); }
      catch (e) { failures.push(`${label}：${e.message}`); }
    }
    if (failures.length) {
      // 有层失败时不要重新拉取：load() 会用服务端内容覆盖草稿，
      // 用户刚在 textarea 里改的那几层（含已保存成功的）会被瞬间重置成旧内容。
      toast(`✗ 保存失败：${failures.join("；")}`);
      setBusy("");
      return;
    }
    toast("✓ 人格层已保存");
    setBusy("");
    await load();
  };

  return h(Card, { title: "人格卡", right: err ? h(Badge, { kind: "bad" }, "读取失败") : null, note: "core 是核心设定；tone / daily / scene 是可选层" },
    err ? h("div", { className: "qbw-err" }, err) : null,
    h("div", { className: "qbw-group" }, "核心人格（core）"),
    h("textarea", { className: "qbw-textarea", value: draft.core, onChange: (e) => setLayer("core", e.target.value), placeholder: "你是谁、从哪来、在意什么…" }),
    h(Section, { title: "语气 / 日常 / 场景", note: "可选；留空就不写这一层", defaultOpen: false },
      h("div", { className: "qbw-group" }, "语气（tone）"),
      h("textarea", { className: "qbw-textarea", value: draft.tone, onChange: (e) => setLayer("tone", e.target.value) }),
      h("div", { className: "qbw-group" }, "日常（daily）"),
      h("textarea", { className: "qbw-textarea", value: draft.daily, onChange: (e) => setLayer("daily", e.target.value) }),
      scenes.length || (draft.scenes && Object.keys(draft.scenes).length)
        ? h("div", null,
          h("div", { className: "qbw-group" }, "场景（scene）"),
          h("select", { className: "qbw-select", value: scene, onChange: (e) => setScene(e.target.value) },
            [...new Set([...scenes, ...Object.keys(draft.scenes ?? {})])].map((k) => h("option", { key: k, value: k }, k))),
          h("textarea", { className: "qbw-textarea", value: draft.scenes?.[scene]?.text ?? "", onChange: (e) => setLayer("scene", e.target.value) }))
        : null),
    h("div", { className: "qbw-actions" }, h(Btn, { onClick: saveAll, disabled: !!busy }, "保存人格卡")));
}
