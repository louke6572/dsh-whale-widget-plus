/**
 * 能力槽（capability slot）——插件模块化的最小内核。
 *
 * 设计要点：
 *   · 以「能力」为单位而不是以「插件」为单位：douyin.feed / voice.speak 各有输入输出契约；
 *   · 一个能力同一时刻只跑一个**主实现**，可另存一个**备用实现**；
 *   · 切换前先用契约里的 mock 输入跑一次真实调用，结构不符就拒绝切换；
 *   · 运行期连续失败达到阈值（默认 3 次）自动回退到备用实现，并把事件写进模块中心；
 *   · 槽位配置存在合体层配置（capabilities.slots），统计与事件存在 ~/.dsh/surfcore/，
 *     不把高频计数写进用户配置。
 */
import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR } from './paths.js';
import { readUnified, saveUnified, writeJsonAtomic } from './store.js';

// 「停用」是一个显式槽位值：和「没配过 → 用内置默认」区分开，用户才能真的关掉模块。
export const OFF = '__off__';

const STATS_FILE = path.join(STATE_DIR, 'capabilities-state.json');
const EVENT_LIMIT = 60;

/**
 * 能力契约。output 用最小 JSON-Schema 子集校验（object/string/boolean/number/array）。
 * mock 必须足够轻：切换前的契约测试会真的调用一次 provider。
 */
export const CAPABILITY_CONTRACTS = {
  'douyin.feed': {
    title: '抖音推荐流',
    description: '让鱼读取或切换抖音当前视频。第三方插件只要实现同一输入输出，就能替换内置实现。',
    risk: 'medium',
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'next'] },
      },
      additionalProperties: false,
    },
    mock: { action: 'status' },
    output: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        action: { type: 'string' },
        page: { type: 'object' },
      },
      required: ['ok'],
    },
  },
  'voice.speak': {
    title: '语音合成',
    description: '把文字合成为可播放语音。内置「跟随语音设置」与「Edge TTS」两个实现，可随时互换。',
    risk: 'low',
    input: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        mode: { type: 'string', enum: ['voice', 'speak'] },
        voice: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    mock: { text: '你好，我是大肥鱼。', mode: 'voice' },
    output: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        key: { type: 'string' },
        durationMs: { type: 'number' },
        text: { type: 'string' },
      },
      required: ['ok'],
    },
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value) {
  return String(value ?? '').trim();
}

/** 最小 schema 校验：返回错误描述；null = 通过。只覆盖本项目契约用到的关键字。 */
function validate(schema, value, where = 'value') {
  if (!isPlainObject(schema)) return null;
  const type = schema.type;
  if (type === 'object') {
    if (!isPlainObject(value)) return `${where} 必须是对象`;
    for (const key of schema.required ?? []) {
      if (!(key in value)) return `${where}.${key} 缺失`;
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties || !(key in schema.properties)) return `${where}.${key} 是未声明的字段`;
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        const error = validate(child, value[key], `${where}.${key}`);
        if (error) return error;
      }
    }
    return null;
  }
  if (type === 'array') {
    if (!Array.isArray(value)) return `${where} 必须是数组`;
    return null;
  }
  if (type === 'string') {
    if (typeof value !== 'string') return `${where} 必须是字符串`;
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${where} 不在允许范围内`;
    return null;
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${where} 必须是数字`;
    return null;
  }
  if (type === 'integer') {
    if (!Number.isInteger(value)) return `${where} 必须是整数`;
    return null;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean') return `${where} 必须是布尔值`;
    return null;
  }
  return null;
}

function capConfig() {
  const config = readUnified().config ?? {};
  const raw = isPlainObject(config.capabilities) ? config.capabilities : {};
  return {
    slots: isPlainObject(raw.slots) ? raw.slots : {},
    backups: isPlainObject(raw.backups) ? raw.backups : {},
    autoRollback: raw.autoRollback !== false,
    failureThreshold: Math.max(1, Math.min(10, Number(raw.failureThreshold) || 3)),
  };
}

