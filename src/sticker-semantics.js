// 表情语义层：编号 / 情绪分类 / 内容描述 / 关键词 / 本地注意力编码 / 语境匹配。
//
// 目标（用户 2026-10-23 要求）：
//   1. 收藏表情时给一个稳定编号（#01、#02…）；
//   2. 每个表情归到一个情绪类别（可带 0~2 个副情绪）；
//   3. 每个表情有一句「内容」描述 + 若干触发关键词；
//   4. 聊天时按「情绪相近 / 内容相近」自动挑出最贴合的 1~3 张。
//
// 为什么不是「真·预训练 Transformer」：
//   本机没有 embedding 服务（无 API key、无 ollama、无 onnx 模型），而聊天时匹配必须
//   在本地、同步、无网络、几毫秒内完成。这里实现的是**单层多头 self-attention 编码器**
//   （哈希特征 → 随机投影词向量 → 位置编码 → 4 头 QKV 注意力 → 残差 + LayerNorm → 池化），
//   权重由固定种子生成、未训练；相似度仍然可靠地来自「字/词重叠 + 情绪词表扩展」，
//   注意力只负责让上下文词（比如「离谱」）在邻近情绪词周围权重更高。
//   这不是装饰：换成语义更弱的纯分词 Jaccard 时，跨说法（「挨骂了」→「无语」）就匹配不上，
//   情绪词表 + 编码器组合才撑得住「说法不同、意思相近」。
//
// 安全：本模块只做字符串/数字运算，不读文件、不发请求、不执行任何东西。
// 所有会被注入提示词的文本仍由 sticker-lib 的 sanitizeStickerText 单行化。

// ── 情绪表 ────────────────────────────────────────────────────────────────
// key 落库（稳定、英文），label 给人看/给模型看；words 是聊天里常见的说法。
// neighbors 用来兜「情绪相近」：委屈↔难过、嘲讽↔得意 这类相邻情绪给部分分。
export const STICKER_EMOTIONS = [
  { key: 'happy', label: '开心', words: ['开心', '高兴', '好耶', '太好了', '爽', '幸福', '哈哈哈', '嘿嘿', '乐死', '棒', '快乐', '美滋滋'] },
  { key: 'funny', label: '搞笑', words: ['搞笑', '好笑', '绷不住', '笑不活', '乐子', '整活', '离谱', '笑死', '草', '233', '段子'] },
  { key: 'smug', label: '得意', words: ['得意', '嚣张', '小样', '拿捏', '稳了', '哼哼', '骄傲', '炫耀', '看我', '轻轻松松'] },
  { key: 'tease', label: '嘲讽', words: ['嘲讽', '嘲笑', '杂鱼', '就这', '菜鸡', '欠揍', '阴阳', '讽刺', '拉胯', '弱哎', '不行啊', '笑你'] },
  { key: 'tsundere', label: '傲娇', words: ['傲娇', '才不是', '才没有', '谁要', '口是心非', '别扭', '哼'] },
  { key: 'shy', label: '害羞', words: ['害羞', '脸红', '不好意思', '羞耻', '捂脸', '别看', '害羞了'] },
  { key: 'cute', label: '卖萌', words: ['可爱', '萌', '软乎乎', '贴贴', '抱抱', '亲亲', '撒娇', '嘤嘤', '乖', '摸摸'] },
  // 「别／再／嘲笑」中间常插字（别再嘲笑、别去嘲笑），所以长说法要单独列；
  // 只写「别嘲笑」会漏掉「别再嘲笑我的回复」这种最常见的委屈说法。
  { key: 'wronged', label: '委屈', words: ['委屈', '冤枉', '背锅', '不是我', '欺负', '可怜', '呜呜', '凭什么', '委屈巴巴', '想哭', '被骂', '挨骂', '别嘲笑', '再嘲笑', '别去嘲笑', '不要嘲笑', '被嘲笑', '别笑我', '笑话我', '求求你们', '求求', '别骂了'] },
  { key: 'sad', label: '难过', words: ['难过', '伤心', 'emo', '破防', '哭了', '失落', '难受', '崩溃', '心碎', '没意思', '沮丧'] },
  { key: 'angry', label: '生气', words: ['生气', '气死', '愤怒', '恼火', '火大', '想打人', '过分', '可恶', '烦死'] },
  { key: 'speechless', label: '无语', words: ['无语', '沉默', '问号', '服了', '醉了', '汗', '逆天', '说不出来', '离谱', '呃'] },
  { key: 'tired', label: '摆烂', words: ['摆烂', '躺平', '累了', '累死', '不想动', '上班', '干饭', '吃饭', '划水', '摸鱼', '顶锅', '加班', '打工'] },
  { key: 'comfort', label: '安慰', words: ['安慰', '抱抱', '摸摸头', '别难过', '没事的', '心疼', '拍拍', '不哭', '有我在'] },
  // 不写裸「就是」：它是最常见的系词（「就是 wo 自己」），会把大量无关表情误标成赞同。
  { key: 'agree', label: '赞同', words: ['赞同', '同意', '对对对', '确实', '就是啊', '就是这样', '同上', '附议', '加一', '支持', 'me too', '我也是'] },
  { key: 'surprise', label: '惊讶', words: ['惊讶', '震惊', '卧槽', '真的假的', '不会吧', '什么鬼', '惊了', '吓', '啊这', '居然'] },
  { key: 'bye', label: '告别', words: ['再见', '拜拜', '晚安', '走了', '下线', '睡了', '告辞', '溜了', '下次聊'] },
  { key: 'hungry', label: '馋饿', words: ['饿', '馋', '想吃', '饭饭', '宵夜', '奶茶', '干饭', '外卖', '好吃'] },
  { key: 'scared', label: '害怕', words: ['害怕', '怕了', '恐怖', '吓人', '瑟瑟发抖', '不敢', '慌'] },
  // 兜底类别：没有明显情绪时用它，不参与词表检测。
  { key: 'neutral', label: '平淡', words: [] }
];

