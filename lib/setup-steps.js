/**
 * 上手向导的步骤逻辑（纯函数，无 React 依赖，可单测）。
 *
 * 关键约定（2026-11 用户反馈「已经配置好的也显示流程没走完」）：
 *   · 「配置完成」只看目标状态 = 桥接在跑 且 SnowLuma 网关已连通；
 *   · 控制台密码 / 面板内管账号只是**可选增强**，不能用它把已配好的用户卡成未完成；
 *   · 已连通时，前面「安装 / 启动 / 登录」这些前置步骤一律视为已完成
 *     （否则老用户永远回不到日常视图）。
 *
 * 这个文件会被 build.mjs 内联进 lib/client.js，所以不要在这里 import React。
 */

export function buildSetupSteps({
  launcherPath = "",
  detected = false,
  webuiUp = false,
  hasPassword = false,
  accounts = [],
  bridgeRunning = false,
  gatewayConnected = false,
  processPid = null,
} = {}) {
  const ready = Boolean(bridgeRunning && gatewayConnected);
  const accountText = (accounts ?? []).map((a) => `${a.nickname || "?"}（${a.uin}）`).join("、");
  const steps = [
    {
      id: "detect",
      label: "识别 SnowLuma 安装位置",
      done: ready || Boolean(String(launcherPath ?? "").trim()) || detected === true,
      hint: String(launcherPath ?? "").trim()
        ? `已识别：${launcherPath}`
        : "点「自动识别」帮你在常见位置找；找不到就去「安装与维护」页手动选目录",
      actionLabel: "自动识别",
      actionId: "detect",
    },
    {
      id: "launch",
      label: "启动 SnowLuma（控制台）",
      done: ready || webuiUp === true,
      hint: (ready || webuiUp) ? "SnowLuma 已在运行" : "点「启动控制台」会拉起 SnowLuma；已经在运行就不动",
      actionLabel: "启动控制台",
      actionId: "start-snowluma",
    },
    {
      id: "login",
      label: "登录 QQ 账号",
      done: ready || (accounts ?? []).length > 0,
      hint: ((accounts ?? []).length > 0 || ready)
        ? (accountText ? `已登录：${accountText}` : "网关已连通（账号已登录）")
        : (processPid ? `找到 QQ 进程 PID ${processPid}：点「注入」后到 QQ 窗口扫码` : "先打开 QQ 停在登录页，再点「刷新进程列表」"),
      actionLabel: processPid ? "注入 QQ 进程" : "刷新进程列表",
      actionId: processPid ? "process-load" : "refresh",
    },
    {
      id: "bridge",
      label: "启动 QQ 桥接（自动写配置 · 顺带起 B站）",
      done: ready,
      hint: "点「一键开始」：自动找到 SnowLuma 的地址/token 写进配置，再重启桥接、按开关启动 B站",
      actionLabel: "一键开始",
      actionId: "auto-start",
    },
  ];
  const optional = {
    id: "console-manage",
    label: "面板内加 / 删 QQ 账号",
    done: hasPassword === true,
    hint: hasPassword
      ? "已连上控制台：以后的加号 / 退号都在这个面板里做"
      : "可选：填一次 SnowLuma 控制台密码，之后连它的网页都不用开",
    actionLabel: "填密码",
    actionId: "password",
  };
  return { ready, steps, optional };
}
