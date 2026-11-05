# 桌宠（默认不安装）

SurfCore 的「桌宠」是一个**独立栏目**，和 QQ / B站 / 记忆平级，互不依赖：

- 装 SurfCore 时**不会**自动装桌宠；
- 不装桌宠，其他栏目完全正常；
- 2026-11 精简：桌宠的**安装 / 启动 / 停止 / 卸载**已交给 DSH 小鲸鱼挂件，插件不再自带 Electron 安装器。

> 2026-10-25 起，桌宠不再只是「会动的形象」：它和 SurfCore 共用**当前角色**（人格卡 + 衰减记忆卡 + 目的机制），
> 支持 **文本对话 / 语音对话**，也能作为**「目的」栏目的主动搭话载体**。

---

## 1. 两个入口

| 位置 | 用途 |
| --- | --- |
| 设置 → SurfCore → **桌宠** | 挂件接入 / 在线状态、内置形象、**对话参数**（开关 / 回复字数 / 上下文轮数 / 思考强度）、对话测试 |
| 设置 → SurfCore → **目的** | 目的机制本身：**对话入口固定 QQ，气泡是可选的展示层**（开/关 + 气泡内容 文本/语音 + 快捷回复）、节奏与安静时段、素材、预览、立即试一次 |

「目的」独立于 QQ / B站 / 记忆：改的只是「要不要同时弹气泡」，不改人格与记忆；
2026-11 起设置页不再把「QQ 载体 / 桌宠载体」当成两个互斥选项（实际是同一段 QQ 对话 + 一个展示层）。

---

## 2. 在桌面上怎么用

1. 在桌宠上**右键** → **文本对话** / **语音对话**（托盘菜单同一组入口）。
2. 弹出对话框，输入后发送：
   - 文本对话 → 她用文字回；
   - 语音对话 → 她用语音回（TTS），**气泡里同时显示文字**。
3. 她的每一句话都会在桌宠上方的**气泡**里出现：
   - 主动搭话 → 气泡带「主动来找你」标签；
   - 语音 → 气泡里有播放按钮和时长；
   - **所有气泡都有「回复」按钮**：点它跳到对话框，并按这句话的形式打开（语音→语音对话，文本→文本对话）。
4. 气泡会在几秒后自动收起；鼠标停在气泡上会暂停计时（最多 60 秒）。
   新的一句话会立即顶掉旧气泡，不会排队堵住。

对话框里还能：切「文本 / 语音」模式、重播历史语音、断线时点「重连」。

### 专注模式（不主动打扰）

右键 / 托盘菜单最上面有 **「专注模式（不主动打扰）」**（勾选状态），设置 → 桌宠 → 对话里也有同一个开关。

- 开：**目的机制的自动主动搭话全部暂停**（载体 = 桌宠 或 QQ 都不发）、桌宠不弹主动气泡 / 不播主动语音；
  已经弹出的气泡会立刻收起。**你自己打开对话框聊天仍然正常**。
- 关：恢复；下一次 tick（≤60 秒）重新按排程判断。
- 「目的」页的手动「立即试一次」不受影响——那是你主动点的。
- 单一真相：`~/.dsh/surfcore/pet/focus.json`。桌宠菜单、设置页、插件 tick、QQ 桥接的自动 tick 都读它；
  所以桌宠没开、只在 QQ 里也会遵守（桥接每 10 秒读一次）。

---

## 3. 和 SurfCore 角色的关系

| 上下文 | 来源 |
| --- | --- |
| 人格 | 当前角色的 `persona.md`（`~/.dsh/surfcore/characters/<id>/persona.md`，或旧布局 `roles/*.md`） |
| 长期记忆 | 当前角色记忆卡的 **QQ 注入块**（`memory-card-prompt-qq.md`，会随时间衰减） |
| 心事 / 动机 | 目的状态里的 `pending` / 目标假设 / 最近情绪（`purpose-outreach.json`） |
| 私聊对象 | 设置 → SurfCore 的「管理员」（显示名 / QQ） |
| 模型 | DSH 默认模型（设置 → 模型；默认 `deepseek-account` / `deepseek-flash`），可用「思考强度」控制速度 |
| 语音 | 桥接的 TTS 配置（`socialV2.voice.tts`）：Edge TTS 音色、字数上限 |