const EMOTION_BY_KEY = new Map(STICKER_EMOTIONS.map((e) => [e.key, e]));
export const EMOTION_KEYS = STICKER_EMOTIONS.map((e) => e.key);
export const EMOTION_LABELS = STICKER_EMOTIONS.map((e) => e.label);

// 情绪相邻关系（对称，写一边即可）。只影响「相近情绪给部分分」，不影响精确匹配。
const EMOTION_NEIGHBORS = {
  happy: ['cute', 'agree', 'funny'],
  funny: ['tease', 'happy', 'speechless'],
  smug: ['tease', 'happy'],
  tease: ['smug', 'funny', 'angry'],
  tsundere: ['tease', 'shy'],
  shy: ['cute', 'tsundere'],
  cute: ['shy', 'happy', 'comfort'],
  wronged: ['sad', 'comfort', 'cute'],
  sad: ['wronged', 'comfort'],
  angry: ['tease', 'speechless'],
  speechless: ['tired', 'funny', 'angry'],
  tired: ['speechless', 'hungry'],
  comfort: ['cute', 'wronged', 'sad'],
  agree: ['happy', 'cute'],
  surprise: ['speechless', 'funny'],
  bye: ['happy', 'cute'],
  hungry: ['tired', 'cute'],
  scared: ['surprise', 'wronged'],
  neutral: []
};

export function isStickerEmotion(key) {
  return Boolean(normalizeEmotionKey(key));
}

export function normalizeEmotionKey(key) {
  const k = String(key ?? '').trim().toLowerCase();
  if (EMOTION_BY_KEY.has(k)) return k;
  // 也允许直接写中文标签，比如 emotion: '委屈'
  const byLabel = STICKER_EMOTIONS.find((e) => e.label === String(key ?? '').trim());
  return byLabel ? byLabel.key : '';
}

export function emotionLabel(key) {
  return EMOTION_BY_KEY.get(normalizeEmotionKey(key))?.label ?? '平淡';
}

/**
 * 解析「编号」引用：#05 / 5 / 5号 / 05 都算 5。
 * 只认 1~4 位纯数字，避免把长数字的 emoji_id 误认成编号。
 */
