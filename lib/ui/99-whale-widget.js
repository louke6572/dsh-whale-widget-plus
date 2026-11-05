/* ─────────────────────────────────────────────────────────────────────────
 * 99-whale-widget —— 合并后挂件的兜底注入
 * 正常路径由宿主半边（whale-widget/lib/index.js）的 tapIndex / index-inject
 * 把 /dsh-whale/widget.js 注入 HTML；这里再补一条客户端注入，保证“客户端 bundle
 * 已加载但 HTML 注入没生效”的环境也能出现挂件。重复注入会由挂件自身的
 * window.__dshWhaleWidget 守卫拦掉。
 * ───────────────────────────────────────────────────────────────────────── */
function appendWhaleWidget() {
  try {
    if (window.__dshWhaleWidget) return;
    if (document.querySelector("script[data-dsh-whale-widget]")) return;
    if (document.querySelector('script[src*="/dsh-whale/widget.js"]')) return;
    const script = document.createElement("script");
    script.src = "/dsh-whale/widget.js?merged=1";
    script.async = true;
    script.dataset.dshWhaleWidget = "1";
    script.onerror = function () {};
    const parent = document.body || document.head || document.documentElement;
    if (parent) parent.appendChild(script);
  } catch (err) {}
}
