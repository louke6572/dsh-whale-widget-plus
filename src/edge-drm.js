// Edge TTS Sec-MS-GEC v2 签名算法移植（rany2/edge-tts drm.py master）。
// 纯 JS、零依赖。输出格式 "<CS64-16hex>-<SHA256-64hex>"。
// v2 核心：自定义 SHA-256（修改初始 state + 修改 round 14 常量） + CS64 双摘要。

import crypto from 'node:crypto';

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const CHROMIUM_FULL_VERSION = '143.0.3650.75';
export const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
export const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;

let clockSkewSeconds = 0;

/** 从 HTTP Date 头校正时钟偏移（服务器时间 - 客户端时间）。 */
export function adjustClockSkewFromDate(dateHeader) {
  if (!dateHeader) return false;
  try {
    const serverMs = Date.parse(dateHeader);
    if (!Number.isFinite(serverMs)) return false;
    clockSkewSeconds = (serverMs - Date.now()) / 1000;
    return true;
  } catch { return false; }
}

// ====== FIPS 180-4 SHA-256 基本元素 ======
const _K = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const _H0 = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];

// ====== v2 自定义常量 ======
const _V2_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const _V2_SCHEDULE = [
  0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
  0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564,
];
const _V2_ADJUSTMENT = 0xC9DC06A7;
const _K_V2_ROUND14 = [..._K]; _K_V2_ROUND14[14] = _V2_ADJUSTMENT;
const _V2_SIGMA0_ADJUSTMENT = 0x059C0B80;
const _V2_SIGMA1_ADJUSTMENT = 0x000B92C0;

// CS64 常量
const _CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D],
  [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF],
  [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C],
  [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB],
  [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464],
  [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];
const _CS64_FACTOR = 0x82893933;
const _CS64_ADJUSTMENT0 = 0xF2F90B1A;
const _CS64_ADJUSTMENT1 = 0x0B1A0000;

// ====== SHA-256 辅助函数 ======
const _rotr = (n, x) => (x >>> n) | (x << (32 - n));
const _sigma0 = x => _rotr(2, x) ^ _rotr(13, x) ^ _rotr(22, x);
const _sigma1 = x => _rotr(6, x) ^ _rotr(11, x) ^ _rotr(25, x);
const _gamma0 = x => _rotr(7, x) ^ _rotr(18, x) ^ (x >>> 3);
const _gamma1 = x => _rotr(17, x) ^ _rotr(19, x) ^ (x >>> 10);
const _ch = (x, y, z) => (x & y) ^ (~x & z);
const _maj = (x, y, z) => (x & y) ^ (x & z) ^ (y & z);

/** 标准 SHA-256 block：扩展 words[0:16] → 64，跑完整 64 轮。返回新 state。 */
function _sha256BlockStandard(hIn, w16) {
  const w = new Array(64);
  for (let i = 0; i < 16; i++) w[i] = w16[i] | 0;
  for (let i = 16; i < 64; i++) {
    w[i] = (_gamma1(w[i - 2]) + w[i - 7] + _gamma0(w[i - 15]) + w[i - 16]) | 0;
  }
  let [a, b, c, d, e, f, g, h] = hIn.map(x => x | 0);
  for (let i = 0; i < 64; i++) {
    const t1 = (h + _sigma1(e) + _ch(e, f, g) + _K[i] + w[i]) | 0;
    const t2 = (_sigma0(a) + _maj(a, b, c)) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a;
    a = (t1 + t2) | 0;
  }
  return [
    (hIn[0] + a) | 0, (hIn[1] + b) | 0, (hIn[2] + c) | 0, (hIn[3] + d) | 0,
    (hIn[4] + e) | 0, (hIn[5] + f) | 0, (hIn[6] + g) | 0, (hIn[7] + h) | 0,
  ];
}

/** 自定义 SHA-256 轮：不扩展 words（传入完整 64 个），从 firstRound 跑到 63。返回 working（不加 H0）。 */
function _sha256BlockFromState(hIn, fullW64, Kuse, firstRound) {
  let [a, b, c, d, e, f, g, h] = hIn.map(x => x | 0);
  for (let i = firstRound; i < 64; i++) {
    const t1 = (h + _sigma1(e) + _ch(e, f, g) + Kuse[i] + fullW64[i]) | 0;
    const t2 = (_sigma0(a) + _maj(a, b, c)) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a;
    a = (t1 + t2) | 0;
  }
  return [a, b, c, d, e, f, g, h];
}

