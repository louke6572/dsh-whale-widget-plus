/**
 * 新手体检的"判定"部分（纯函数，不碰 IO）。
 *
 * 为什么单独拆出来：判定规则要能被测试钉住（哪项该红、该给什么修复提示），
 * 而读配置/探端口这些副作用留在 index.js 里。见 scripts/test-doctor.mjs。
 */

/** @typedef {'ok'|'warn'|'fail'} CheckLevel */

function nodeEnough(version) {
  const [maj, min] = String(version).replace(/^v/, '').split('.').map((n) => Number(n));
  return maj > 22 || (maj === 22 && min >= 13);
}

/**
 * @param {object} ctx
 * @param {string} ctx.nodeVersion      process.versions.node
 * @param {boolean} ctx.hasUnified      统一配置是否已存在
 * @param {string} ctx.unifiedMasked    统一配置路径（已脱敏）
 * @param {string} ctx.ownerQQ          管理员 QQ（空 = 没配）
 * @param {string[]} ctx.groups         白名单群
 * @param {string[]} ctx.privates       白名单私聊
 * @param {{wsUrl?:string,httpUrl?:string}} ctx.snow
 * @param {{state?:string,hint?:string}} ctx.snowState
 * @param {boolean} ctx.bridgeSrc       src/bridge.js 是否存在
 * @param {string} ctx.bridgeMasked     桥接源码路径（已脱敏）
 * @param {string} ctx.profile          注册了 surfcore 的 DSH profile（空 = 没注册）
 * @param {string} ctx.token            控制台令牌（空 = 没生成）
 * @returns {Array<{name:string,level:CheckLevel,ok:boolean,detail:string,fix:string}>}
 */
export function buildInstallChecks(ctx) {
  const checks = [];
  const add = (name, level, detail, fix = '') => checks.push({ name, level, ok: level !== 'fail', detail, fix });

  add('Node 版本', nodeEnough(ctx.nodeVersion) ? 'ok' : 'fail',
    `v${ctx.nodeVersion}（需要 ≥ 22.13）`,
    nodeEnough(ctx.nodeVersion) ? '' : 'https://nodejs.org/ 装 LTS 后重开终端');

  add('管理员 QQ', ctx.ownerQQ ? 'ok' : 'warn',
    ctx.ownerQQ ? '已设置（不回显）' : '还没填 —— 她不知道谁是主人',
    ctx.ownerQQ ? '' : '设置 → 管理员，或点"一键配置"后填 QQ 号');

  const allowCount = (ctx.groups?.length ?? 0) + (ctx.privates?.length ?? 0);
  add('白名单', allowCount ? 'ok' : 'fail',
    allowCount ? `${ctx.groups?.length ?? 0} 个群 / ${ctx.privates?.length ?? 0} 个私聊` : '白名单为空 = 谁都不理（第一次装最容易卡这）',
    allowCount ? '' : '设置 → QQ → 白名单，加入你的群号/QQ 号');

  const snowFilled = Boolean(ctx.snow?.wsUrl && ctx.snow?.httpUrl);
  add('SnowLuma 配置', snowFilled ? 'ok' : 'fail',
    snowFilled ? `${ctx.snow.httpUrl} / ${ctx.snow.wsUrl}` : '没填 OneBot 的 HTTP/WS 地址',
    snowFilled ? '' : '设置 → QQ → 连接，填 SnowLuma 界面上的端口');

  const snowOk = ['connected', 'ok', 'online'].includes(String(ctx.snowState?.state ?? ''));
  add('SnowLuma 在线', snowOk ? 'ok' : 'warn',
    snowOk ? '已连上' : `探测结果：${ctx.snowState?.state || 'unknown'}${ctx.snowState?.hint ? ` · ${ctx.snowState.hint}` : ''}`,
    snowOk ? '' : '先启动 SnowLuma 并扫码登录');

  add('QQ 桥接源码', ctx.bridgeSrc ? 'ok' : 'fail',
    ctx.bridgeSrc ? ctx.bridgeMasked : '没找到 src/bridge.js：安装目录选错了？');

  return checks;
}

/** 体检结论：有 fail 就算没通过（warn 不影响）。 */
export function installOk(checks) {
  return checks.every((c) => c.level !== 'fail');
}

/**
 * 一键配置要补哪些项（只算"缺什么"，不执行写操作）。
 * @returns {string[]} 人类可读的动作名
 */
export function planDoctorFix({ hasUnified, hasToken, ownerQQ, currentOwnerQQ }) {
  const actions = [];
  if (!hasUnified) actions.push('生成统一配置 config.json');
  if (!hasToken) actions.push('生成控制台令牌');
  if (/^\d{5,15}$/.test(String(ownerQQ ?? '')) && String(ownerQQ) !== String(currentOwnerQQ ?? '')) {
    actions.push('写入管理员 QQ');
  }
  return actions;
}