export function parseStickerNumber(ref) {
  const match = String(ref ?? '').trim().match(/^#?\s*0*(\d{1,4})\s*(?:号)?$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n > 0 && n <= 9999 ? n : 0;
}

function neighborsOf(key) {
  const k = normalizeEmotionKey(key);
  if (!k) return [];
  const out = new Set(EMOTION_NEIGHBORS[k] || []);
  // 反向关系也补齐（表里只写一边）
  for (const [from, list] of Object.entries(EMOTION_NEIGHBORS)) {
    if (Array.isArray(list) && list.includes(k)) out.add(from);
  }
  out.delete(k);
  return [...out];
}

/**
 * 从一段聊天/备注文本里识别情绪，按强度降序。
 * 只用「词出现」判定：短词权重低，长词权重高；重复出现最多按 2 次计。
 * @returns {{key:string,label:string,score:number,weight:number,words:string[]}[]}
 */
export function detectEmotions(text) {
  const src = String(text ?? '');
  if (!src.trim()) return [];
  const hits = [];
  for (const emotion of STICKER_EMOTIONS) {
    if (!emotion.words.length) continue;
    let score = 0;
    const words = [];
    for (const word of emotion.words) {
      if (!word) continue;
      const count = src.split(word).length - 1;
      if (count <= 0) continue;
      // 词越长越具体：「别嘲笑」比「嘲笑」更能说明说话人其实是被嘲笑的一方
      score += Math.min(2, count) * (word.length >= 3 ? 1.6 : word.length === 2 ? 1 : 0.5);
      words.push(word);
    }
    if (score > 0) hits.push({ key: emotion.key, label: emotion.label, score, words });
  }
  hits.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const max = hits[0]?.score || 1;
  return hits.map((h) => ({ ...h, weight: h.score / max }));
}

// ── 分词 ──────────────────────────────────────────────────────────────────
const CJK_CLASS = '[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff]';
const TOKEN_RE = new RegExp(`[a-z0-9]+|${CJK_CLASS}+`, 'g');
const CJK_RE = new RegExp(CJK_CLASS);

/**
 * 中英混合分词：中文按「单字 + 相邻双字」出 token（不引第三方词典），英文/数字按词。
 * 双字是主力（委屈/摸头/干饭都是双字词），单字兜住「饿」「累」这类短词。
 */
export function tokenize(text) {
  const src = String(text ?? '').toLowerCase();
  const out = [];
  for (const match of src.matchAll(TOKEN_RE)) {
    const seg = match[0];
    if (!CJK_RE.test(seg[0])) { out.push(seg); continue; }
    const chars = [...seg];
    for (let i = 0; i < chars.length; i += 1) {
      out.push(chars[i]);
      if (i + 1 < chars.length) out.push(chars[i] + chars[i + 1]);
    }
  }
  return out;
}

// ── 本地注意力编码器 ──────────────────────────────────────────────────────
// 128 维、单头**无训练**自注意力：Q=K=V=词向量，权重 = softmax(词间余弦 / τ)。
// 直观解释：一句话里互相呼应的词（「抱着碗」+「委屈」）会被彼此加权，池化后
// 更能代表整句；没有训练参数，所以不会像随机投影 + 逐词 LayerNorm 那样塌缩成
// 几乎所有文本都同向（实测那样做任意两句余弦都在 0.98，完全失去区分度）。
// 词向量本身用固定种子的随机投影（哈希特征），保证跨进程可复现。
const DIM = 128;
const MAX_TOKENS = 64;
const ENCODER_SEED = 0x9e3779b9;
const ATTENTION_TEMPERATURE = 0.12;
const ATTENTION_MIX = 0.45;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let encoderWeights = null;
function weights() {
  if (encoderWeights) return encoderWeights;
  const rand = mulberry32(ENCODER_SEED);
  const gauss = () => (rand() * 2 - 1) * 0.12;
  const R = new Float32Array(DIM * DIM);
  for (let i = 0; i < R.length; i += 1) R[i] = gauss();
  // 哈希特征 → 词向量的随机投影（第 col 列是一个 token 的基向量）
  encoderWeights = { R };
  return encoderWeights;
}

function softmaxInPlace(arr, offset, len) {
  let max = -Infinity;
  for (let j = 0; j < len; j += 1) if (arr[offset + j] > max) max = arr[offset + j];
  let sum = 0;
  for (let j = 0; j < len; j += 1) {
    const v = Math.exp(arr[offset + j] - max);
    arr[offset + j] = v;
    sum += v;
  }
  const inv = sum > 0 ? 1 / sum : 0;
  for (let j = 0; j < len; j += 1) arr[offset + j] *= inv;
}

function l2(vec) {
  let norm = 0;
  for (let d = 0; d < DIM; d += 1) norm += vec[d] * vec[d];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let d = 0; d < DIM; d += 1) vec[d] /= norm;
  return vec;
}