// ====== v2 SHA-256 ======
function _buildV2Words(data7) {
  const w = new Array(64).fill(0);
  w[14] = data7.readUIntBE(0, 3);
  w[15] = data7.readUInt32BE(3);
  for (let idx = 16; idx < 30; idx++) {
    let v = _V2_SCHEDULE[idx - 16];
    if (idx - 2 >= 14) {
      const s1 = _gamma1(w[idx - 2]);
      v += (idx === 16) ? (s1 ^ _V2_SIGMA1_ADJUSTMENT) : s1;
    }
    if (idx - 7 >= 14) v += w[idx - 7];
    if (idx - 15 >= 14) {
      const s0 = _gamma0(w[idx - 15]);
      v += (idx === 29) ? (s0 ^ _V2_SIGMA0_ADJUSTMENT) : s0;
    }
    w[idx] = v | 0;
  }
  w[30] = (_gamma1(w[28]) + w[23] + _gamma0(w[15]) + w[14] + _V2_ADJUSTMENT - _K[14]) | 0;
  for (let i = 31; i < 64; i++) {
    w[i] = (_gamma1(w[i - 2]) + w[i - 7] + _gamma0(w[i - 15]) + w[i - 16]) | 0;
  }
  return w;
}

function _sha256InitV2(data7) {
  const words = _buildV2Words(data7);
  const working = _sha256BlockFromState(_V2_STATE, words, _K_V2_ROUND14, 14);
  return [
    (_H0[0] + working[0]) | 0, (_H0[1] + working[1]) | 0, (_H0[2] + working[2]) | 0, (_H0[3] + working[3]) | 0,
    (_H0[4] + working[4]) | 0, (_H0[5] + working[5]) | 0, (_H0[6] + working[6]) | 0, (_H0[7] + working[7]) | 0,
  ];
}

function _sha256DigestV2(data) {
  if (data.length < 7) throw new Error('need >= 7 bytes');
  const first7 = data.subarray(0, 7);
  const rest = data.subarray(7);
  const customLen = 57 + data.length;
  const padLen = ((55 - customLen) % 64 + 64) % 64;
  const padded = Buffer.concat([rest, Buffer.from([0x80]), Buffer.alloc(padLen, 0), Buffer.alloc(8)]);
  padded.writeBigUInt64BE(BigInt(customLen * 8), padded.length - 8);

  let state = _sha256InitV2(first7);
  for (let off = 0; off < padded.length; off += 64) {
    const w16 = new Array(16);
    for (let i = 0; i < 16; i++) w16[i] = padded.readUInt32BE(off + i * 4);
    state = _sha256BlockStandard(state, w16);
  }
  const buf = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) buf.writeUInt32BE((state[i] | 0) >>> 0, i * 4);
  return buf;
}

// ====== CS64 ======
function _rotr16(x) { x >>>= 0; return ((x << 16) | (x >>> 16)) >>> 0; }
function _wordsLe4Even(data) {
  const padLen = ((-data.length) % 4 + 4) % 4;
  const padded = Buffer.concat([data, Buffer.alloc(padLen)]);
  const out = [];
  for (let i = 0; i < padded.length; i += 4) out.push(padded.readUInt32LE(i) >>> 0);
  if (out.length % 2) out.push(0);
  return out;
}

/** 用 BigInt 做精确 32 位无符号乘法，避免 JS IEEE-754 双精度丢精度。 */
const U32MASK = 0xFFFFFFFFn;
function u32mul(a, b) { return Number((BigInt(a >>> 0) * BigInt(b >>> 0)) & U32MASK); }

