/* 语音设置 —— AI 发语音条（Edge TTS，走 bridge）。
 *
 * ⚠️ 必须遵守的坑（踩过）：
 * 1) React 的 style 只能是对象，不能是字符串。传字符串会直接抛 React error #62
 *    （The `style` prop expects a mapping from style properties to values, not a string）。
 * 2) 配置路径必须是 socialV2.voice.tts.*：桥接只读这一段（src/bridge.js → voiceCfg()）。
 *
 * 文本朗读（旧「② 文本朗读」）已随本轮收尾删除：它写的是根级 voice.speak.*，
 * 全仓库没有任何消费方；气泡/台词的朗读由挂件侧决定（whale-widget.js 的
 * petSpeakText + 气泡事件里的 speak 标记），设置页再放一份假开关只会误导。
 */

// 微软 Edge 在线音色（readaloud 端点，零安装、免 key）。
// 2026-11 按官方列表核对过：晓涵 / 晓梦 / 晓双 三个旧音色已经从端点下线，
// 选中它们只会合成失败（试听没声音），所以这里不再提供。
const EDGE_VOICES = [
  // 普通话
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 女声温柔（默认）' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊 · 女声元气' },
  { id: 'zh-CN-YunxiNeural', label: '云希 · 男声磁性' },
  { id: 'zh-CN-YunjianNeural', label: '云健 · 男声少年' },
  { id: 'zh-CN-YunxiaNeural', label: '云夏 · 男声清亮' },
  { id: 'zh-CN-YunyangNeural', label: '云扬 · 男声稳重' },
  // 方言
  { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北 · 东北话' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮 · 陕西话' },
  // 粤语 / 香港
  { id: 'zh-HK-HiuGaaiNeural', label: '曉佳 · 粤语女声' },
  { id: 'zh-HK-HiuMaanNeural', label: '曉曼 · 粤语女声' },
  { id: 'zh-HK-WanLungNeural', label: '雲龍 · 粤语男声' },
  // 台湾
  { id: 'zh-TW-HsiaoChenNeural', label: '曉臻 · 台湾女声' },
  { id: 'zh-TW-HsiaoYuNeural', label: '曉雨 · 台湾女声' },
  { id: 'zh-TW-YunJheNeural', label: '雲哲 · 台湾男声' },
  // 多语种（能读中文，但带轻微外语口音，音色和普通话那组不同）
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava · 多语种女声' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma · 多语种女声' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew · 多语种男声' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian · 多语种男声' },
  { id: 'en-AU-WilliamMultilingualNeural', label: 'William · 多语种男声' },
];

// 在线免费模型（HuggingFace Space · Qwen3-TTS Voice Design）的默认声音描述。
// 改这句就等于换音色：越具体越稳（年龄 + 软硬 + 语速 + 情绪）。
const ONLINE_DESC_DEFAULT = '二十出头的女生，声音软一点、偏轻，语速自然偏快，带一点笑意，不要播音腔。';

// 阿里百炼 Qwen-TTS 的常用系统音色（更多见百炼「非实时语音合成」音色列表）。
const QWEN_VOICES = [
  { id: 'Cherry', label: 'Cherry · 女声（默认）' },
  { id: 'Serena', label: 'Serena · 女声' },
  { id: 'Chelsie', label: 'Chelsie · 女声' },
  { id: 'Ethan', label: 'Ethan · 男声' },
  { id: 'Dylan', label: 'Dylan · 男声' },
  { id: 'Jada', label: 'Jada · 女声' },
  { id: 'Sunny', label: 'Sunny · 女声' },
];

const QWEN_LANGS = [
  { id: 'Auto', label: '自动识别' },
  { id: 'Chinese', label: '中文' },
  { id: 'English', label: '英文' },
  { id: 'Japanese', label: '日文' },
  { id: 'Korean', label: '韩文' },
];

const DOUBAO_ENCODINGS = [
  { id: 'mp3', label: 'MP3（推荐）' },
  { id: 'wav', label: 'WAV' },
  { id: 'ogg_opus', label: 'OGG Opus' },
];

// 豆包语音默认音色（voice_type）。免费音色清单见火山引擎「小模型音色列表」，
// 把它贴进下面的输入框即可切换；填错会报「音色不存在」。
const DOUBAO_VOICE_DEFAULT = 'zh_female_xiaohe_uranus_bigtts';

const SPEAK_RATES = [
  { value: '-15%', label: '慢一点 · -15%' },
  { value: '-10%', label: '略慢 · -10%' },
  { value: '+0%', label: '正常 · +0%（默认）' },
  { value: '+10%', label: '略快 · +10%' },
  { value: '+20%', label: '轻快 · +20%' },
];