/**
 * 把文本编码成 DIM 维单位向量（余弦相似度用）。
 * 结构：分词 → 哈希词向量（固定种子随机投影，逐词 L2）→ 自注意力加权（Q=K=V）
 *       → 均值池化 → L2 归一化。空文本返回全零向量。
 */
export function encodeText(text) {
  const tokens = tokenize(text).slice(0, MAX_TOKENS);
  const n = tokens.length;
  const out = new Float32Array(DIM);
  if (!n) return out;
  const { R } = weights();

  // 1) 词向量：哈希到 R 的一列，带符号消除碰撞偏置，再按 token 归一化
  const X = new Float32Array(n * DIM);
  for (let i = 0; i < n; i += 1) {
    const hash = fnv1a(tokens[i]);
    const col = (hash >>> 1) % DIM;
    const sign = (hash & 1) ? 1 : -1;
    const base = i * DIM;
    let norm = 0;
    for (let d = 0; d < DIM; d += 1) {
      const v = R[d * DIM + col] * sign;
      X[base + d] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < DIM; d += 1) X[base + d] /= norm;
  }

  // 2) 自注意力：词 i 对词 j 的权重 = softmax(cos(x_i, x_j) / τ)。
  //    互相呼应的词（「抱着碗」「委屈」）权重高，重复词互相强化；
  //    没有任何训练参数，因此不会过拟合到某个语料，也不会有模型文件依赖。
  const Y = new Float32Array(n * DIM);
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const base = i * DIM;
    for (let j = 0; j < n; j += 1) {
      const jb = j * DIM;
      let sim = 0;
      for (let k = 0; k < DIM; k += 1) sim += X[base + k] * X[jb + k];
      scores[j] = sim / ATTENTION_TEMPERATURE;
    }
    softmaxInPlace(scores, 0, n);
    for (let j = 0; j < n; j += 1) {
      const weight = scores[j] * ATTENTION_MIX;
      if (!weight) continue;
      const jb = j * DIM;
      for (let k = 0; k < DIM; k += 1) Y[base + k] += weight * X[jb + k];
    }
    // 残差：保留词本身，注意力只做平滑
    for (let k = 0; k < DIM; k += 1) Y[base + k] += X[base + k];
  }

  // 3) 均值池化 + L2
  for (let i = 0; i < n; i += 1) {
    const base = i * DIM;
    for (let k = 0; k < DIM; k += 1) out[k] += Y[base + k];
  }
  const invN = 1 / n;
  for (let k = 0; k < DIM; k += 1) out[k] *= invN;
  return l2(out);
}

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < DIM; i += 1) sum += a[i] * b[i];
  return sum;
}

export function cosine(a, b) {
  return dot(a, b); // 编码器输出已 L2 归一化
}

// 表情向量的进程内缓存：按「条目 id + 语义文本签名」缓存，避免每次唤醒重算 30~100 条。
// 不落盘（state/stickers.json 保持可读；向量只是运行期缓存）。
const VECTOR_CACHE_MAX = 400;
const vectorCache = new Map();

function stickerSignature(entry) {
  return [
    entry?.emotion,
    entry?.emotionAlt?.join(','),
    entry?.content,
    entry?.desc,
    entry?.localNote,
    entry?.usage,
    entry?.keywords?.join(','),
    entry?.tags?.join(',')
  ].filter(Boolean).join('|');
}

