/* 诊断：体检结果 / 路径 / 备份与日志。 */

function DiagPage({ busy, setBusy, toast, reload }) {
  const [diag, setDiag] = useState(null);
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState("");
  const [backups, setBackups] = useState([]);

  // toast 每次渲染都是新函数：用 ref 固定，避免 useEffect([load]) 反复触发体检。
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const load = useCallback(async ({ manual = false } = {}) => {
    if (manual) setBusy("diag-refresh");
    try {
      setDiag(await api("/diagnostics"));
      setErr("");
      if (manual) toastRef.current?.("✓ 已重新体检");
    } catch (e) {
      setErr(e.message);
      if (manual) toastRef.current?.(`✗ 体检失败：${e.message}`);
    } finally {
      try { setBackups((await api("/config")).backups ?? []); } catch { /* 旧宿主没有 backups */ }
      if (manual) setBusy("");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadLogs = async () => {
    setBusy("logs");
    try { setLogs(await api("/logs?lines=160")); }
    catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const doctorFix = async () => {
    setBusy("doctor");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "doctor-fix" } });
      const changed = r.changed ?? [];
      toast(changed.length ? `✓ 已补齐：${changed.join("、")}${r.restartRequired ? "（重启 DSH 生效）" : ""}` : "✓ 没有需要补的");
      await load();
    } catch (e) {
      toast(`✗ ${/未知 action/.test(String(e.message)) ? "后端还是旧版本：关掉 DSH 再开一次，让插件加载新代码" : e.message}`);
    } finally { setBusy(""); }
  };

  const backupAll = async () => {
    setBusy("backup");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "backup" } });
      toast(`✓ 已备份 ${r.created?.length ?? 0} 个文件`);
      await load();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const restore = async (name) => {
    if (!confirm(`确定用备份 ${name} 覆盖当前文件？会先自动备份当前文件。`)) return;
    setBusy("restore");
    try {
      const r = await api("/diagnostics", { method: "POST", body: { action: "restore", name } });
      toast(`✓ 已恢复 ${r.target}`);
      await load();
      await reload();
    } catch (e) { toast(`✗ ${e.message}`); }
    finally { setBusy(""); }
  };

  const checkRows = (diag?.checks ?? []).map((c) => {
    const kind = c.level === "warn" ? "warn" : c.ok ? "ok" : "bad";
    return h(SRow, {
      key: c.name,
      title: c.name,
      dot: kind,
      actions: h(Badge, { kind }, c.level === "warn" ? "注意" : c.ok ? "正常" : "缺失"),
      meta: [c.detail || null, c.fix ? `怎么补：${c.fix}` : null],
    });
  });
  return h("div", null,
    h("div", { className: "qbw-actions", style: { borderTop: "none", marginTop: 0, paddingTop: 0 } },
      h(Btn, { kind: "qbw-btn2", onClick: doctorFix, disabled: !!busy }, busy === "doctor" ? "配置中…" : "只补缺失项"),
      h(Btn, { kind: "qbw-btn2", onClick: () => load({ manual: true }), disabled: !!busy }, busy === "diag-refresh" ? "体检中…" : "重新体检"),
      h(Btn, { kind: "qbw-btn2", onClick: backupAll, disabled: !!busy }, "备份全部配置")),

    diag
      ? h("div", null,
        h(Card, { title: "体检", right: h(Badge, { kind: diag.ok ? "ok" : "bad" }, diag.ok ? "通过" : "有项不可用") }, checkRows),
        h(Card, { title: "路径" },
          Object.entries(diag.paths ?? {}).map(([k, v]) => h(PathLine, { key: k, label: k, path: String(v) }))))
      : h("div", { className: "qbw-hint", style: { padding: "16px 0" } }, "体检中…"),

    h(AdvancedSettings, { note: "备份恢复 / 插件与桥接日志：排障时再展开" },
      h("div", { className: "qbw-actions" }, h(Btn, { kind: "qbw-btn2", onClick: loadLogs, disabled: !!busy }, busy === "logs" ? "读取中…" : "读取日志")),
      h(Section, { title: `备份（${backups.length}）`, note: "写文件前自动生成", collapsible: false },
        backups.slice(0, 20).map((b) => h("div", { className: "qbw-item", key: b.name },
          h("div", null,
            h("div", { className: "qbw-label" }, b.name),
            h("div", { className: "qbw-hint" }, `${fmtBytes(b.bytes)} · ${fmtTime(new Date(b.mtime).toISOString())}`)),
          h(Btn, { kind: "qbw-btn2", onClick: () => restore(b.name), disabled: !!busy }, "恢复")))),
      logs
        ? h("div", null,
          h("div", { className: "qbw-group" }, "插件日志"),
          h("div", { className: "qbw-out" }, logs.plugin || "（空）"),
          h("div", { className: "qbw-group" }, "桥接日志"),
          h("div", { className: "qbw-out" }, logs.bridge || "（空）"))
        : null),

    err ? h("div", { className: "qbw-err" }, err) : null);
}
