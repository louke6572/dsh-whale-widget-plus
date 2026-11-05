// 语音诊断：把「语音发不出去」拆成可判定的阶段与错误码。
//
// 为什么单独一个模块：桥接里 TTS 失败以前只抛一句人话，导致用户和模型都分不清
// 「第三方（火山）挂了」「本地服务没起」「音色映射配错」「限流」——全部被转述成“TTS 没起来”。
// 这里只做纯函数，便于单测；真正的日志/重试在 bridge.js 里。

/** TTS/语音链路的错误分类。返回 { code, stage, hint }。 */
export function classifyVoiceError(message) {
  const text = String(message ?? '');
  const has = (re) => re.test(text);

  if (has(/频率超限|发送频率|rate.?limit/i)) {
    return {
      code: 'voice.rate-limited', stage: 'send',
      hint: '这是发送限流，不是 TTS 故障：等一会儿再发，或调大 socialV2.voice.maxPerMinute / maxPerHour',
    };
  }
  if (has(/没有配\s*\[voice\.characters\]|没有配映射|音色.*没配置|映射/i)) {
    return {
      code: 'voice.config-mapping', stage: 'config',
      hint: '音色名无法识别：回「语音设置」重新选一个音色',
    };
  }
  if (has(/没起来|无法连接|连接被拒|fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|TLS|handshake|ENOTFOUND|EAI_AGAIN|WinError 10061/i)) {
    return {
      code: 'voice.service-down', stage: 'network',
      hint: '连不上语音端点：检查网络/代理；Edge 是纯在线服务，不需要本地进程',
    };
  }
  if (has(/401|403|鉴权|AppKey|Access.?Key|resource|余额|quota|欠费|未授权/i)) {
    return {
      code: 'voice.upstream-auth', stage: 'upstream',
      hint: '在线端点鉴权/配额异常：稍后重试，或换一个音色',
    };
  }
  if (has(/TTS 服务返回\s*5\d\d|没有引擎能满足/i)) {
    return {
      code: 'voice.engine-failed', stage: 'engine',
      hint: '语音端点内部合成失败：看 voice-errors.log 里的 detail，稍后重试',
    };
  }

  if (has(/云端合成失败|网络\s*\？|timeout|TimeoutError|ETIMEDOUT|ENOTFOUND|5\d\d/i)) {
    return {
      code: 'voice.upstream-network', stage: 'upstream',
      hint: 'Edge 在线端点网络/服务异常：稍后重试；持续失败可检查代理',
    };
  }
  return {
    code: 'voice.unknown', stage: 'unknown',
    hint: '未分类的语音错误：把 voice-errors.log 最后一条发给开发者',
  };
}