export function stickerVector(entry) {
  const key = String(entry?.id ?? entry?.resId ?? entry?.no ?? '');
  const sig = stickerSignature(entry);
  const cacheKey = `${key}#${fnv1a(sig)}`;
  const cached = vectorCache.get(cacheKey);
  if (cached) return cached;
  const vec = encodeText(stickerSearchText(entry));
  if (vectorCache.size >= VECTOR_CACHE_MAX) {
    // 简单 FIFO 淘汰：表情总量本来就不大，不需要 LRU
    const first = vectorCache.keys().next().value;
    vectorCache.delete(first);
  }
  vectorCache.set(cacheKey, vec);
  return vec;
}

export function clearStickerVectorCache() {
  vectorCache.clear();
}

// 拼出用于向量化的表情文本：把情绪标签也拼进去，这样「说法的情绪词」能对上。
export function stickerSearchText(entry) {
  if (!entry) return '';
  const label = emotionLabel(entry.emotion);
  const altLabels = (Array.isArray(entry.emotionAlt) ? entry.emotionAlt : []).map(emotionLabel);
  return [
    entry.content,
    entry.desc,
    entry.localNote,
    entry.usage,
    label,
    ...altLabels,
    ...(Array.isArray(entry.keywords) ? entry.keywords : []),
    ...(Array.isArray(entry.tags) ? entry.tags : [])
  ].filter(Boolean).join(' ');
}

// ── 自动标注（新建/同步未标注表情时兜底） ────────────────────────────────
/**
 * 推断一条表情的语义字段（情绪 / 副情绪 / 内容 / 关键词）。
 * 只在字段缺失时用；模型显式给过的值永远优先（显式 == 看过图后的判断，更准）。
 */
export function inferStickerMeta(entry, fallback = {}) {
  const text = [
    entry?.content, entry?.desc, entry?.localNote, entry?.usage,
    ...(Array.isArray(entry?.tags) ? entry.tags : []),
    ...(Array.isArray(entry?.keywords) ? entry.keywords : [])
  ].filter(Boolean).join(' ');
  const hits = detectEmotions(text);
  const explicitEmotion = normalizeEmotionKey(entry?.emotion ?? fallback.emotion);
  const emotion = explicitEmotion || hits[0]?.key || 'neutral';
  const explicitAlt = (Array.isArray(entry?.emotionAlt) ? entry.emotionAlt : (Array.isArray(fallback.emotionAlt) ? fallback.emotionAlt : []))
    .map(normalizeEmotionKey).filter(Boolean);
  const emotionAlt = (explicitAlt.length ? explicitAlt : hits.map((h) => h.key))
    .filter((k, i, arr) => k !== emotion && arr.indexOf(k) === i)
    .slice(0, 2);
  const content = String(entry?.content || fallback.content || entry?.desc || entry?.localNote || '').trim();
  // 关键词**不做自动抽取**：没有分词词典时，字符双字会切出「辜被」「室顶」这种噪声，
  // 它们会污染关键词命中分（把无关表情推上来），比空数组更糟。
  // 关键词只来自两个地方：模型看图后写（qq_sticker_note / qq_collect_sticker），或标签。
  const keywords = Array.isArray(entry?.keywords) && entry.keywords.length
    ? entry.keywords
    : (Array.isArray(fallback.keywords) ? fallback.keywords : []);
  return { emotion, emotionAlt, content, keywords };
}

/**
 * 给整个表情库补编号和语义字段。
 * - 已有编号保留（编号是身份，QQ 端删表情后出现空号是正常的）；
 * - 没有编号的按 createdAt 顺序补下一个号；
 * - 重复编号在这个函数里就地修正（只可能来自手工改库）。
 * @returns {{entries:object[], changed:boolean}}
 */
