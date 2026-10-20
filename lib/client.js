window.__ModuleLoader__.load({
  id: 'dsh-whale-widget-plus',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // 客户端半区只负责把既有的 IIFE 资产挂进页面，并把它交给 DSH 的
    // client-modules 生命周期管理。宿主半区仍提供 /dsh-whale/widget.js。
    const WIDGET_SRC = '/dsh-whale/widget.js'
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
     * listeners and several timers. A complete teardown is tracked separately;
     * until then a page reload is the only reliable way to remove all of it
     * when the bundle is disabled.
     *
     * Probe first: HMR code replacement also disposes this module while the
     * Host is still alive, and that case must not reload the page.
     */
    function dispose() {
      let attempts = 0
      function checkHost() {
        attempts += 1
        try {
          fetch(HOST_PROBE, { cache: 'no-store', credentials: 'same-origin' })
            .then(function (response) {
              // Host still alive: this is an HMR code replacement, not a disable.
              if (response.status === 404) globalThis.location.reload()
            })
            .catch(function () {
              if (attempts < 6) setTimeout(checkHost, 200)
            })
        } catch (err) {}
      }
      setTimeout(checkHost, 200)
    }

    function apply(ctx) {
      appendWidget()
      ctx.effect(() => dispose, 'dsh-whale-widget-plus: client lifecycle')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
