// 每天 8 个固定时间点，向白名单群分享「B 站碰到的最有趣的事」，并用角色的口吻评论。
//
// 实现方式：
//   · 素材由 bili-memory 的分享池挑（公开视频/收藏/评论/日记见闻，已过滤政治与娱乐圈）。
//   · 到点后给每个群投递一条「定时分享」提示词；桥接会把角色的回复自动发到群里。
//   · 同一天同一个时间点只跑一次（state/bili-share-history.json 记 lastSlot）。
//   · 分享过的素材 6 天内不再复用（除非池子不够）。
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TIMES = ['07:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00', '23:00'];

function normalizeTimes(times) {
  const valid = [];
  for (const raw of Array.isArray(times) ? times : DEFAULT_TIMES) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim());
    if (!m) continue;
    const hh = Math.min(23, Math.max(0, Number(m[1])));
    const mm = Math.min(59, Math.max(0, Number(m[2])));
    valid.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return [...new Set(valid)].sort();
}

function nextOccurrence(now, times) {
  for (const t of times) {
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() > now.getTime() + 1000) return d;
  }
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  const [hh, mm] = (times[0] ?? '07:00').split(':').map(Number);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function buildSharePrompt(card, timeLabel, { mode = 'chat', cardSent = false } = {}) {
  const title = String(card?.title ?? '').trim() || '一条B站视频';
  const url = String(card?.url ?? '').trim();
  const cleanBody = (s) => String(s ?? '')
    .replace(/记了\s*\d+\s*分[^。]*。/g, '')
    .replace(/今天目前最高[。]?/g, '')
    .replace(/今天评论\s*\d+\s*\/\s*\d+/g, '')
    .replace(/[（(]?rpid\s*\d+[^）)]*[）)]?/gi, '')
    .replace(/@[^\s@，。,.!?！？]{1,20}/g, (mention) => mention.slice(1))
    .replace(/看了条新的[：:]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const body = cleanBody(card?.reason || card?.text || '');
  const quote = cleanBody(card?.quote || '');
  const lines = [];
  lines.push(`【B站分享·定时任务】现在是 ${timeLabel}，请主动在群里分享一件你最近在B站碰到的有趣的事。`);
  if (cardSent) {
    // 默认发的是「【B站】标题 + 链接」文本（QQ 卡片走不通，见 PITFALLS #24）。
    lines.push('分享内容（标题 + 链接）已经由系统发到群里了：这一轮你只需要补 2~3 句短评，不要再发链接、BV 号或复述完整标题。');
  }
  lines.push('这一轮只做分享：不要回应群里的其他消息，不要把它当成谁在问你，也不要提“定时/任务/素材/记忆库”。');
  lines.push('');
  lines.push('素材（你真实看过/发过；细节以素材为准，不要编）：');
  lines.push(`- 标题/内容：${title}`);
  if (url) lines.push(`- 链接：${url}`);
  if (body && body !== title) lines.push(`- 你当时的判断/记录：${body.slice(0, 300)}`);
  if (quote) lines.push(`- 你当时的公开评论：「${quote.slice(0, 160)}」`);
  lines.push('');
  lines.push('要求：');
  lines.push('1. 用你自己的口吻（按角色卡），像群里随口分享，不要像新闻播报，也不要照抄素材原文。');
  if (cardSent) {
    lines.push('2. 只写 2~3 句短评，合计 50~100 字；不要重复卡片上的标题，也不要再发链接/BV 号。');
  } else {
    lines.push('2. 先用一句话说清是什么（带 BV 号或链接），再写 2~3 句短评；短评合计 50~100 字。');
  }
  lines.push('3. 不用 Markdown，不 @ 人；句子里的拼音字遵守角色卡（一句最多一个）。');
  lines.push('4. 不聊政治、时政、娱乐圈/明星八卦，只分享好玩的内容。');
  if (String(mode) === 'reserved2') {
    lines.push('5. 你是二代仿真模式，文本不会自动发送：请调用 mcp__snowluma__qq_send_message 把这段内容发到当前群，messages 用字符串（一条即可），不要只输出文本。');
  } else {
    lines.push('5. 只输出要发到群里的内容，不要输出 [SILENT]，不要解释，不要加引号。');
  }
  return lines.join('\n');
}