对话**不会**走 DSH 的完整 agent 回合（那会带上所有工具和几万 token），而是插件直接调 DSH 的 `llm` 服务：
人设 / 记忆 / 说话规则拼成 system prompt，一次调用出结果。用量会补记到 token 额度「其他」分类。

### 记忆：桌宠的话也会写进同一张卡

以前记忆卡只从 **QQ**（主人私聊 / 群聊 / 她自己的发言）和 **B站**（视频 / 动态 / 想法）摄取；
2026-10-25 起，桌宠对话也走同一条管道：

```
桌宠 /chat 成功 → 插件追加两条 inbox 事件（platform=pet：主人说的 / 她回的）
  → 记忆卡维护器把「她回的」并进最近一条 pet-owner，形成一问一答
  → 同一套重要度评分 / 脱敏 / 每日遗忘 / 容量压缩
  → 「## 桌宠（私下相处）」小节注入 QQ 与桌宠提示词
```

- 开关：设置 → 桌宠 → **「把桌宠对话写进记忆卡」**（默认开）。关掉就只留在聊天记录里，不写卡。
- 记忆卡总开关（设置 → 记忆）关掉时不会写；已存在的记录不删。
- `scope=pet`：**默认不注入 B站**（B站只看公开/共享记忆）；QQ 和桌宠都能读到。
- 提示词预算紧张时，桌宠小节优先于「最近记得的」被保留（有回归测试钉住），不会被普通最近记忆挤掉。
- 全量卡里单独归到「桌宠（私下相处）」；原始 inbox 行仍保留在 `memory-inbox.jsonl`，去重靠 `inboxSeen`。
- 主动搭话也会落一条 `pet-self`（她主动说的那句），和问答案件分开。

### 语音：Edge TTS（微软在线，零安装）

桌宠**每次合成前都重读** `socialV2.voice.tts`，改音色/上限后**立刻生效，不用重启桌宠**：

- 2026-11 精简：本地 / 云端语音包（8765 / 8767）已下线，合成只剩 Edge TTS（`edgeVoice`）；
- 合成失败（没网、微软端点在抖）→ 只降级成文字，气泡照常显示，不会假装发了语音；
- 桌宠设置页/目的页会显示当前语音状态，便于核对。

---

## 4. 主动搭话：和 QQ 共用一套目的机制

```
素材（QQ 私聊/群聊 + B站 + 记忆卡 + 人格卡 + 惦记的事）
  → 驱动 / 目标假设（归属 / 置信度 / 价值 / 风险）
  → 选择这一轮要说的目的
  → 载体 = 桌宠 ? 插件生成一句话推给气泡（可选 TTS）
              : 桥接在她的 QQ 会话里调 qq_send_private_message
  → 回执 / 目标记账 / 排下一枪
```

- **同一份配置**：`config.json` 的 `purpose.*`（`carrier` 决定载体，`petModality` 决定桌宠用文本还是语音）。
- **同一份状态**：当前角色目录下的 `purpose-outreach.json`（今日次数 / 下次时间 / 惦记的事 / 目标 / 历史）。
- **互斥**：载体 = 桌宠时，桥接的自动 tick 不再出发（每次 tick 重读 `purpose.carrier`，30 秒内生效）；
  载体 = QQ 时，插件的桌宠 tick 直接返回。所以不会桌宠和 QQ 同时收到一条。
- **回落**：`purpose.petFallbackToQQ`（默认开）—— 桌宠没开着时，这一轮交给桥接按它自己的闸门发 QQ；
  关掉则宁可这轮不发。无论哪种，都不会两边都发。
- **手动试一次**：「目的」页的按钮按当前载体路由：桌宠 → 直接推一条到气泡；QQ → 交给桥接。
- **专注模式**：`focus.json` 开着时，两边的**自动** tick 都停（QQ 桥接也读同一份），只有手动「试一次」还能发。
  见第 2 节的「专注模式」。

> 细节见 [../guides/PURPOSE_OUTREACH.md](../../../docs/guides/PURPOSE_OUTREACH.md) 的「载体」一节。

---

## 5. 数据位置

