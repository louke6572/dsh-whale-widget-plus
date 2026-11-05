/* 语音设置 —— ① AI 发语音条（Edge TTS，走 bridge） ② 文本朗读（浏览器原生，不依赖 bridge）
 *
 * ⚠️ 两个必须遵守的坑（踩过）：
 * 1) React 的 style 只能是对象，不能是字符串。传字符串会直接抛 React error #62
 *    （The `style` prop expects a mapping from style properties to values, not a string）。
 * 2) 组件顶层不能直接访问 window（宿主可能走 SSR），必须先 typeof 检查。
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

const hasWindow = typeof window !== 'undefined';
const hasSpeech = hasWindow && typeof window.speechSynthesis !== 'undefined';

function edgeVoiceLabel(id) {
  const hit = EDGE_VOICES.filter(function (v) { return v.id === id; })[0];
  return hit ? hit.label : id;
}

function VoicePage({ qq, setQq, save, toast }) {
  const qqVoice = (qq && qq.voice) ? qq.voice : {};
  const qqTts = qqVoice.tts ? qqVoice.tts : {};
  const qqSpeak = qqVoice.speak ? qqVoice.speak : {};

  // ① Edge TTS
  const [enabled, setEnabled] = useState(qqTts.enabled !== false);
  const [edgeVoice, setEdgeVoice] = useState(qqTts.edgeVoice || 'zh-CN-XiaoxiaoNeural');
  const [maxChars, setMaxChars] = useState(qqTts.maxChars || 120);
  const [timeoutMs, setTimeoutMs] = useState(qqTts.timeoutMs || 60000);

  // 音色试听（走 bridge 合成 MP3，和语音条同一份音源）
  const [previewText, setPreviewText] = useState('你好，我是现在这个音色，听起来怎么样？');
  const [previewBusy, setPreviewBusy] = useState(false);
  const audioRef = useRef(null);

  // ② 文本朗读
  const [speakEnabled, setSpeakEnabled] = useState(qqSpeak.enabled === true);
  const [speakEngine, setSpeakEngine] = useState(qqSpeak.engine === 'edge' ? 'edge' : 'browser');
  const [speakRate, setSpeakRate] = useState(qqSpeak.rate || 1.0);
  const [speakVoiceURI, setSpeakVoiceURI] = useState(qqSpeak.voiceURI || '');
  const [speakText, setSpeakText] = useState('你好，我是现在这个声音。');
  // 初始为空数组：首屏服务端/客户端一致，不会 hydration 冲突；挂载后再填充
  const [browserVoices, setBrowserVoices] = useState([]);

  useEffect(function () {
    if (!hasSpeech) return;
    const load = function () {
      setBrowserVoices(window.speechSynthesis.getVoices().slice());
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return function () {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
    };
  }, []);

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

  const speakTest = function () {
    if (speakEngine === 'edge') {
      playEdgePreview(speakText, edgeVoice);
      return;
    }
    if (!hasSpeech) { toast('✗ 当前浏览器不支持朗读'); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakText);
    u.lang = 'zh-CN';
    u.rate = speakRate;
    if (speakVoiceURI) {
      const hit = browserVoices.filter(function (v) { return v.voiceURI === speakVoiceURI; })[0];
      if (hit) { u.voice = hit; u.lang = hit.lang; }
    }
    window.speechSynthesis.speak(u);
  };

  const zhVoices = browserVoices.filter(function (v) { return /zh|cmn|Chinese/i.test(v.lang); });

  return h('div', null,
    h('h2', null, '语音设置'),

    // ───── ① Edge TTS ─────
    h('h3', { style: { marginTop: '16px', marginBottom: '8px' } }, '① AI 发语音条（Edge TTS）'),
    h('div', { className: 'qbw-infobox' }, '微软在线端点：零安装、有网就能用；QQ 语音条和 dsh-Dfy 挂件都走这里。'),

    h(Card, { title: '开关与音色' },
      h(Row, { label: '语音合成总开关', hint: '关掉后 AI 不再发语音条，文字聊天照常' },
        h('input', {
          type: 'checkbox',
          checked: !!enabled,
          onChange: function (e) { setEnabled(e.target.checked); setQq(['voice', 'tts', 'enabled'], e.target.checked); },
        })
      ),
      h(Row, { label: '音色', hint: 'AI 说话的声音；点「试听」当场听' },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('select', {
            className: 'qbw-input',
            value: edgeVoice,
            onChange: function (e) { setEdgeVoice(e.target.value); setQq(['voice', 'tts', 'edgeVoice'], e.target.value); },
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
        h('input', {
          className: 'qbw-input', type: 'number', min: 20, max: 2000, step: 10,
          value: maxChars,
          onChange: function (e) {
            const v = Math.max(20, Number(e.target.value) || 120);
            setMaxChars(v); setQq(['voice', 'tts', 'maxChars'], v);
          },
        })
      ),
      h(Row, { label: '合成超时（毫秒）', hint: '网络慢就调大（5000~180000，默认 60000）' },
        h('input', {
          className: 'qbw-input', type: 'number', min: 5000, max: 180000, step: 5000,
          value: timeoutMs,
          onChange: function (e) {
            const v = Math.max(5000, Number(e.target.value) || 60000);
            setTimeoutMs(v); setQq(['voice', 'tts', 'timeoutMs'], v);
          },
        })
      )
    ),

    // ───── ② 文本朗读（低频，默认收起） ─────
    h(Section, { title: '② 文本朗读（可选）', note: '浏览器朗读或 Edge 同音色；自动朗读暂未挂钩', defaultOpen: false },

    hasSpeech ? null : h('div', { className: 'qbw-err' }, '当前浏览器不支持 speechSynthesis，只能选「Edge 同音色」'),

    h('div', null,
      h(Card, { title: '开关与语音' },
        h(Row, { label: '朗读引擎', hint: 'Edge 同音色需要 bridge 在线（DSH 会自动拉起）' },
          h('select', {
            className: 'qbw-input',
            value: speakEngine,
            onChange: function (e) { setSpeakEngine(e.target.value); setQq(['voice', 'speak', 'engine'], e.target.value); },
          }, [
            h('option', { key: 'browser', value: 'browser' }, hasSpeech ? '浏览器原生（不联网、零依赖）' : '浏览器原生（当前浏览器不支持）'),
            h('option', { key: 'edge', value: 'edge' }, 'Edge 同音色（跟随①的音色）'),
          ])
        ),
        h(Row, { label: '自动朗读', hint: 'AI 回复出来后自动读' },
          h('input', {
            type: 'checkbox', checked: !!speakEnabled,
            onChange: function (e) { setSpeakEnabled(e.target.checked); setQq(['voice', 'speak', 'enabled'], e.target.checked); },
          })
        ),
        h(Row, { label: '朗读语速', hint: '0.5 ~ 2.0，默认 1.0' },
          h('input', {
            className: 'qbw-input', type: 'number', min: 0.5, max: 2.0, step: 0.1,
            value: speakRate,
            onChange: function (e) {
              const v = Number(e.target.value);
              if (v >= 0.5 && v <= 2.0) { setSpeakRate(v); setQq(['voice', 'speak', 'rate'], v); }
            },
          })
        ),
        speakEngine === 'browser'
          ? h(Row, {
            label: '朗读语音',
            hint: zhVoices.length
              ? ('本机可用中文语音 ' + zhVoices.length + ' 个')
              : (hasSpeech ? '正在读取本机语音…' : '浏览器不支持'),
          },
            h('select', {
              className: 'qbw-input',
              value: speakVoiceURI,
              onChange: function (e) { setSpeakVoiceURI(e.target.value); setQq(['voice', 'speak', 'voiceURI'], e.target.value); },
            }, [h('option', { key: '__auto', value: '' }, '— 跟随浏览器默认 —')].concat(
              zhVoices.map(function (v) {
                return h('option', { key: v.voiceURI, value: v.voiceURI }, v.name + '（' + v.lang + '）');
              })
            ))
          )
          : h(Row, { label: '朗读音色', hint: '跟随①选中的音色，改上面就一起变' },
            h('input', { className: 'qbw-input', type: 'text', disabled: true, value: edgeVoiceLabel(edgeVoice) })
          )
      ),

      h(Card, { title: '试听' },
        h('textarea', {
          className: 'qbw-input',
          style: { width: '100%', minHeight: '52px', resize: 'vertical' },
          value: speakText,
          placeholder: '输入要朗读的文字…',
          onChange: function (e) { setSpeakText(e.target.value); },
        }),
        h('div', { className: 'qbw-actions' },
          h(Btn, { onClick: speakTest, disabled: !speakText.trim() || previewBusy }, previewBusy ? '合成中…' : '朗读测试'))
      )
    )),

    h('div', { className: 'qbw-hint' }, '改完点底部「保存」，下次发送自动生效，不用重启 bridge。')
  );
}
