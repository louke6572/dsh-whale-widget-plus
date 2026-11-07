/**
 * 功能模块（settings 栏位 = 可启停的模块）。
 *
 * 与能力槽的分工：
 *   · 模块 = 一整块功能（一个设置页 + 它的接口前缀），可在「模块中心」停用/启用；
 *   · 能力槽 = 模块内部某个可替换的实现点（谁来实现 douyin.feed / voice.speak）。
 *
 * 停用是运行期即时生效的：导航立刻隐藏、对应接口前缀返回 410。
 * 默认全部启用；状态存在合体层配置 unified.modules。
 */

// navPage = 设置页左侧导航里的页 id（lib/ui/02-shell.js）。
export const MODULES = [
  { id: 'bili', title: '养鱼（B站）', navPage: 'bili', description: 'B站观看、口味偏好、动态分享与观看历史。' },
  { id: 'tieba', title: '贴吧', navPage: 'tieba', description: '贴吧扫码登录、刷吧与心跳分享。' },
  { id: 'douyin', title: '抖音', navPage: 'douyin', description: '抖音网页版观看、私信与推荐流。', capabilities: ['douyin.feed'] },
  { id: 'qq', title: 'QQ', navPage: 'qq', description: 'QQ 桥接、群策略与防封号闸门。' },
  { id: 'characters', title: '角色与记忆卡', navPage: 'characters', description: '角色卡、人设与人设状态。' },
  { id: 'memory', title: '记忆同步', navPage: 'memory', description: 'QQ⇄B站 记忆同步、记忆卡与身份对齐。' },
  { id: 'pet', title: '桌宠', navPage: 'pet', description: '桌宠、气泡与桌宠用途。' },
  { id: 'voice', title: '语音设置', navPage: 'voice', description: '语音合成、音源与试听。', capabilities: ['voice.speak'] },
];

// 能力 → 所属模块：模块停用后，对应能力也拒绝调用。
export const CAPABILITY_MODULE = {
  'douyin.feed': 'douyin',
  'voice.speak': 'voice',
};

// 路由前缀 → 模块。按顺序匹配，第一条命中生效；没列出的前缀视为核心接口，不受模块开关影响。
const ROUTE_RULES = [
  ['/douyin', 'douyin'],
  ['/tieba', 'tieba'],
  ['/bili/', 'bili'],
  ['/watch-history', 'bili'],
  ['/preferences/scan', 'bili'],
  ['/pet', 'pet'],
  ['/purpose', 'pet'],
  ['/voice', 'voice'],
  ['/characters', 'characters'],
  ['/persona', 'characters'],
  ['/memory', 'memory'],
  ['/align', 'memory'],
  ['/fish-guard/qq', 'qq'],
  ['/group-policy', 'qq'],
];

export function moduleForPath(pathname, apiPrefix) {
  const rest = String(pathname ?? '').slice(String(apiPrefix).length);
  for (const [prefix, id] of ROUTE_RULES) {
    if (rest.startsWith(prefix)) return id;
  }
  return null;
}

export function isModuleEnabled(config, id) {
  const modules = config?.modules;
  if (!modules || typeof modules !== 'object') return true;
  return modules[id] !== false;
}

export function moduleList(config) {
  return MODULES.map((item) => ({ ...item, enabled: isModuleEnabled(config, item.id) }));
}