```
~/.dsh/surfcore/pet/
  config.json          { source, electronPath, appDir, installedAt }
  app/                 解压后的桌宠应用（package.json + dist/ + skins/ + assets/）
  host.json            桌宠发现文件：{ baseUrl, token, api, pluginVersion }（插件每次启动/每 2 分钟重写）
  host-token           本地令牌（0600；host.json 里是同一把）
  focus.json           专注模式：{ enabled, updatedAt, source }（桌宠/设置页/桥接共读）
  chat/
    history-<charId>.json   对话历史（气泡重放 / 模型上下文）
  voice/               TTS 缓存（wav，内容寻址）
  tmp/                 下载安装包时的临时目录
  pet.pid              运行中的进程号
```

- `host.json` 里的 `token` 只在本机回环上使用；DSH 端口漂移后桌宠会自动重读这个文件。
- 对话历史按**角色**分开：换角色后不会串台；目的状态同样按角色隔离。
- 卸载桌宠只删 `app/`；`chat/` / `voice/` / `host.json` 保留（重装后对话还在）。

---

## 6. 安装流程（用户操作）

1. 设置 → SurfCore → **桌宠**
2. 填「安装包地址」：zip 的本地路径，或 `https://` 链接
3. 点「安装」→ 解压到 `pet/app`（或你设置的安装目录）
4. 填「Electron 路径」：本机 `electron.exe` 的完整路径（安装包**不带** Electron 运行时；留空会尝试从 PATH 找）
5. 点「启动」/「停止」；「卸载」只清 `app/`

安装包格式：

```
package.json       main = dist/main.js
dist/              构建产物（main.js / preload.js / renderer.js / dialog.* / bubble.* / index.html / slider.*）
skins/<id>/        manifest.json + art/*.png（可带多套形象）
assets/            tray.png / icon.png
```

在桌宠工程里一条命令生成：`npm run pack` → `artifacts/pet-pack.zip`。

「内置形象」列表由宿主读取 `app/skins/*/manifest.json` 的 `name` 字段得到，换皮肤不需要改插件。

---

## 7. 宿主接口

设置页（走 DSH 会话鉴权）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-surfcore/api/pet/status` | 安装/运行状态、形象列表、**对话 / 语音 / 模型 / 在线状态** |
| ~~POST~~ | ~~`/dsh-surfcore/api/pet/config`~~ | 已下线（Electron 桌宠整套移除，见下方说明） |
| ~~POST~~ | ~~`/dsh-surfcore/api/pet/install`~~ | 已下线 |
| ~~POST~~ | ~~`/dsh-surfcore/api/pet/start`~~ | 已下线 |
| ~~POST~~ | ~~`/dsh-surfcore/api/pet/stop`~~ | 已下线 |
| ~~POST~~ | ~~`/dsh-surfcore/api/pet/remove`~~ | 已下线 |
| POST | `/dsh-surfcore/api/pet/chat-test` | 在设置页发一句，结果推给桌宠气泡 |
| POST | `/dsh-surfcore/api/pet/focus` | 设置页切换专注模式（`{ enabled }`），并推事件给桌宠 |
| GET | `/dsh-surfcore/api/purpose/status` | 目的状态（按载体路由到插件或桥接） |
| POST | `/dsh-surfcore/api/purpose/preview` | 只读预览（零副作用） |
| POST | `/dsh-surfcore/api/purpose/run` | 立即按当前载体出发一次 |

> 2026-11 精简：桌宠界面改由 dsh-Dfy 挂件提供，Electron 桌宠的安装/下载/启停/卸载整套已下线，
> `pet.js` 只保留只读的 `status`。第 3~5 节里的 Electron 安装步骤仅作历史参考。
>
> 气泡显示规则（2026-11 修复）：桥接把 QQ 私聊收发 POST 到 `/qq/incoming`；插件会写 QQ 记录（`qq-message`），
> 并且对**她的回复**额外推一条 `reply` —— 挂件只对 `proactive` / `reply` 弹气泡，所以 QQ 里的回复现在也能在桌面看到。
> 「气泡内容 = 朗读语音」时事件带 `speak: true`，挂件用浏览器原生朗读读出来（纯文本则只显示文字）。

桌宠进程（**不能**用上面的路径：DSH 的 `connection.requestRejection` 会因为没有会话 Cookie 返回 401）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-surfcore/pet-api/health` | 探活 |
| GET | `/dsh-surfcore/pet-api/status` | 对话 / 语音 / 模型 / 在线 / 事件游标 |
| GET | `/dsh-surfcore/pet-api/config` | 角色名、对话上限、主动搭话载体与形式 |
| GET | `/dsh-surfcore/pet-api/history?limit=` | 对话历史（含语音回放地址） |
| POST | `/dsh-surfcore/pet-api/chat` | `{ text, modality }` → 文本/语音回复 |
| POST | `/dsh-surfcore/pet-api/chat/test` | 同上，并把结果作为事件推给所有桌宠（设置页测试用） |
| POST | `/dsh-surfcore/pet-api/focus` | `{ enabled, source }` → 写 `focus.json`，并推 `focus` 事件唤醒长轮询 |
| GET | `/dsh-surfcore/pet-api/events?since=&wait=` | 长轮询：主动搭话 / 测试回复事件 |
| GET | `/dsh-surfcore/pet-api/audio/<key>.wav?token=` | 语音回放 |
| GET/POST | `/dsh-surfcore/pet-api/purpose/*` | 目的状态 / 预览 / 手动出发（本地排障） |