// 朗读音量：Edge 合成本身没有增益参数，音量在挂件播放端（Audio.volume）生效。
const SPEAK_VOLUMES = [
  { value: 30, label: '小声 · 30%' },
  { value: 50, label: '中等 · 50%' },
  { value: 70, label: '偏小 · 70%' },
  { value: 80, label: '默认 · 80%' },
  { value: 100, label: '最大 · 100%' },
];

function VoicePage({ qq, setQq, toast, defaults }) {
  const svVoice = (qq && qq.socialV2 && qq.socialV2.voice) ? qq.socialV2.voice : {};
  const qqTts = svVoice.tts ? svVoice.tts : {};
  // 后端 GET /config 会带 defaults（形状同配置）：未在配置文件里显式写的键，
  // 面板按后端默认值显示，但不写回配置（用户不动就不产生新键）。
  const dTts = (defaults && defaults.socialV2 && defaults.socialV2.voice && defaults.socialV2.voice.tts)
    ? defaults.socialV2.voice.tts
    : {};
  const setTts = function (key, value) { setQq(['socialV2', 'voice', 'tts', key], value); };
  const pick = function (key, fallback) {
    const own = qqTts[key];
    if (own !== undefined && own !== null) return own;
    const def = dTts[key];
    if (def !== undefined && def !== null) return def;
    return fallback;
  };

  // 显示值直接由配置派生，不用 useState 镜像：
  // 镜像只认初始值，底部「撤销」把配置改回去时界面不会跟着回去。
  const enabled = pick('enabled', false) === true;
  // 音源：edge（微软在线）/ local（本地 voxd 8765）/ cloud（火山引擎 8767）。
  // 后两条只是「本机起一个服务」，插件不捆绑模型；服务没起时试听会明确报错，不会静默换回 Edge。
  const route = String(pick('route', 'edge') || 'edge');
  const localBaseUrl = String(qqTts.localBaseUrl ?? dTts.localBaseUrl ?? 'http://127.0.0.1:8765');
  const localVoice = String(qqTts.localVoice ?? '');
  const cloudBaseUrl = String(qqTts.cloudBaseUrl ?? dTts.cloudBaseUrl ?? 'http://127.0.0.1:8767');
  const cloudVoice = String(qqTts.cloudVoice ?? '');
  // 在线免费模型：声音不是从列表里挑，而是用一句中文描述生成（不需要参考音频）。
  const onlineDesc = String(qqTts.onlineDesc ?? dTts.onlineDesc ?? ONLINE_DESC_DEFAULT);
  // 豆包 / 千问：各自一套凭证 + 音色。
  const doubaoAppId = String(qqTts.doubaoAppId ?? '');
  const doubaoToken = String(qqTts.doubaoToken ?? '');
  const doubaoVoice = String(qqTts.doubaoVoice ?? DOUBAO_VOICE_DEFAULT);
  const doubaoEncoding = String(qqTts.doubaoEncoding ?? 'mp3');
  const qwenApiKey = String(qqTts.qwenApiKey ?? '');
  const qwenVoice = String(qqTts.qwenVoice ?? 'Cherry');
  const qwenLanguage = String(qqTts.qwenLanguage ?? 'Auto');
  const edgeVoice = pick('edgeVoice', 'zh-CN-XiaoxiaoNeural');
  const maxChars = qqTts.maxChars ?? dTts.maxChars;
  const timeoutMs = qqTts.timeoutMs ?? dTts.timeoutMs;
  // 「消息卡片朗读」：开关在 QQ 配置的 purpose.cardSpeak；音色/语速在 voice.tts 里，和语音条分开。
  const cardSpeak = qq?.purpose?.cardSpeak === true;
  const speakVoice = String(qqTts.speakVoice || '');
  const speakRate = String(qqTts.speakRate || '+0%');
  const speakVolume = Number(qqTts.speakVolume ?? dTts.speakVolume ?? 80);
  const setSpeak = function (key, value) { setQq(['socialV2', 'voice', 'tts', key], value); };

  // 音色试听（走 bridge 合成 MP3，和语音条同一份音源）
  const [previewText, setPreviewText] = useState('你好，我是现在这个音色，听起来怎么样？');
  const [previewBusy, setPreviewBusy] = useState(false);
  const audioRef = useRef(null);

  const stopPreviewAudio = function () {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    try { audio.pause(); } catch (e) { /* 忽略 */ }
    try { URL.revokeObjectURL(audio.src); } catch (e) { /* 忽略 */ }
  };

  useEffect(function () {
    return stopPreviewAudio;
  }, []);

  // 走 bridge 合成 MP3 → 浏览器播放。和 QQ 语音条用的是同一份 Edge 音源。
  // rate 用于「朗读音色」试听（如 +10%），语音条试听固定 +0%。
  const playEdgePreview = async function (text, voice, rate, volume) {
    const say = String(text || '').trim();
    if (!say) { toast('✗ 先说点什么再试听'); return; }
    if (previewBusy) return;
    setPreviewBusy(true);
    stopPreviewAudio();
    try {
      const q = '?voice=' + encodeURIComponent(voice)
        + '&rate=' + encodeURIComponent(rate || '+0%')
        + '&text=' + encodeURIComponent(say.slice(0, 200));
      // 微软端点偶尔会「连上了但没音频」：自动重试一次，仍失败再报错。
      let res = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        res = await fetch(API + '/voice/preview' + q, { headers: { accept: 'audio/mpeg' } });
        if (res.ok || res.status < 500) break;
        if (attempt === 0) await new Promise(function (r) { setTimeout(r, 400); });
      }
      if (!res.ok) {
        let detail = 'HTTP ' + res.status;
        try {
          const data = await res.json();
          detail = data.hint || data.error || detail;
        } catch (e) { /* 非 JSON 响应，保留状态码 */ }
        const tail = route === 'edge'
          ? '这个音色可能已下线，换一个再试'
          : (route === 'local'
            ? '本地服务没启动，或音色名不存在（先在 8765 起 voxd）'
            : (route === 'online'
              ? '在线免费队列排队或失败，重试一次（需要联网）'
              : (route === 'doubao'
                ? '检查 AppID / Access Token / 音色 voice_type 是否开通'
                : (route === 'qwen'
                  ? '检查 API Key 是否属于百炼、额度是否用完'
                  : '云端代理没启动，或音色名不存在（先在 8767 起服务）'))));
        toast('✗ 试听失败：' + detail + '（' + tail + '）');
        return;
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      // 传入 0~100 时按「朗读音量」播放（试听听到的就是实际朗读的响度）
      if (volume !== undefined && volume !== null && isFinite(Number(volume))) {
        audio.volume = Math.max(0, Math.min(1, Number(volume) / 100));
      }
      audioRef.current = audio;
      audio.onended = stopPreviewAudio;
      audio.play().catch(function () { toast('✗ 浏览器拦截了播放，请再点一次'); });
    } catch (error) {
      toast('✗ 试听失败：' + ((error && error.message) ? error.message : 'bridge 未启动'));
    } finally {
      setPreviewBusy(false);
    }
  };

  return h('div', null,
    h('h2', null, '语音设置'),
    h('div', { className: 'qbw-infobox' }, '音源自己选：Edge（免 key）、豆包语音、千问 TTS、在线免费模型，或本地/云端 voxd 服务。插件不会下载任何模型；要 key 的那几条填你自己的凭证即可。'),

    h(Card, { title: '开关与音色' },
      h(Row, { label: '语音合成总开关', hint: '关掉后 AI 不再发语音条，文字聊天照常' },
        h('input', {
          type: 'checkbox',
          checked: !!enabled,
          onChange: function (e) { setTts('enabled', e.target.checked); },
        })
      ),
      h(Row, { label: '音源', hint: '决定用哪个引擎发声；换引擎只改这一项' },
        h('select', {
          className: 'qbw-select',
          value: route,
          onChange: function (e) { setTts('route', e.target.value); },
        },
          h('option', { value: 'edge' }, '微软 Edge 在线（免安装、免 key）'),
          h('option', { value: 'doubao' }, '豆包语音 · 火山引擎（21 款免费音色）'),
          h('option', { value: 'qwen' }, '阿里百炼 · Qwen-TTS'),
          h('option', { value: 'online' }, '在线免费模型 · Qwen3-TTS（约 10~30 秒/句）'),
          h('option', { value: 'local' }, '本地语音服务 · voxd（默认 8765）'),
          h('option', { value: 'cloud' }, '火山引擎 · 云端声音复刻（默认 8767）')
        )
      ),

      // ── Edge：音色下拉 ─────────────────────────────────────────────
      route === 'edge'
        ? h(Row, { label: '音色', hint: 'AI 说话的声音；点「试听」当场听' },
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            h('select', {
              className: 'qbw-input',
              value: edgeVoice,
              onChange: function (e) { setTts('edgeVoice', e.target.value); },
            }, (EDGE_VOICES.some(function (v) { return v.id === edgeVoice; })
              ? []
              : [h('option', { key: '__gone', value: edgeVoice }, '当前音色已下线 · 请换一个')]
            ).concat(EDGE_VOICES.map(function (v) {
              return h('option', { key: v.id, value: v.id }, v.label);
            }))),
            h(Btn, {
              onClick: function () { playEdgePreview(previewText, edgeVoice); },
              disabled: previewBusy,
            }, previewBusy ? '合成中…' : '试听')
          )
        )
        : null,

      // ── 豆包语音（火山引擎）：AppID + Access Token + 音色 ──────────
      route === 'doubao'
        ? [
          h(Row, { key: '__dba', label: 'AppID', hint: '火山引擎控制台 → 语音合成 → 应用' },
            h('input', {
              className: 'qbw-input',
              value: doubaoAppId,
              placeholder: '例如 1234567890',
              onChange: function (e) { setTts('doubaoAppId', e.target.value); },
            })
          ),
          h(Row, { key: '__dbt', label: 'Access Token', hint: '和 AppID 同一个应用里拿' },
            h('input', {
              className: 'qbw-input',
              type: 'password',
              value: doubaoToken,
              placeholder: '粘贴 Access Token',
              onChange: function (e) { setTts('doubaoToken', e.target.value); },
            })
          ),
          h(Row, { key: '__dbv', label: '音色 voice_type', hint: '从「小模型音色列表」里复制，填错会报音色不存在' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: doubaoVoice,
                placeholder: DOUBAO_VOICE_DEFAULT,
                onChange: function (e) { setTts('doubaoVoice', e.target.value); },
              }),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, doubaoVoice, '+0%'); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h(Row, { key: '__dbe', label: '音频格式', hint: 'MP3 兼容最好；WAV 体积大' },
            h('select', {
              className: 'qbw-select',
              value: doubaoEncoding,
              onChange: function (e) { setTts('doubaoEncoding', e.target.value); },
            }, DOUBAO_ENCODINGS.map(function (x) {
              return h('option', { key: x.id, value: x.id }, x.label);
            }))
          ),
        ]
        : null,

      // ── 阿里百炼 Qwen-TTS：API Key + 音色 + 语种 ──────────────────
      route === 'qwen'
        ? [
          h(Row, { key: '__qa', label: 'API Key', hint: '阿里云百炼控制台 → API Key' },
            h('input', {
              className: 'qbw-input',
              type: 'password',
              value: qwenApiKey,
              placeholder: 'sk-...',
              onChange: function (e) { setTts('qwenApiKey', e.target.value); },
            })
          ),
          h(Row, { key: '__qv', label: '音色', hint: '百炼的系统音色；更多见官方音色列表' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('select', {
                className: 'qbw-select',
                value: qwenVoice,
                onChange: function (e) { setTts('qwenVoice', e.target.value); },
              }, QWEN_VOICES.map(function (x) {
                return h('option', { key: x.id, value: x.id }, x.label);
              })),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, qwenVoice, '+0%'); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h(Row, { key: '__ql', label: '语种', hint: '纯中文时选「中文」，比自动识别更稳' },
            h('select', {
              className: 'qbw-select',
              value: qwenLanguage,
              onChange: function (e) { setTts('qwenLanguage', e.target.value); },
            }, QWEN_LANGS.map(function (x) {
              return h('option', { key: x.id, value: x.id }, x.label);
            }))
          ),
        ]
        : null,

      // ── 在线免费模型：用一句话描述声音 ───────────────────────────
      route === 'online'
        ? [
          h(Row, { key: '__od', label: '声音描述', hint: '越具体越稳：年龄 + 软硬 + 语速 + 情绪' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: onlineDesc,
                placeholder: ONLINE_DESC_DEFAULT,
                onChange: function (e) { setTts('onlineDesc', e.target.value); },
              }),
              h(Btn, {
                onClick: function () { playEdgePreview(previewText, '', '+0%'); },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
          h('div', { key: '__otip', className: 'qbw-hint' },
            '走 HuggingFace 的免费 GPU 队列：不需要装模型、不需要 key，但每句要等 10~30 秒，文字会发到对方服务器。'),
        ]
        : null,

      // ── 本地 / 云端：voxd 协议地址 + 音色名 ───────────────────────
      route === 'local' || route === 'cloud'
        ? [
          h(Row, { key: '__svc', label: '服务地址', hint: route === 'local' ? '本机 voxd 服务；没起就试听报错' : '火山引擎声音复刻代理；没起就试听报错' },
            h('input', {
              className: 'qbw-input',
              value: route === 'local' ? localBaseUrl : cloudBaseUrl,
              placeholder: route === 'local' ? 'http://127.0.0.1:8765' : 'http://127.0.0.1:8767',
              onChange: function (e) {
                setTts(route === 'local' ? 'localBaseUrl' : 'cloudBaseUrl', e.target.value);
              },
            })
          ),
          h(Row, { key: '__name', label: '音色名', hint: '服务里的音色 id（留空 = 用服务默认）' },
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              h('input', {
                className: 'qbw-input',
                value: route === 'local' ? localVoice : cloudVoice,
                placeholder: 'xiaoyu',
                onChange: function (e) {
                  setTts(route === 'local' ? 'localVoice' : 'cloudVoice', e.target.value);
                },
              }),
              h(Btn, {
                onClick: function () {
                  playEdgePreview(previewText, route === 'local' ? localVoice : cloudVoice, '+0%');
                },
                disabled: previewBusy,
              }, previewBusy ? '合成中…' : '试听')
            )
          ),
        ]
        : null,

      h(Row, { label: '试听文本', hint: '点「试听」时合成这一段（最多 200 字）' },
        h('input', {
          className: 'qbw-input',
          value: previewText,
          onChange: function (e) { setPreviewText(e.target.value); },
        })
      ),
      h('div', { className: 'qbw-hint' }, '音源/地址改完点底部「保存」再生效；试听用的是已保存的配置。')
    ),

    // 消息卡片朗读：开关 + 朗读音色/语速。合并到语音页，避免在「对话 → 桌宠」里另找一份。
    h(Card, {
      title: '消息卡片朗读',
      note: 'QQ 消息卡里她的新回复会自动念出来（不用打开气泡）。音色和语速与「语音条」分开设置，试听用的是这一套。',
    },
      h(Row, { label: '朗读开关', hint: '关掉后卡片只显示文字' },
        h('input', {
          type: 'checkbox',
          checked: cardSpeak,
          onChange: function (e) { setQq(['purpose', 'cardSpeak'], e.target.checked); },
        })
      ),
      h(Row, { label: '朗读音色', hint: '留空就跟随上面的语音条音色' },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('select', {
            className: 'qbw-input',
            value: speakVoice,
            onChange: function (e) { setSpeak('speakVoice', e.target.value); },
          },
            h('option', { key: '__follow', value: '' }, '跟随语音条音色'),
            (speakVoice && !EDGE_VOICES.some(function (v) { return v.id === speakVoice; }))
              ? [h('option', { key: '__gone2', value: speakVoice }, '当前音色已下线 · 请换一个')]
              : [],
            EDGE_VOICES.map(function (v) {
              return h('option', { key: v.id, value: v.id }, v.label);
            })),
          h(Btn, {
            onClick: function () { playEdgePreview(previewText, speakVoice || edgeVoice, speakRate, speakVolume); },
            disabled: previewBusy,
          }, previewBusy ? '合成中…' : '试听')
        )
      ),
      h(Row, { label: '朗读语速', hint: '朗读专用；语音条仍按正常语速' },
        h('select', {
          className: 'qbw-input',
          value: speakRate,
          onChange: function (e) { setSpeak('speakRate', e.target.value); },
        }, SPEAK_RATES.map(function (r) {
          return h('option', { key: r.value, value: r.value }, r.label);
        }))
      ),
      h(Row, { label: '朗读音量', hint: '只影响卡片/气泡朗读；系统音量仍可整体调节' },
        h('select', {
          className: 'qbw-input',
          value: String(speakVolume),
          onChange: function (e) { setSpeak('speakVolume', Number(e.target.value)); },
        }, SPEAK_VOLUMES.map(function (v) {
          return h('option', { key: String(v.value), value: String(v.value) }, v.label);
        }))
      ),
      h('div', { className: 'qbw-hint' }, '改完点底部「保存」；下一条卡片消息就用新音色。')
    ),

    h(Section, { title: '高级参数', note: '字数 / 超时 / 角色：通常不用改', defaultOpen: false },
      h(Row, { label: '单次最多字数', hint: '超出会被截断（20~2000，默认 120）' },
        h(NumberInput, {
          className: 'qbw-input', step: 10, min: 20, max: 2000,
          value: maxChars,
          placeholder: '120',
          onChange: function (v) { setTts('maxChars', v); },
        })
      ),
      h(Row, { label: '合成超时（毫秒）', hint: '网络慢就调大（5000~180000，默认 60000）' },
        h(NumberInput, {
          className: 'qbw-input', step: 5000, min: 5000, max: 180000,
          value: timeoutMs,
          placeholder: '60000',
          onChange: function (v) { setTts('timeoutMs', v); },
        })
      )
    ),

    h('div', { className: 'qbw-hint' }, '改完点底部「保存」，下次发送自动生效，不用重启 bridge。')
  );
}
