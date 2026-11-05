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

const EDGE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 女声温柔（默认）' },
  { id: 'zh-CN-YunxiNeural', label: '云希 · 男声磁性' },
  { id: 'zh-CN-YunjianNeural', label: '云健 · 男声少年' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊 · 女声元气' },
  { id: 'zh-CN-XiaohanNeural', label: '晓涵 · 女声知性' },
  { id: 'zh-CN-YunyangNeural', label: '云扬 · 男声稳重' },
  { id: 'zh-CN-XiaomengNeural', label: '晓梦 · 女声少女' },
  { id: 'zh-CN-XiaoshuangNeural', label: '晓双 · 女声活力' },
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
  const edgeVoice = pick('edgeVoice', 'zh-CN-XiaoxiaoNeural');
  const maxChars = qqTts.maxChars ?? dTts.maxChars;
  const timeoutMs = qqTts.timeoutMs ?? dTts.timeoutMs;

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
  const playEdgePreview = async function (text, voice) {
    const say = String(text || '').trim();
    if (!say) { toast('✗ 先说点什么再试听'); return; }
    if (previewBusy) return;
    setPreviewBusy(true);
    stopPreviewAudio();
    try {
      const q = '?voice=' + encodeURIComponent(voice) + '&text=' + encodeURIComponent(say.slice(0, 200));
      const res = await fetch(API + '/voice/preview' + q, { headers: { accept: 'audio/mpeg' } });
      if (!res.ok) {
        let detail = 'HTTP ' + res.status;
        try {
          const data = await res.json();
          detail = data.hint || data.error || detail;
        } catch (e) { /* 非 JSON 响应，保留状态码 */ }
        toast('✗ 试听失败：' + detail);
        return;
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
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
    h('div', { className: 'qbw-infobox' }, '微软在线端点：零安装、有网就能用；QQ 语音条和 dsh-Dfy 挂件都走这里。'),

    h(Card, { title: '开关与音色' },
      h(Row, { label: '语音合成总开关', hint: '关掉后 AI 不再发语音条，文字聊天照常' },
        h('input', {
          type: 'checkbox',
          checked: !!enabled,
          onChange: function (e) { setTts('enabled', e.target.checked); },
        })
      ),
      h(Row, { label: '音色', hint: 'AI 说话的声音；点「试听」当场听' },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('select', {
            className: 'qbw-input',
            value: edgeVoice,
            onChange: function (e) { setTts('edgeVoice', e.target.value); },
          }, EDGE_VOICES.map(function (v) {
            return h('option', { key: v.id, value: v.id }, v.label);
          })),
          h(Btn, {
            onClick: function () { playEdgePreview(previewText, edgeVoice); },
            disabled: previewBusy,
          }, previewBusy ? '合成中…' : '试听')
        )
      ),
      h(Row, { label: '试听文本', hint: '点「试听」时合成这一段（最多 200 字）' },
        h('input', {
          className: 'qbw-input',
          value: previewText,
          onChange: function (e) { setPreviewText(e.target.value); },
        })
      )
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