鉴权：`x-pet-token: <host.json.token>`（音频用 `?token=`）。只接受 127.0.0.1 / localhost / ::1；
写操作必须是 `application/json`，且 Origin 同源（或没有 Origin）。

实现：`lib/pet.js`（状态）、`lib/pet-chat.js`（对话/语音/事件）、`lib/pet-purpose.js`（目的载体）、
`lib/pet-api.js`（桌宠专用路由）；设置页路由在 `lib/index.js` 的 `handlePet` / `handlePurpose`。

---

## 8. 载体：DSH 小鲸鱼挂件（2026-11 起）

桌宠的安装 / 启动 / 停止 / 卸载由 **DSH 小鲸鱼挂件**负责，插件只读状态：
`~/.dsh/surfcore/pet/host.json`（token 与端口）和挂件自己的运行状态。
老的 Electron 安装器（`pet/app`、`run.pid`、`--user-data-dir`）已随精简删除。

## 9. 运行状态怎么判断

「已装 / 已启动」来自挂件的外部状态（`lib/pet.js` 的 `status()`）；
「在线」是另一回事：桌宠通过 `/events` 长轮询证明自己活着（60 秒内有轮询 = 在线）。
主动搭话的回落判断看的是这个，不是进程 pid。

---

## 10. 排障

| 现象 | 先看什么 |
| --- | --- |
| 对话框一直「没连上 SurfCore」 | `~/.dsh/surfcore/pet/host.json` 是否存在；SurfCore 插件日志；桌宠日志（`pet/start.log`）里的 `[chat] surfcore connected` |
| 设置页测试有回复，但桌宠没气泡 | 「桌宠」页的在线徽章；桌宠是否在跑**新版**（右键菜单里有「文本对话」） |
| 语音回复没声音 | `socialV2.voice.tts.enabled` 是否开；Edge TTS 需要联网；气泡里的播放按钮是否可点；文字回复是否正常（语音失败只降级文字） |
| 改了音色，桌宠没跟着 | 下一次合成就重读 `socialV2.voice.tts.edgeVoice`，不用重启桌宠 |
| 专注模式开了还在主动搭话 | 看 `~/.dsh/surfcore/pet/focus.json` 的 `enabled`；桥接每 10 秒重读，插件每次 tick 读；手动「试一次」本来就不受限制 |
| 桌宠对话没进记忆卡 | 「桌宠 → 把桌宠对话写进记忆卡」是否开；设置 → 记忆的总开关；记忆卡是每 10 分钟整理一次，急的话点记忆页「立即整理」 |
| 桌宠和 QQ 都发主动搭话 | 检查 `purpose.carrier`；载体 = 桌宠时桥接应跳过自动 tick（插件日志会写 `[pet-purpose]`） |
| 手动「立即试一次」报 `pet-offline` | 桌宠没在跑 / 还没连上；先启动，或把载体切回 QQ |
| 插件刚重启后第一条主动搭话没收到 | 事件游标随插件重启归零，客户端会先取新水位（不重放旧消息）；下一条正常 |

---

## 11. 注意

- 挂件来自用户自己安装的 DSH 拓展，插件不做代码签名校验；只装自己信得过的来源。
- 对话内容会落在 `pet/chat/history-<角色>.json`，模型调用会算 token；不想要就把「启用桌宠对话」关掉。