/**
 * @param {{
 *   stateDir:string,
 *   log?:(...args:any[])=>void,
 *   deliverPrompt:(key:string, text:string)=>Promise<any>,
 *   groups:string[],
 *   memory:any,
 *   isReady?:()=>boolean,
 *   times?:string[],
 *   gapMs?:number,
 * }} options
 */
export function createBiliShareScheduler({
  stateDir,
  log = () => {},
  deliverPrompt,
  groups = [],
  memory,
  isReady = () => true,
  times = DEFAULT_TIMES,
  gapMs = 4000,
  getMode = () => 'chat',
  sendCard = null,
  isEnabled = () => true,
}) {
  const timeList = normalizeTimes(times);
  const stateFile = path.join(stateDir, 'bili-share-state.json');
  let timer = null;
  let running = false;
  let started = false;

  function readState() {
    try {
      let text = fs.readFileSync(stateFile, 'utf8');
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const parsed = JSON.parse(text);
      return {
        lastSlot: typeof parsed?.lastSlot === 'string' ? parsed.lastSlot : '',
        lastRunAt: typeof parsed?.lastRunAt === 'string' ? parsed.lastRunAt : '',
        lastSlots: parsed && typeof parsed.lastSlots === 'object' && parsed.lastSlots && !Array.isArray(parsed.lastSlots)
          ? parsed.lastSlots
          : {},
      };
    } catch {
      return { lastSlot: '', lastRunAt: '', lastSlots: {} };
    }
  }

  function writeState(patch) {
    const next = { ...readState(), ...patch };
    if (!next.lastSlots || typeof next.lastSlots !== 'object' || Array.isArray(next.lastSlots)) next.lastSlots = {};
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      const tmp = `${stateFile}.${process.pid}.${Math.random().toString(16).slice(2, 8)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, stateFile);
    } catch (error) {
      log(`[B站分享] 状态写入失败：${error?.message ?? error}`);
    }
  }

  function markSlot(slotKey) {
    const st = readState();
    const lastSlots = { ...(st.lastSlots ?? {}) };
    const nowIso = new Date().toISOString();
    lastSlots[slotKey] = nowIso;
    const cutoff = Date.now() - 30 * 86400000;
    for (const [k, v] of Object.entries(lastSlots)) {
      if (Date.parse(v) < cutoff) delete lastSlots[k];
    }
    writeState({ lastSlot: slotKey, lastRunAt: nowIso, lastSlots });
  }

  function dateKey(now = new Date()) {
    return now.toLocaleDateString('sv-SE');
  }

  function slotIndexOf(timeLabel) {
    return timeList.indexOf(timeLabel);
  }

  async function fire(timeLabel, { manual = false } = {}) {
    if (!isEnabled()) {
      log('[B站分享] B站已停用（设置里的启动开关关了），跳过本次');
      return { ok: false, skipped: true, why: 'bili-disabled' };
    }
    if (running) {
      log('[B站分享] 上一轮还没跑完，跳过本次');
      return { ok: false, skipped: true };
    }
    if (!groups.length) return { ok: false, why: '没有白名单群' };
    if (!memory) return { ok: false, why: '记忆模块未初始化' };
    const now = new Date();
    const dk = dateKey(now);
    const slotKey = manual ? `${dk} manual ${now.toTimeString().slice(0, 5)}` : `${dk} ${timeLabel}`;
    const st0 = readState();
    const already = Boolean(st0.lastSlots?.[slotKey]) || st0.lastSlot === slotKey;
    if (!manual && already) {
      log(`[B站分享] ${slotKey} 已经跑过，跳过`);
      return { ok: true, skipped: true };
    }
    // DSH 暂时离线时不要跳过：deliverPrompt 会把提示词放进离线队列，
    // DSH 恢复后自动补投，比整天缺一条分享好。
    running = true;
    try {
      const slotIndex = Math.max(0, slotIndexOf(timeLabel));
      const card = memory.pickShareCard({ slotIndex, dateKey: dk });
      if (!card) {
        log('[B站分享] 没有新鲜素材（可分享的都已在 6 天内发过），本次跳过；不发旧的');
        return { ok: false, why: '没有新鲜素材' };
      }
      let sent = 0;
      for (const gid of groups) {
        const key = `group:${gid}`;
        let cardSent = false;
        if (sendCard) {
          try {
            cardSent = (await sendCard(key, card)) === true;
            if (cardSent) log(`[B站分享] ${timeLabel} 已发分享 ${key}：${String(card.title).slice(0, 30)}`);
          } catch (error) {
            log(`[B站分享] ${timeLabel} 分享发送失败 ${key}：${error?.message ?? error}`);
          }
        }
        const prompt = buildSharePrompt(card, timeLabel, { mode: getMode(), cardSent });
        let promptOk = false;
        try {
          await deliverPrompt(key, prompt);
          promptOk = true;
          log(`[B站分享] ${timeLabel} 已投递 ${key}：${String(card.title).slice(0, 30)}（${card.bvid || card.id}）`);
        } catch (error) {
          log(`[B站分享] ${timeLabel} 投递失败 ${key}：${error?.message ?? error}`);
        }
        if (cardSent || promptOk) sent += 1;
        if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
      }
      // 投递成功才记为已用/已跑；全部失败时不写 lastSlot，方便下一轮或手动补发。
      if (sent > 0) {
        memory.recordShare(card.id, slotKey);
        markSlot(slotKey);
      } else {
        log(`[B站分享] ${timeLabel} 全部群投递失败，本次不记为已跑`);
      }
      return { ok: sent > 0, sent, card: { id: card.id, title: card.title, bvid: card.bvid } };
    } finally {
      running = false;
    }
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    const next = nextOccurrence(new Date(), timeList);
    const delay = Math.max(1000, next.getTime() - Date.now());
    timer = setTimeout(async () => {
      const label = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
      try { await fire(label); } catch (error) { log(`[B站分享] 定时异常：${error?.message ?? error}`); }
      scheduleNext();
    }, delay);
    timer.unref?.();
    log(`[B站分享] 已排定：每天 ${timeList.join(' / ')}（下次 ${next.toLocaleString()}）→ ${groups.length} 个群`);
  }

  function start() {
    if (started) return;
    if (!groups.length) { log('[B站分享] 没有白名单群，未启动'); return; }
    started = true;
    // 启动补跑：桥接在时间点后 10 分钟内重启，且这个点还没跑过，就补一次。
    try {
      const now = new Date();
      const dk = dateKey(now);
      for (const t of timeList) {
        const [hh, mm] = t.split(':').map(Number);
        const slot = new Date(now);
        slot.setHours(hh, mm, 0, 0);
        const delta = now.getTime() - slot.getTime();
        const st = readState();
        const key = `${dk} ${t}`;
        if (delta >= 0 && delta <= 10 * 60 * 1000 && !st.lastSlots?.[key] && st.lastSlot !== key) {
          log(`[B站分享] 启动补跑 ${t}（已过点 ${Math.round(delta / 60000)} 分钟）`);
          setTimeout(() => { void fire(t); }, 1500).unref?.();
          break;
        }
      }
    } catch (error) {
      log(`[B站分享] 补跑检查失败：${error?.message ?? error}`);
    }
    scheduleNext();
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    started = false;
  }

  function status() {
    const st = readState();
    const next = nextOccurrence(new Date(), timeList);
    return {
      enabled: started,
      times: timeList,
      groups,
      nextAt: next.toISOString(),
      lastSlot: st.lastSlot ?? '',
      lastSlots: st.lastSlots ?? {},
      lastRunAt: st.lastRunAt ?? '',
      running,
    };
  }

  return {
    start,
    stop,
    fire,
    fireNow: (opts = {}) => fire(new Date().toTimeString().slice(0, 5), { ...opts, manual: true }),
    status,
    buildSharePrompt,
  };
}
