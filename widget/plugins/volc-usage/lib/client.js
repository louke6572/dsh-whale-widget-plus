// 火山引擎方舟编程套餐用量 — 客户端 bundle（手写，符合 __ModuleLoader__ 格式，支持多账号）
// 依赖仅用模块种子表里的 "react"；数据通过同源 fetch /api/volc-usage 获取。
window.__ModuleLoader__.load({
  id: "@local/volc-usage",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    function levelLabel(level) {
      return { session: "会话级", weekly: "周级", monthly: "月级" }[level] || level;
    }
    function fmtTime(sec) {
      if (!sec) return "未知";
      var d = new Date(sec * 1000);
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    function barColor(pct) {
      return pct >= 90 ? "var(--dsw-alias-state-error-primary)" : pct >= 70 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-state-success-primary)";
    }
    function pctOf(acc, level) {
      var rows = acc && acc.plan && acc.plan.QuotaUsage ? acc.plan.QuotaUsage : [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].Level === level) return Math.min(100, Math.max(0, Number(rows[i].Percent) || 0));
      }
      return 0;
    }
    function accShort(name, idx) {
      var m = String(name || "").match(/^火山账号 (\d+)$/);
      if (m) return m[1] === "1" ? "①" : m[1] === "2" ? "②" : m[1];
      return String(name || "?").slice(0, 4);
    }
    function quotaRows(plan) {
      return plan && plan.QuotaUsage ? plan.QuotaUsage : [];
    }

    function AccountCard(acc, active) {
      var rows = quotaRows(acc.plan);
      return React.createElement("div", { className: "vu-account" + (active ? " vu-account-active" : ""), key: acc.name },
        React.createElement("div", { className: "vu-acc-title" },
          React.createElement("span", null, acc.name),
          active
            ? React.createElement("span", { className: "vu-active-badge" }, "使用中")
            : null
        ),
        acc.ok === false
          ? React.createElement("div", { className: "vu-error" }, acc.error)
          : React.createElement("div", { className: "vu-acc-body" },
              React.createElement("div", { className: "vu-status" }, "套餐状态：" + String((acc.plan && acc.plan.Status) || "未知")),
              rows.map(function (q) {
                var pct = Math.min(100, Math.max(0, Number(q.Percent) || 0));
                return React.createElement("div", { className: "vu-row", key: String(q.Level) },
                  React.createElement("div", { className: "vu-row-head" },
                    React.createElement("span", { className: "vu-level" }, levelLabel(q.Level)),
                    React.createElement("span", { className: "vu-pct" }, pct.toFixed(1) + "% 已用")
                  ),
                  React.createElement("div", { className: "vu-bar" },
                    React.createElement("div", { className: "vu-bar-fill", style: { width: pct + "%", background: barColor(pct) } })
                  ),
                  React.createElement("div", { className: "vu-row-foot" }, "重置时间：" + fmtTime(q.ResetTimestamp))
                );
              }),
              acc.balance
                ? React.createElement("div", { className: "vu-balance" },
                    "账户余额：¥" + String(acc.balance.CashBalance || "0") + "（可用 ¥" + String(acc.balance.AvailableBalance || "0") + "）"
                  )
                : null
            )
      );
    }

    function VolcUsagePanel(props) {
      var state = React.useState(null);
      var data = state[0];
      var setData = state[1];
      var state2 = React.useState(false);
      var loading = state2[0];
      var setLoading = state2[1];
      var state3 = React.useState(null);
      var error = state3[0];
      var setError = state3[1];
      var load = React.useCallback(function () {
        setLoading(true);
        setError(null);
        setData(null);
        fetch("/api/volc-usage", { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (res) { setData(res); setLoading(false); })
          .catch(function (e) { setError("请求失败: " + String((e && e.message) || e)); setLoading(false); });
      }, []);
      React.useEffect(function () {
        load();
        var timer = setInterval(load, 2 * 60 * 1000);
        return function () { clearInterval(timer); };
      }, [load]);
      var accounts = data && data.ok ? data.accounts : [];
      return React.createElement("div", { className: "vu-root" },
        React.createElement("div", { className: "vu-header" },
          React.createElement("span", { className: "vu-title" }, "火山引擎 · 方舟编程套餐用量"),
          React.createElement("button", { className: "vu-refresh", onClick: load, disabled: loading }, loading ? "查询中…" : "刷新")
        ),
        error ? React.createElement("div", { className: "vu-error" }, error) : null,
        data && data.ok === false ? React.createElement("div", { className: "vu-error" }, data.error) : null,
        accounts.length > 0
          ? accounts.map(function (acc) { return AccountCard(acc, data.activeIdx === acc.idx); })
          : null,
        data && data.ok
          ? React.createElement("div", { className: "vu-foot" }, "更新于 " + fmtTime((data.fetchedAt || Date.now()) / 1000))
          : null,
        !data && !error && !loading ? React.createElement("div", { className: "vu-hint" }, "加载中…") : null
      );
    }

    function UsagePill(props) {
      var state = React.useState(null);
      var data = state[0];
      var setData = state[1];
      var state2 = React.useState(null);
      var error = state2[0];
      var setError = state2[1];
      var load = React.useCallback(function () {
        fetch("/api/volc-usage", { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (res) { setData(res); setError(null); })
          .catch(function (e) { setError(String((e && e.message) || e)); });
      }, []);
      React.useEffect(function () {
        load();
        var timer = setInterval(load, 2 * 60 * 1000);
        return function () { clearInterval(timer); };
      }, [load]);
      var accounts = data && data.ok === true ? data.accounts : [];
      if (accounts.length === 0) {
        return React.createElement("span", { className: "vu-pill vu-pill-error", title: error || "未获取到用量，点击刷新", onClick: load }, "火 用量");
      }
      var titleLines = accounts.map(function (acc) {
        if (acc.ok === false) return acc.name + ": " + acc.error;
        var parts = quotaRows(acc.plan).map(function (q) {
          return levelLabel(q.Level) + " " + (Math.min(100, Math.max(0, Number(q.Percent) || 0))).toFixed(1) + "%";
        });
        return acc.name + ": " + parts.join(" · ") + (acc.balance ? " · 余额¥" + String(acc.balance.CashBalance || "0") : "");
      });
      return React.createElement("span", { className: "vu-pills", title: titleLines.join("\n"), onClick: load },
        accounts.map(function (acc, i) {
          var monthly = pctOf(acc, "monthly");
          var session = pctOf(acc, "session");
          var name = accShort(acc.name, i);
          return React.createElement("span", { className: "vu-pill", key: acc.name },
            React.createElement("span", { className: "vu-pill-name" }, name),
            React.createElement("span", { className: "vu-pill-num", style: { color: barColor(monthly) } }, "月" + monthly.toFixed(0) + "%"),
            React.createElement("span", { className: "vu-pill-num", style: { color: barColor(session) } }, "会" + session.toFixed(0) + "%")
          );
        })
      );
    }

    var CSS =
      ".vu-root{display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}" +
      ".vu-header{display:flex;align-items:center;justify-content:space-between}" +
      ".vu-title{font-weight:600}" +
      ".vu-refresh{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px}" +
      ".vu-refresh:disabled{opacity:.6;cursor:default}" +
      ".vu-account{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}" +
      ".vu-account-active{border-color:var(--dsw-alias-brand-primary)}" +
      ".vu-acc-title{font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px}" +
      ".vu-active-badge{font-size:11px;font-weight:500;color:var(--dsw-alias-bg-base);background:var(--dsw-alias-brand-primary);border-radius:999px;padding:1px 8px}" +
      ".vu-acc-body{display:flex;flex-direction:column;gap:10px}" +
      ".vu-status{color:var(--dsw-alias-label-secondary)}" +
      ".vu-row{display:flex;flex-direction:column;gap:6px}" +
      ".vu-row-head{display:flex;justify-content:space-between;align-items:center}" +
      ".vu-level{font-weight:600}" +
      ".vu-pct{color:var(--dsw-alias-label-secondary)}" +
      ".vu-bar{height:8px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}" +
      ".vu-bar-fill{height:100%;border-radius:4px;transition:width .3s}" +
      ".vu-row-foot{color:var(--dsw-alias-label-secondary);font-size:12px}" +
      ".vu-balance{color:var(--dsw-alias-label-secondary);font-size:12px}" +
      ".vu-foot{color:var(--dsw-alias-label-secondary);font-size:12px}" +
      ".vu-error{color:var(--dsw-alias-state-error-primary);padding:8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:6px}" +
      ".vu-hint{color:var(--dsw-alias-label-secondary)}" +
      ".vu-pills{display:inline-flex;align-items:center;gap:6px;font-size:12px}" +
      ".vu-pill{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}" +
      ".vu-pill-name{opacity:.75}" +
      ".vu-pill-num{font-weight:600}" +
      ".vu-pill-error{color:var(--dsw-alias-state-error-primary)}";

    function apply(ctx) {
      try {
        var tag = document.createElement("style");
        tag.dataset.plugin = "@local/volc-usage";
        tag.textContent = CSS;
        document.head.appendChild(tag);
        ctx.effect(function () {
          return function () { if (tag.parentNode) tag.parentNode.removeChild(tag); };
        }, "volc-usage: styles");
      } catch (e) {}
      var slots = ctx.get("slots");
      if (slots === undefined) return;
      try {
        slots.inject("settings.section", function () {
          return slots.register(
            { name: "settings.section", id: "volc-usage", order: 12, label: "火山引擎用量" },
            function (slotProps) {
              return React.createElement(VolcUsagePanel, { close: slotProps.close });
            }
          );
        });
      } catch (e) {}
      // 会话右上角用量 pill 已移除（小鲸鱼挂件可查看用量）
      // try {
      //   slots.inject("conversation.session.header.utilities", function () {
      //     return slots.register(
      //       { name: "conversation.session.header.utilities", id: "volc-usage-pill", order: 5 },
      //       function () {
      //         return React.createElement(UsagePill, null);
      //       }
      //     );
      //   });
      // } catch (e) {}
    }

    exports.apply = apply;
    return module.exports;
  }
});