function saveCapConfig(patch) {
  const current = capConfig();
  try {
    saveUnified({ capabilities: { ...current, ...patch } });
    return true;
  } catch {
    return false;
  }
}

function readStateFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    return {
      providers: isPlainObject(raw.providers) ? raw.providers : {},
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  } catch {
    return { providers: {}, events: [] };
  }
}

// 同一进程内的第三方插件通过这个全局符号拿到宿主注册表（只暴露 register / invoke / snapshot）。
// 这样「换插件」不需要改宿主代码：插件在 apply 时 register 自己的实现即可。
const SHARED_KEY = Symbol.for('dsh-dfy.capability-registry');
export function getSharedCapabilityRegistry() {
  return globalThis[SHARED_KEY] ?? null;
}

export function createCapabilityRegistry({ log = () => {} } = {}) {
  const providers = new Map();
  const state = readStateFile();
  let flushTimer = null;
  let disposed = false;

  const flush = () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (disposed) return;
    try { writeJsonAtomic(STATS_FILE, { providers: state.providers, events: state.events.slice(0, EVENT_LIMIT) }); } catch {}
  };
  const later = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; try { writeJsonAtomic(STATS_FILE, { providers: state.providers, events: state.events.slice(0, EVENT_LIMIT) }); } catch {} }, 3000);
    flushTimer.unref?.();
  };

  const event = (kind, capability, detail = {}) => {
    state.events.unshift({ at: new Date().toISOString(), kind, capability, ...detail });
    state.events = state.events.slice(0, EVENT_LIMIT);
    later();
  };

  const statKey = (capability, providerId) => `${capability}|${providerId}`;
  const statsFor = (capability, providerId) => {
    const row = state.providers[statKey(capability, providerId)];
    return {
      ok: Number(row?.ok) || 0,
      fail: Number(row?.fail) || 0,
      consecutiveFail: Number(row?.consecutiveFail) || 0,
      lastError: String(row?.lastError ?? ''),
      lastAt: String(row?.lastAt ?? ''),
    };
  };

  const providersFor = (capability) => [...providers.values()].filter((item) => item.provides.includes(capability));

  function defaultProvider(capability) {
    const list = providersFor(capability);
    return list.find((item) => item.builtin) ?? list[0] ?? null;
  }

  /** 当前生效的实现：显式槽位 → 该实现；槽位=停用 → null；没配过 → 内置默认。 */
  function activeProvider(capability) {
    const cfg = capConfig();
    const slot = asString(cfg.slots[capability]);
    if (slot === OFF) return null;
    const chosen = slot ? providers.get(slot) : null;
    if (chosen && chosen.provides.includes(capability)) return chosen;
    return defaultProvider(capability);
  }

  function register(provider) {
    const id = asString(provider?.id);
    const provides = Array.isArray(provider?.provides) ? provider.provides.filter((item) => CAPABILITY_CONTRACTS[item]) : [];
    if (!id) throw new Error('能力实现必须有 id');
    if (!provides.length) throw new Error(`能力实现 ${id} 没有声明任何已知能力`);
    if (typeof provider.invoke !== 'function') throw new Error(`能力实现 ${id} 缺少 invoke`);
    const record = {
      id,
      name: asString(provider.name) || id,
      builtin: provider.builtin === true,
      risk: asString(provider.risk) || 'low',
      provides,
      invoke: provider.invoke,
    };
    providers.set(id, record);
    return () => { providers.delete(id); };
  }

  async function runContract(capability, providerId) {
    const contract = CAPABILITY_CONTRACTS[capability];
    if (!contract) return { ok: false, error: `未知能力：${capability}` };
    const provider = providers.get(providerId);
    if (!provider || !provider.provides.includes(capability)) {
      return { ok: false, error: `没有能实现 ${capability} 的 ${providerId || '（空实现）'}` };
    }
    const startedAt = Date.now();
    try {
      const output = await provider.invoke(JSON.parse(JSON.stringify(contract.mock)), { contract: true });
      const error = validate(contract.output, output, 'output');
      if (error) return { ok: false, error: `契约不符：${error}`, provider: providerId, ms: Date.now() - startedAt };
      if (output.ok !== true) return { ok: false, error: `契约不符：output.ok 必须为 true（实际 ${JSON.stringify(output.ok)}）`, provider: providerId, ms: Date.now() - startedAt };
      return { ok: true, provider: providerId, ms: Date.now() - startedAt, sample: output };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error).slice(0, 300), provider: providerId, ms: Date.now() - startedAt };
    }
  }

  async function switchTo(capability, providerId, { test = true } = {}) {
    const contract = CAPABILITY_CONTRACTS[capability];
    if (!contract) return { ok: false, error: `未知能力：${capability}` };
    const cfg = capConfig();
    const current = activeProvider(capability);
    const target = asString(providerId);

    // 空实现 id = 清空显式槽位，回到内置默认（不同于「停用」）。
    if (!target) {
      const fallback = defaultProvider(capability);
      // 注意：saveUnified 是深合并，直接删键不会生效；写空串再交给 normalizeUnified 过滤掉。
      const slots = { ...cfg.slots, [capability]: '' };
      saveCapConfig({ slots, backups: { ...cfg.backups, [capability]: current && fallback && current.id !== fallback.id ? current.id : '' } });
      event('switch', capability, { from: current?.id ?? '', to: fallback?.id ?? '', auto: true });
      return { ok: true, capability, provider: fallback?.id ?? '', previous: current?.id ?? '', auto: true };
    }

    if (target === OFF) {
      saveCapConfig({ slots: { ...cfg.slots, [capability]: OFF }, backups: { ...cfg.backups, [capability]: current?.id ?? '' } });
      event('disable', capability, { from: current?.id ?? '' });
      log(`[capability] ${capability} 已停用`);
      return { ok: true, capability, provider: OFF, disabled: true };
    }

    if (test) {
      const result = await runContract(capability, target);
      if (!result.ok) {
        event('switch-rejected', capability, { to: target, error: result.error });
        return { ...result, rejected: true };
      }
    }

    saveCapConfig({
      slots: { ...cfg.slots, [capability]: target },
      backups: { ...cfg.backups, [capability]: current && current.id !== target ? current.id : asString(cfg.backups[capability]) },
    });
    if (state.providers[statKey(capability, target)]) state.providers[statKey(capability, target)] = { ...state.providers[statKey(capability, target)], consecutiveFail: 0 };
    event('switch', capability, { from: current?.id ?? '', to: target });
    log(`[capability] ${capability} 已切换到 ${target}`);
    return { ok: true, capability, provider: target, previous: current?.id ?? '' };
  }

  /** 回退目标：优先上次切换前的主实现；没有就退回内置默认实现。 */
  function rollbackTarget(capability, currentId) {
    const cfg = capConfig();
    const backupId = asString(cfg.backups[capability]);
    const backup = backupId && backupId !== OFF ? providers.get(backupId) : null;
    if (backup && backup.id !== currentId && backup.provides.includes(capability)) return backup;
    const fallback = defaultProvider(capability);
    if (fallback && fallback.id !== currentId) return fallback;
    return null;
  }

  async function invoke(capability, input = {}) {
    const contract = CAPABILITY_CONTRACTS[capability];
    if (!contract) return { ok: false, error: `未知能力：${capability}` };
    const inputError = validate(contract.input, isPlainObject(input) ? input : {}, 'input');
    if (inputError) return { ok: false, error: `输入不符合契约：${inputError}` };

    const provider = activeProvider(capability);
    if (!provider) return { ok: false, error: `能力 ${capability} 已停用（可在设置 → 模块中心启用）`, disabled: true };

    const key = statKey(capability, provider.id);
    const row = state.providers[key] ?? { ok: 0, fail: 0, consecutiveFail: 0, lastError: '', lastAt: '' };
    try {
      const output = await provider.invoke(input, {});
      const error = validate(contract.output, output, 'output');
      if (error) throw new Error(`契约不符：${error}`);
      state.providers[key] = { ...row, ok: row.ok + 1, consecutiveFail: 0, lastAt: new Date().toISOString() };
      later();
      return { ok: true, capability, provider: provider.id, result: output };
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 300);
      const consecutiveFail = (Number(row.consecutiveFail) || 0) + 1;
      state.providers[key] = { ...row, fail: row.fail + 1, consecutiveFail, lastError: message, lastAt: new Date().toISOString() };
      event('failure', capability, { provider: provider.id, error: message, consecutiveFail });

      // 连续失败达到阈值 → 自动回退（只回退一次；再失败就停在备用实现上，避免来回抖）。
      const cfg = capConfig();
      let rolledBackTo = '';
      if (cfg.autoRollback && consecutiveFail >= cfg.failureThreshold) {
        const target = rollbackTarget(capability, provider.id);
        if (target) {
          saveCapConfig({
            slots: { ...cfg.slots, [capability]: target.id },
            backups: { ...cfg.backups, [capability]: provider.id },
          });
          state.providers[key] = { ...state.providers[key], consecutiveFail: 0 };
          rolledBackTo = target.id;
          event('rollback', capability, { from: provider.id, to: target.id, after: consecutiveFail });
          log(`[capability] ${capability} 连续失败 ${consecutiveFail} 次，自动回退到 ${target.id}：${message}`);
        }
      }
      return { ok: false, capability, provider: provider.id, error: message, consecutiveFail, rolledBackTo };
    }
  }

  function snapshot() {
    const cfg = capConfig();
    const capabilities = Object.entries(CAPABILITY_CONTRACTS).map(([id, contract]) => {
      const active = activeProvider(id);
      const providersList = providersFor(id).map((provider) => {
        const stats = statsFor(id, provider.id);
        const total = stats.ok + stats.fail;
        return {
          id: provider.id,
          name: provider.name,
          builtin: provider.builtin,
          risk: provider.risk,
          active: active?.id === provider.id,
          stats: { ...stats, rate: total ? Math.round((stats.ok / total) * 100) : null },
        };
      });
      const activeStats = active ? statsFor(id, active.id) : { ok: 0, fail: 0, consecutiveFail: 0, lastError: '', lastAt: '' };
      const total = activeStats.ok + activeStats.fail;
      return {
        id,
        title: contract.title,
        description: contract.description,
        risk: contract.risk,
        mock: contract.mock,
        active: active?.id ?? '',
        defaultProvider: defaultProvider(id)?.id ?? '',
        disabled: !active,
        backup: asString(cfg.backups[id]),
        autoRollback: cfg.autoRollback,
        failureThreshold: cfg.failureThreshold,
        ok: activeStats.ok,
        fail: activeStats.fail,
        consecutiveFail: activeStats.consecutiveFail,
        rate: total ? Math.round((activeStats.ok / total) * 100) : null,
        lastError: activeStats.lastError,
        providers: providersList,
      };
    });
    return {
      ok: true,
      off: OFF,
      capabilities,
      events: state.events.slice(0, 20),
    };
  }

  function resetStats() {
    state.providers = {};
    event('reset-stats', '', {});
    flush();
    return snapshot();
  }

  function dispose() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    try { writeJsonAtomic(STATS_FILE, { providers: state.providers, events: state.events.slice(0, EVENT_LIMIT) }); } catch {}
    disposed = true;
    providers.clear();
    if (globalThis[SHARED_KEY] === api) delete globalThis[SHARED_KEY];
  }

  const api = { register, providersFor, activeProvider, runContract, switchTo, invoke, snapshot, resetStats, dispose, CAPABILITY_CONTRACTS };
  globalThis[SHARED_KEY] = api;
  return api;
}
