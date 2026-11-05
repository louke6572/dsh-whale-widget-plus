/**
 * dsh-Dfy（合并版）—— 宿主半边。
 *
 * 一个插件 = 两套能力：
 *   ① SurfCore：QQ 桥接 / B站 / 记忆 / 语音 / 额度（旧包 surfcore 的宿主入口原样复用）；
 *   ② dsh-Dfy 挂件：桌宠、气泡、QQ 消息卡、余额/峰谷面板（whale-widget 的宿主入口原样复用）。
 *
 * 合并前它是两个独立插件（surfcore-next + whale-widget 挂件），
 * 现在 profile 里只保留本包一个 bundle。
 *
 * ⚠️ 这里**故意不写对象级 inject**：
 *   · 挂件的桌面端注入行（webserver/index-inject）必须在宿主「启动时一次性收集」之前注册，
 *     对象级 inject 会把 apply 推迟到服务就绪之后，可能错过收集窗口（挂件在桌面端直接不出现）；
 *   · 所以本插件立即 apply：先跑挂件，再用局部 ctx.inject 等齐 SurfCore 需要的服务后跑 SurfCore。
 *   · 语义与 SurfCore 原来对象级 inject 相同，只是不再阻塞挂件的注册。
 */
import oldServer from '../backend/lib/index.js';
import whaleServer from '../widget/lib/index.js';

export const name = 'dsh-dfy';
export const inject = [];

function applySurfcore(ctx, config) {
  try {
    oldServer.apply(ctx, config);
  } catch (err) {
    console.error('[whalecore] surfcore apply failed:', err);
  }
}

export function apply(ctx, config) {
  // ① 挂件：立即注册（路由 / tapIndex / 桌面 index-inject 行都在 apply 里同步完成）
  try {
    whaleServer.apply(ctx, config);
  } catch (err) {
    console.error('[whalecore] whale widget apply failed:', err);
  }

  // ② SurfCore：等它依赖的三个服务就绪后再应用（与原对象级 inject 等价）
  try {
    const deps = Array.isArray(oldServer.inject) ? oldServer.inject : [];
    if (deps.length && typeof ctx.inject === 'function') {
      ctx.inject(deps, (sub) => applySurfcore(sub || ctx, config));
    } else {
      applySurfcore(ctx, config);
    }
  } catch (err) {
    console.error('[whalecore] surfcore inject failed:', err);
  }
}

export default { name, inject, apply };