function _cs64Digest(data, shaBuf) {
  const keyA = (shaBuf.readUInt32LE(0) | 1) >>> 0;
  const keyB = (shaBuf.readUInt32LE(4) | 1) >>> 0;
  const factors = [u32mul(keyA, _CS64_FACTOR), u32mul(keyB, _CS64_FACTOR)];

  const terms = [];
  const offsets = [];
  for (let i = 0; i < _CS64_COEFFICIENTS.length; i++) {
    const [c, o] = _CS64_COEFFICIENTS[i];
    terms.push(u32mul(c >>> 0, factors[i % 2]));
    offsets.push(o >>> 0);
  }

  const dataWords = _wordsLe4Even(Buffer.concat([Buffer.from([0]), data]));
  for (let idx = 0; idx < dataWords.length; idx++) {
    const w = dataWords[idx];
    const keySel = (idx % 2 === 0) ? keyA : keyB;
    const term = u32mul(w, keySel);
    const constA = (idx % 2 === 0) ? 0xEF0569FB : 0xC31713DB;
    const offset = u32mul(_rotr16(w), constA);
    if (idx === 0) {
      terms.push(((term + u32mul(_CS64_ADJUSTMENT0, factors[0])) | 0) >>> 0);
      offsets.push((offset + _CS64_ADJUSTMENT1) >>> 0);
    } else {
      terms.push(term);
      offsets.push(offset);
    }
  }

  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let idx = 0; idx < terms.length; idx += 2) {
    if (idx + 1 >= terms.length) break;
    const x = terms[idx] >>> 0, y = terms[idx + 1] >>> 0;
    // --- swap 部分 ---
    let t = _rotr16((offsets[idx] + x) >>> 0);
    let q = u32mul(t, 0x76F50F34);
    swapAcc = ((swapAcc + (u32mul(_rotr16(q), 0xC3EFEA97) + q) >>> 0) | 0) >>> 0;
    t = _rotr16((offsets[idx + 1] + y) >>> 0);
    q = u32mul(t, 0x1881CE3C);
    swapLast = (u32mul(_rotr16(q), 0x35BD1EC9) + q) >>> 0;
    swapAcc = ((swapAcc + swapLast) | 0) >>> 0;
    // --- state/acc 部分（Python 同一个循环里紧接着做）---
    state = ((u32mul(state, keyA) + x) | 0) >>> 0;
    state = u32mul(_rotr16(state), 0xCF98B111);
    state = u32mul(_rotr16(state), 0x87085B9F);
    state = u32mul(_rotr16(state), 0x12CEB96D);
    state = u32mul(_rotr16(state), 0x257E1D83);
    acc = ((acc + state) | 0) >>> 0;
    let t2 = ((u32mul(state, keyB) + y) | 0) >>> 0;
    t2 = u32mul(_rotr16(t2), 0xA27416F5);
    t2 = u32mul(_rotr16(t2), 0xD38396FF);
    state = u32mul(_rotr16(u32mul(_rotr16(t2), 0x7C932B89)), 0xBFA49F69);
    acc = ((acc + state) | 0) >>> 0;
  }
  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

function _tokenHash(data) {
  const shaBuf = _sha256DigestV2(data);
  const [c0, c1] = _cs64Digest(data, shaBuf);
  // Python: (c0.to_bytes(4, "little") + c1.to_bytes(4, "little")).hex().upper()
  const cs64Hex =
    ((c0 & 0xff).toString(16).padStart(2, '0') + ((c0 >>> 8) & 0xff).toString(16).padStart(2, '0') +
     ((c0 >>> 16) & 0xff).toString(16).padStart(2, '0') + ((c0 >>> 24) & 0xff).toString(16).padStart(2, '0') +
     (c1 & 0xff).toString(16).padStart(2, '0') + ((c1 >>> 8) & 0xff).toString(16).padStart(2, '0') +
     ((c1 >>> 16) & 0xff).toString(16).padStart(2, '0') + ((c1 >>> 24) & 0xff).toString(16).padStart(2, '0')).toUpperCase();
  const shaHex = shaBuf.toString('hex').toUpperCase();
  return `${cs64Hex}-${shaHex}`;
}

/** 生成 v2 Sec-MS-GEC token（固定时间戳时可复现）。 */
export function generateSecMsGec(unixTimestampMs) {
  const ts = (unixTimestampMs ?? (Date.now() + clockSkewSeconds * 1000)) / 1000;
  let ticks = ts + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const str = Math.round(ticks).toString() + TRUSTED_CLIENT_TOKEN;
  return _tokenHash(Buffer.from(str, 'ascii'));
}

export function generateConnectionId() {
  return crypto.randomBytes(16).toString('hex');
}
export function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}
