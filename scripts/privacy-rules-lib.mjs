/**
 * 隐私扫描的**判据库**（纯函数，无 IO）—— 供 `scripts/privacy-scan.mjs` 与单测共用。
 *
 * 为什么从扫描器里抽出来：2026-10-26 在这里发现过一个 fail-open 级别的 bug ——
 * 默认规则里有几条写了 `flags: ''`，而扫描循环用 `new RegExp(pattern, rule.flags ?? 'g')`：
 * 传空串时**没有 global 标志**，于是 `exec()` 永远返回同一个匹配、`lastIndex` 不前进。
 * 后果有两层，而且都不报错：
 *   ① 每条规则每个文件只看到**第一个**命中（后面的真泄漏永远看不到）；
 *   ② 循环空转到迭代上限，被误报成"文件太大，扫描不完整"。
 * 抽成纯函数 + 单测，是为了让"编译出来的正则一定是全局的"这件事有断言，
 * 而不是靠下一次改规则的人记得写 `g`。
 */

/** 把规则编译成**必定全局**的正则：缺 `g` 就补上，已有则原样保留（含其它标志）。 */
export function compileDenyRegex(rule) {
  const flags = String(rule?.flags ?? '');
  if (typeof rule?.pattern !== 'string' || !rule.pattern) throw new Error('规则缺少 pattern');
  return new RegExp(rule.pattern, flags.includes('g') ? flags : `${flags}g`);
}

/**
 * 噪音过滤：把**明显不是秘密**的命中挡掉。
 *
 * 为什么必须做：一个"什么都报"的扫描器等于没有扫描器——用户看两眼就不看了。
 * 这里挡掉的几类是实测出来的主要噪音源。
 */
export function isNoise(value, rule = {}) {
  const text = String(value ?? '');
  // 空匹配（规则写成可匹配空串时会出现）不是秘密，报它只会制造噪音。
  if (!text) return true;
  // 全 hex 的长串：git commit SHA（`dea3ce8c408a…`）而不是密钥
  if (rule.requireNonHex && /^[0-9a-f]+$/i.test(text)) return true;
  // 全大写下划线的长串：环境变量名 / 常量名（`PLAYWRIGHT_MODULE`）
  if (/^[A-Z0-9_]+$/.test(text)) return true;
  // 连字符/点号分隔的小写长串：文件名/包名/路径片段
  if (/^[a-z0-9._-]+$/.test(text)) return true;
  // 真凭据是**混合大小写 + 数字**的高熵串
  if (/^[A-Za-z0-9]+$/.test(text) && !(/[a-z]/.test(text) && /[A-Z]/.test(text) && /[0-9]/.test(text))) return true;
  // 备份文件名：`<名字>-2026-10-23T02-49-34-262Z`。
  // 这类串含小写+大写+数字，能骗过上面的启发式，但它是**时间戳尾巴**，不可能是密钥
  // （真凭据不会恰好以 ISO 时间结尾）。2026-10-26 实测：只这条就占 docs/ 里全部高熵命中。
  if (/-?\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(text)) return true;
  return false;
}
