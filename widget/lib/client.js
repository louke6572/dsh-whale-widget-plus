window.__ModuleLoader__.load({
  id: 'dsh-dfy',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // 客户端半区只负责把既有的 IIFE 资产挂进页面，并把它交给 DSH 的
    // client-modules 生命周期管理。宿主半区仍提供 /dsh-whale/widget.js。
    // 2026-11：加版本查询串，防止浏览器继续用缓存里的旧脚本（QQ 同步/气泡的改动都在 widget.js 里）。
    const WIDGET_SRC = '/dsh-whale/widget.js?v=qqsync1'
    const HOST_PROBE = '/dsh-whale/about.json'
    const inject = []

    function appendWidget() {
      try {
        // 同一页面只允许一份。旧安装方式留下的注入行也走这个守卫。
        if (window.__dshWhaleWidget) return
        if (document.querySelector('script[data-dsh-whale-widget]')) return
        const script = document.createElement('script')
        script.src = WIDGET_SRC
        script.async = true
        script.dataset.dshWhaleWidget = '1'
        script.onerror = function () {}
        const parent = document.body || document.head || document.documentElement
        if (parent) parent.appendChild(script)
      } catch (err) {}
    }

    /**
     * The widget is a self-contained IIFE that owns a large DOM tree, global
     * listeners and several timers. Until a full teardown exists, a page reload
     * is the only reliable way to remove all of it when the bundle is disabled.
     *
     * 禁用时的刷新必须是「单发、可收敛」的（issue #8/#9：刷新后旧注入清单把挂件
     * 重新挂回来 → 再次 dispose → 再次 404 → 再次刷新，死循环）。这里三重护栏：
     *   ① sessionStorage 跨周期守卫：90 秒内只允许刷新一次；
     *   ② dispose 闭包内单发标志：一次 dispose 链最多 reload 一次；
     *   ③ 只在挂件确实挂载过（window.__dshWhaleWidget）时才刷新；
     * 另外探测到 200（HMR 换代码）永远不刷新。
     */
    const RELOAD_GUARD_KEY = 'dsh-whale-reload-once'
    const RELOAD_GUARD_MS = 90 * 1000

    function guardAge() {
      try {
        const stamp = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
        return stamp ? Date.now() - stamp : -1
      } catch (err) { return -1 }
    }

    function markGuard() {
      try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())) } catch (err) {}
    }

    function dispose() {
      // ① 跨周期守卫：刚刷新过的会话不再刷新（把反射循环收敛成最多一次）。
      const age = guardAge()
      if (age >= 0 && age < RELOAD_GUARD_MS) return

      // ③ 没挂载过挂件就没有必须靠刷新清理的 DOM。
      if (!window.__dshWhaleWidget) return

      let reloaded = false
      let attempts = 0
      // ② 先落旗再探测：即使刷新与禁用并发，第二次 dispose 也不会重复刷新。
      markGuard()

      function checkHost() {
        attempts += 1
        try {
          fetch(HOST_PROBE, { cache: 'no-store', credentials: 'same-origin' })
            .then(function (response) {
              if (response.status === 404 && !reloaded) {
                reloaded = true
                globalThis.location.reload()
              }
            })
            .catch(function () {
              if (attempts < 6) setTimeout(checkHost, 200)
            })
        } catch (err) {}
      }
      setTimeout(checkHost, 200)
    }

    function apply(ctx) {
      // 正常页面加载（不是刚刚因禁用而刷新）时清掉守卫，让之后再次禁用仍能刷新一次。
      try {
        const age = guardAge()
        if (age >= 5000) sessionStorage.removeItem(RELOAD_GUARD_KEY)
      } catch (err) {}
      appendWidget()
      ctx.effect(() => dispose, 'dsh-dfy: client lifecycle')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