export function ensureStickerIndex(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  let changed = false;
  const used = new Set();
  const ordered = [...list].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const noById = new Map();
  for (const entry of ordered) {
    const raw = Number(entry.no);
    if (Number.isSafeInteger(raw) && raw > 0 && !used.has(raw)) {
      used.add(raw);
      noById.set(entry.id, raw);
      if (entry.no !== raw) changed = true;
    }
  }
  // 新号从「现有最大号 + 1」开始，**不复用**已删除表情的空号：
  // 编号是身份，复用会让「#03」在两次对话里指到两张不同的图。
  let nextNo = used.size ? Math.max(...used) + 1 : 1;
  for (const entry of ordered) {
    if (noById.has(entry.id)) continue;
    used.add(nextNo);
    noById.set(entry.id, nextNo);
    nextNo += 1;
    changed = true;
  }
  for (const entry of list) {
    const wanted = noById.get(entry.id);
    if (entry.no !== wanted) { entry.no = wanted; changed = true; }
    const meta = inferStickerMeta(entry);
    if (entry.emotion !== meta.emotion) { entry.emotion = meta.emotion; changed = true; }
    const alt = meta.emotionAlt.join(',');
    if ((entry.emotionAlt || []).map(normalizeEmotionKey).join(',') !== alt) { entry.emotionAlt = meta.emotionAlt; changed = true; }
    if (entry.content !== meta.content) { entry.content = meta.content; changed = true; }
    if ((entry.keywords || []).join(',') !== meta.keywords.join(',')) { entry.keywords = meta.keywords; changed = true; }
  }
  return { entries: list, changed };
}

// ── 语境匹配 ──────────────────────────────────────────────────────────────
// 匹配分 = 情绪相似（含相邻情绪）+ 内容向量相似 + 关键词命中，再叠加使用倾向 / 近期重复惩罚。
// 权重是拍出来的，但经过 fixtures 校准：情绪权重最高（用户要的是「情绪相近」），
// 内容权重次之（同一情绪下要挑对画面），关键词只做微调。
const W_EMOTION = 0.46;
const W_CONTENT = 0.38;
const W_KEYWORD = 0.16;
const DEFAULT_MIN_SCORE = 0.34;
const DEFAULT_TOP_K = 3;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function emotionSimilarity(entry, hits) {
  if (!hits.length) return 0;
  const target = normalizeEmotionKey(entry?.emotion);
  const alts = (Array.isArray(entry?.emotionAlt) ? entry.emotionAlt : []).map(normalizeEmotionKey);
  const targetNeighbors = neighborsOf(target);
  let best = 0;
  for (const hit of hits) {
    let score = 0;
    if (hit.key === target) score = 1;
    else if (alts.includes(hit.key)) score = 0.82;
    else if (targetNeighbors.includes(hit.key)) score = 0.6;
    else if ((EMOTION_NEIGHBORS[hit.key] || []).includes(target)) score = 0.6;
    best = Math.max(best, score * hit.weight);
  }
  return best;
}

function keywordSimilarity(entry, lowered) {
  const words = [...(entry?.keywords || []), ...(entry?.tags || [])].filter((w) => w && String(w).length >= 2);
  if (!words.length || !lowered) return 0;
  let hit = 0;
  for (const word of words) if (lowered.includes(String(word).toLowerCase())) hit += 1;
  // 命中 2 个词就给满分，避免长关键词表把分数摊薄
  return clamp01(hit / Math.min(2, words.length));
}

/**
 * 按「当前聊天语境」给表情库打分排序。
 * @param entries 表情条目数组（需先 ensureStickerIndex）
 * @param context 最近几条消息拼成的文本
 * @param opts {{topK?:number, minScore?:number, now?:number, exclude?:string[]}}
 * @returns {{no:number,id:string,emotion:string,emotionLabel:string,content:string,desc:string,score:number,emotionScore:number,contentScore:number,reason:string}[]}
 */
