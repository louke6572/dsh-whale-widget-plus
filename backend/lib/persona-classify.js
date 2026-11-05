/**
 * 人格卡智能拆分：用户载入一张完整人格卡后，用一次低强度模型调用拆成
 *   核心 / 语气 / 日常 / 场景
 * 只返回草稿，不直接写盘；用户检查、编辑后逐层保存。
 *
 * 不记录原文；失败必须给 code/hint，不能静默。
 */
const MAX_INPUT = 64 * 1024;

export function createPersonaClassifier({ ctx, log = () => {}, tokenBudget = null } = {}) {
  function resolveModel() {
    try {
      const service = ctx?.get?.('agentDefaultModel');
      const selection = service?.currentSelection?.() ?? null;
      const provider = String(selection?.provider || '').trim();
      const model = String(selection?.model || '').trim();
      return provider && model ? { provider, model } : null;
    } catch {
      return null;
    }
  }

  function available() {
    try { return Boolean(ctx?.get?.('llm')?.stream) && Boolean(resolveModel()); } catch { return false; }
  }

  async function complete({ system, user, maxTokens = 3000 }) {
    const llm = ctx?.get?.('llm');
    if (!llm?.stream) {
      const error = new Error('DSH 模型服务不可用');
      error.code = 'PERSONA_CLASSIFY_UNAVAILABLE';
      throw error;
    }
    const target = resolveModel();
    if (!target) {
      const error = new Error('读不到 DSH 默认模型');
      error.code = 'PERSONA_CLASSIFY_NO_MODEL';
      throw error;
    }
    const base = {
      provider: target.provider,
      model: target.model,
      system: String(system || ''),
      messages: [{ role: 'user', content: [{ type: 'text', text: String(user || '') }] }],
      maxTokens,
      temperature: 0.2,
    };
    let text = '';
    let usage = null;
    for (const effort of [undefined, 'low']) {
      try {
        const stream = llm.stream(effort ? { ...base, reasoningEffort: effort } : base);
        for await (const chunk of stream) {
          if (!chunk) continue;
          if (chunk.type === 'text-delta' && chunk.text) text += chunk.text;
          else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage;
          else if (chunk.type === 'finish') {
            const kind = chunk.reason?.kind;
            if (kind === 'error' || kind === 'aborted') {
              throw new Error(chunk.reason?.failure?.message || (kind === 'aborted' ? '模型调用被取消' : '模型调用失败'));
            }
          }
        }
        if (text.trim()) break;
      } catch (error) {
        if (text.trim()) throw error;
        log(`[persona-classify] 失败（effort=${effort || '默认'}）：${String(error?.message ?? error).slice(0, 160)}`);
      }
    }
    if (!text.trim()) {
      const error = new Error('模型没有返回内容');
      error.code = 'PERSONA_CLASSIFY_EMPTY';
      throw error;
    }
    if (tokenBudget?.recordExternalUsage && usage) {
      try {
        tokenBudget.recordExternalUsage({
          category: 'other', sessionId: 'persona-classify', model: target.model, usage,
          at: Date.now(), label: '人格卡智能拆分',
        });
      } catch {}
    }
    return text;
  }

  function parse(text) {
    let raw = String(text ?? '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
    const obj = JSON.parse(raw.slice(start, end + 1));
    const clean = (v) => (typeof v === 'string' ? v.trim() : '');
    const scenes = {};
    for (const key of ['qq-group', 'qq-private', 'bili', 'pet']) scenes[key] = clean(obj?.scenes?.[key]);
    const out = {
      core: clean(obj?.core),
      tone: clean(obj?.tone),
      daily: clean(obj?.daily),
      scenes,
    };
    if (!out.core && !out.tone) throw new Error('模型返回的核心/语气都为空');
    return out;
  }

  /**
   * @param {string} text 完整人格卡
   * @returns {Promise<{core:string,tone:string,daily:string,scenes:object}>}
   */
  async function classify(text) {
    const source = String(text ?? '').trim();
    if (!source) {
      const error = new Error('人格卡为空');
      error.code = 'PERSONA_CLASSIFY_EMPTY_INPUT';
      throw error;
    }
    if (source.length > MAX_INPUT) {
      const error = new Error('人格卡超过 64KB，无法拆分');
      error.code = 'PERSONA_CLASSIFY_TOO_LARGE';
      throw error;
    }
    if (!available()) {
      const error = new Error('DSH 模型服务还没就绪');
      error.code = 'PERSONA_CLASSIFY_UNAVAILABLE';
      throw error;
    }
    const system = `你是 SurfCore 的人格卡拆分器。把用户给的一整张人格卡拆成四层，只输出一个 JSON 对象，不要解释。
字段：
- core：身份、价值观、底线、长期行为原则。必须稳定，不能写近期心情。
- tone：只写说话方式：口癖、句子长短、称呼习惯、标点、语气词。不要放身份/背景/价值观。
- daily：近期状态、习惯、心情、关系温度。会变化，可留空。
- scenes：按场景补充差异，对象包含 "qq-group"、"qq-private"、"bili"、"pet"；没有就空字符串。
要求：不编造原文没有的事实；能放语气就不要放核心；每条保持简洁。JSON 形如：
{"core":"...","tone":"...","daily":"...","scenes":{"qq-group":"","qq-private":"","bili":"","pet":""}}`;
    let output = await complete({ system, user: source, maxTokens: 3000 });
    try {
      return parse(output);
    } catch (firstError) {
      // 第二次：更强 JSON-only 约束；只重试一次，避免无限花钱。
      const retrySystem = `${system}

上一次输出不是合法 JSON。现在**只输出一个 JSON 对象**，不要 Markdown、不要解释、不要前后缀。字段必须齐全。`;
      output = await complete({ system: retrySystem, user: `人格卡：
${source}

只输出 JSON：`, maxTokens: 3000 });
      try {
        return parse(output);
      } catch (secondError) {
        const preview = String(output || '').replace(/\s+/g, ' ').slice(0, 180);
        const e = new Error(`模型返回无法解析：${String(secondError?.message ?? secondError).slice(0, 100)}；输出前 180 字：${preview || '（空）'}`);
        e.code = 'PERSONA_CLASSIFY_BAD_JSON';
        throw e;
      }
    }
  }

  return { classify, available, parse };
}