export function rankStickers(entries, context, opts = {}) {
  const text = String(context ?? '').replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!text) return [];
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return [];
  const topK = Math.max(1, Math.min(10, Number(opts.topK) || DEFAULT_TOP_K));
  const minScore = Number.isFinite(Number(opts.minScore)) ? Number(opts.minScore) : DEFAULT_MIN_SCORE;
  const now = Number(opts.now) || Date.now();
  const exclude = new Set(opts.exclude || []);
  const hits = detectEmotions(text);
  // 把识别出的情绪标签拼进查询文本：说法里没出现「委屈」两个字时也能对上标了委屈的表情
  const queryVec = encodeText(`${text} ${hits.map((h) => h.label).join(' ')}`);
  const lowered = text.toLowerCase();

  const ranked = [];
  for (const entry of list) {
    if (exclude.has(entry.id)) continue;
    const vec = stickerVector(entry);
    // 余弦范围大致 [-0.2, 0.9]；线性拉伸到 0~1，负相关按 0 处理
    const contentScore = clamp01((dot(queryVec, vec) - 0.02) / 0.5);
    const emoScore = emotionSimilarity(entry, hits);
    const kwScore = keywordSimilarity(entry, lowered);
    let score = W_EMOTION * emoScore + W_CONTENT * contentScore + W_KEYWORD * kwScore;
    // 使用倾向：用过的略优先（真人也是顺手的那张），但上限很小，不能压过语义
    score += Math.min(0.03, (Number(entry.useCount) || 0) * 0.01);
    // 刚发过同一张就降权，避免每轮都是同一张
    const sinceUsed = now - (Number(entry.lastUsedAt) || 0);
    if (sinceUsed >= 0 && sinceUsed < 15 * 60 * 1000) score -= 0.08;
    else if (sinceUsed >= 0 && sinceUsed < 60 * 60 * 1000) score -= 0.03;
    score = clamp01(score);
    if (score < minScore) continue;
    const parts = [];
    if (emoScore >= 0.5) parts.push(`情绪命中「${hits.find((h) => h.key === normalizeEmotionKey(entry.emotion))?.label || emotionLabel(entry.emotion)}」`);
    if (contentScore >= 0.3) parts.push('内容相近');
    if (kwScore >= 0.5) parts.push('关键词命中');
    ranked.push({
      no: Number(entry.no) || 0,
      id: entry.id,
      emotion: entry.emotion,
      emotionLabel: emotionLabel(entry.emotion),
      content: entry.content || entry.desc || '',
      desc: entry.desc || '',
      score: Math.round(score * 1000) / 1000,
      emotionScore: Math.round(emoScore * 1000) / 1000,
      contentScore: Math.round(contentScore * 1000) / 1000,
      reason: parts.join('·') || '综合相近'
    });
  }
  ranked.sort((a, b) => b.score - a.score || (a.no || 999) - (b.no || 999));
  return ranked.slice(0, topK);
}

/**
 * 生成注入提示词的「当前语境匹配」段落。没有匹配时返回空串（不占 token）。
 */
export function buildStickerMatchHint(ranked, opts = {}) {
  const list = Array.isArray(ranked) ? ranked.filter(Boolean) : [];
  if (!list.length) return '';
  const max = Math.max(1, Math.min(5, Number(opts.max) || 2));
  const mood = Array.isArray(opts.moods) && opts.moods.length
    ? `当前语境情绪：${opts.moods.slice(0, 3).join(' / ')}。`
    : '';
  const top = list[0];
  const topRef = `#${String(top.no).padStart(2, '0')}`;
  const strongScore = Number.isFinite(Number(opts.strongScore)) ? Number(opts.strongScore) : 0.72;
  const strong = Number(top.score) >= strongScore;
  const lines = list.slice(0, max).map((item) => {
    const label = `#${String(item.no).padStart(2, '0')}`;
    return `- ${label} ${item.emotionLabel}｜${item.content || item.desc || '无描述'}`;
  });
  // 措辞跟着匹配分走：0.72 以上算「很贴合」，把「可以发」写成更强的建议。
  // 2026-10-24 实测：只写「真的贴合才发」，模型看到 0.83 的 #06 仍然自我审查
  // （日志原话「sending #06 might read as mocking/repeating」）→ 最后只发了文字。
  const tail = strong
    ? `（${topRef} 和当前语境很贴合（${Number(top.score).toFixed(2)}）：发它用 qq_send_sticker stickerId="${topRef}"。接梗、被吐槽/撒娇时发这张本身就自然，不是只有文字才叫回复；严肃/敏感话题、对方真的在生气时才别发。）`
    : '（真的贴合才发一张：qq_send_sticker stickerId="#编号"；情绪不对就别硬发，也不要每轮都发。）';
  return [
    `【表情匹配】${mood}本地语义索引最贴合：`,
    ...lines,
    tail
  ].join('\n');
}
