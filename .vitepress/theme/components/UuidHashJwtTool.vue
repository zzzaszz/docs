<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

/** 有些 API（crypto.getRandomValues 等）在 SSR 阶段不可用 */
const mounted = ref(false)
onMounted(() => { mounted.value = true })

/* ================ UUID ================ */
const uuidVersion = ref<'v4' | 'v7' | 'nanoid' | 'random'>('v4')
const uuidCount = ref(10)
const uuidUpper = ref(false)
const uuidNoHyphen = ref(false)

/** UUID v4 —— 用 crypto */
function uuidV4(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

/** UUID v7 —— 时间有序，很适合做主键 */
function uuidV7(idx: number): string {
  // 用 performance.now() 相对时间做个粗略排序；同批次内递增
  const t = Math.floor(performance.now() + idx)
  const rand = new Uint8Array(10)
  crypto.getRandomValues(rand)
  const b = new Uint8Array(16)
  b[0] = (t >>> 40) & 0xff  // performance.now 精度有限，高位补 0 也够用
  b[1] = (t >>> 32) & 0xff
  b[2] = (t >>> 24) & 0xff
  b[3] = (t >>> 16) & 0xff
  b[4] = (t >>> 8)  & 0xff
  b[5] = t & 0xff
  b.set(rand, 6)
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

const NANO_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
function nanoid(size = 21): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const b of bytes) id += NANO_ALPHABET[b & 63]
  return id
}
function randomStr(size = 16): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

const uuidResult = computed(() => {
  if (!mounted.value) return ''
  const n = Math.max(1, Math.min(1000, uuidCount.value || 1))
  const arr: string[] = []
  for (let i = 0; i < n; i++) {
    let s: string
    switch (uuidVersion.value) {
      case 'v4':     s = uuidV4(); break
      case 'v7':     s = uuidV7(i); break
      case 'nanoid': s = nanoid(); break
      default:       s = randomStr()
    }
    if (uuidNoHyphen.value) s = s.replace(/-/g, '')
    if (uuidUpper.value) s = s.toUpperCase()
    arr.push(s)
  }
  return arr.join('\n')
})

/* ================ 哈希 ================ */
const hashInput = ref('Hello, 世界')
const hashAlgo = ref<'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'>('SHA-256')
const hashResult = ref('')
const hashErr = ref('')

async function computeHash() {
  hashErr.value = ''
  try {
    const bytes = new TextEncoder().encode(hashInput.value)
    const buf = await crypto.subtle.digest(hashAlgo.value, bytes)
    hashResult.value = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (e: any) {
    hashErr.value = e?.message || String(e)
  }
}

// 简单 MD5（因为 SubtleCrypto 不带 MD5）—— 标准实现
function md5(str: string): string {
  function toBytes(s: string): number[] {
    const bytes: number[] = []
    for (const c of new TextEncoder().encode(s)) bytes.push(c)
    return bytes
  }
  function rotl(x: number, n: number) { return (x << n) | (x >>> (32 - n)) }
  function add32(a: number, b: number) { return (a + b) & 0xffffffff }

  const msg = toBytes(str)
  const origLen = msg.length * 8
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  for (let i = 0; i < 8; i++) msg.push((origLen >>> (i * 8)) & 0xff)

  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  const K = [
    0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
    0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
    0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
    0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
    0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
    0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
    0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
    0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
  ]
  const S = [7,12,17,22, 5,9,14,20, 4,11,16,23, 6,10,15,21]

  for (let i = 0; i < msg.length; i += 64) {
    const M: number[] = []
    for (let j = 0; j < 16; j++) {
      M[j] = msg[i + j * 4] | (msg[i + j * 4 + 1] << 8) | (msg[i + j * 4 + 2] << 16) | (msg[i + j * 4 + 3] << 24)
    }
    let [A, B, C, D] = [a, b, c, d]
    for (let n = 0; n < 64; n++) {
      let f: number, g: number
      if (n < 16)      { f = (B & C) | (~B & D);          g = n }
      else if (n < 32) { f = (D & B) | (~D & C);          g = (5 * n + 1) % 16 }
      else if (n < 48) { f = B ^ C ^ D;                    g = (3 * n + 5) % 16 }
      else             { f = C ^ (B | ~D);                 g = (7 * n) % 16 }
      const tmp = D
      D = C; C = B
      B = add32(B, rotl(add32(add32(A, f), add32(K[n], M[g])), S[(Math.floor(n / 16)) * 4 + n % 4]))
      A = tmp
    }
    a = add32(a, A); b = add32(b, B); c = add32(c, C); d = add32(d, D)
  }
  return [a, b, c, d].map(v =>
    [(v & 0xff), (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
      .map(x => x.toString(16).padStart(2, '0')).join('')
  ).join('')
}

const md5Result = computed(() => {
  try { return md5(hashInput.value) } catch (e: any) { return `错误：${e.message}` }
})

/* ================ JWT ================ */
const jwtInput = ref('')
const jwtParsed = computed(() => {
  const t = jwtInput.value.trim()
  if (!t) return null
  const parts = t.split('.')
  if (parts.length < 2 || parts.length > 3) {
    return { ok: false, err: 'JWT 需要 2~3 段（header.payload[.signature]）' }
  }
  try {
    const decodeSeg = (s: string) => {
      let x = s.replace(/-/g, '+').replace(/_/g, '/')
      while (x.length % 4) x += '='
      const bin = atob(x)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    }
    const header = JSON.parse(decodeSeg(parts[0]))
    const payload = JSON.parse(decodeSeg(parts[1]))
    const now = Math.floor(Date.now() / 1000)
    const expired = payload.exp && payload.exp < now
    const notYet = payload.nbf && payload.nbf > now
    return {
      ok: true,
      header,
      payload,
      signature: parts[2] || '',
      status: expired ? 'expired' : notYet ? 'notyet' : 'valid',
      expText: payload.exp ? new Date(payload.exp * 1000).toLocaleString('zh-CN') : '',
      iatText: payload.iat ? new Date(payload.iat * 1000).toLocaleString('zh-CN') : '',
      nbfText: payload.nbf ? new Date(payload.nbf * 1000).toLocaleString('zh-CN') : ''
    }
  } catch (e: any) {
    return { ok: false, err: `解析失败：${e.message}` }
  }
})

async function copy(t: string) { try { await navigator.clipboard.writeText(t) } catch {} }
</script>

<template>
  <div class="uh-tool">
    <!-- ============ UUID ============ -->
    <section class="uh-block">
      <h3 class="uh-h">🆔 UUID / ID 生成</h3>
      <div class="uh-row">
        <div class="uh-field">
          <label class="uh-lb">类型</label>
          <select v-model="uuidVersion" class="uh-input">
            <option value="v4">UUID v4（随机）</option>
            <option value="v7">UUID v7（时间有序）</option>
            <option value="nanoid">NanoID（21 位短 ID）</option>
            <option value="random">Random Hex（32 位）</option>
          </select>
        </div>
        <div class="uh-field">
          <label class="uh-lb">数量</label>
          <input v-model.number="uuidCount" type="number" min="1" max="1000" class="uh-input" />
        </div>
        <label class="uh-check">
          <input type="checkbox" v-model="uuidUpper" /> 大写
        </label>
        <label class="uh-check">
          <input type="checkbox" v-model="uuidNoHyphen" /> 去连字符
        </label>
        <button class="uh-btn ghost" @click="copy(uuidResult)">复制全部</button>
      </div>
      <textarea readonly class="uh-input mono uh-textarea" :value="uuidResult" />
    </section>

    <!-- ============ 哈希 ============ -->
    <section class="uh-block">
      <h3 class="uh-h">🔐 哈希 (MD5 / SHA)</h3>
      <textarea v-model="hashInput" class="uh-input mono" rows="3" placeholder="输入文本" />
      <div class="uh-row">
        <div class="uh-field">
          <label class="uh-lb">SHA 算法</label>
          <select v-model="hashAlgo" @change="computeHash" class="uh-input">
            <option>SHA-1</option>
            <option>SHA-256</option>
            <option>SHA-384</option>
            <option>SHA-512</option>
          </select>
        </div>
        <button class="uh-btn" @click="computeHash">计算 {{ hashAlgo }}</button>
      </div>

      <div v-if="hashResult" class="uh-out">
        <div class="uh-out-h">
          <span>{{ hashAlgo }}</span>
          <button class="uh-btn ghost tiny" @click="copy(hashResult)">复制</button>
        </div>
        <textarea readonly class="uh-input mono" rows="2" :value="hashResult" />
      </div>
      <div class="uh-out">
        <div class="uh-out-h">
          <span>MD5 <span class="uh-hint">（自动计算）</span></span>
          <button class="uh-btn ghost tiny" @click="copy(md5Result)">复制</button>
        </div>
        <textarea readonly class="uh-input mono" rows="2" :value="md5Result" />
      </div>
      <div v-if="hashErr" class="uh-error">❌ {{ hashErr }}</div>
    </section>

    <!-- ============ JWT ============ -->
    <section class="uh-block">
      <h3 class="uh-h">🎫 JWT 解析</h3>
      <textarea
        v-model="jwtInput" class="uh-input mono" rows="4"
        placeholder="粘 JWT (eyJhbGc...) 到这里"
      />
      <template v-if="jwtParsed">
        <div v-if="!jwtParsed.ok" class="uh-error">❌ {{ jwtParsed.err }}</div>
        <template v-else>
          <div class="uh-badge" :class="'st-' + jwtParsed.status">
            <template v-if="jwtParsed.status === 'valid'">✅ 有效</template>
            <template v-else-if="jwtParsed.status === 'expired'">⚠️ 已过期</template>
            <template v-else>⏳ 尚未生效 (nbf)</template>
          </div>
          <div class="uh-jwt-grid">
            <div class="uh-jwt-item">
              <div class="uh-jwt-h">Header</div>
              <pre class="uh-code">{{ JSON.stringify(jwtParsed.header, null, 2) }}</pre>
            </div>
            <div class="uh-jwt-item">
              <div class="uh-jwt-h">Payload</div>
              <pre class="uh-code">{{ JSON.stringify(jwtParsed.payload, null, 2) }}</pre>
              <div class="uh-jwt-meta">
                <div v-if="jwtParsed.iatText">签发 (iat)：{{ jwtParsed.iatText }}</div>
                <div v-if="jwtParsed.nbfText">生效 (nbf)：{{ jwtParsed.nbfText }}</div>
                <div v-if="jwtParsed.expText">过期 (exp)：{{ jwtParsed.expText }}</div>
              </div>
            </div>
          </div>
          <div class="uh-jwt-sig" v-if="jwtParsed.signature">
            Signature（本地不校验，只显示）：<code>{{ jwtParsed.signature.slice(0, 40) }}…</code>
          </div>
        </template>
      </template>
    </section>
  </div>
</template>

<style scoped>
.uh-tool { display: flex; flex-direction: column; gap: 24px; }
.uh-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
  display: flex; flex-direction: column; gap: 12px;
}
.dark .uh-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.uh-h { margin: 0; font-size: 16px; font-weight: 600; }
.uh-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.uh-field { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.uh-lb { font-size: 12px; color: var(--vp-c-text-2); }
.uh-hint { font-size: 12px; color: var(--vp-c-text-3); font-weight: normal; }
.uh-check {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--vp-c-text-2); cursor: pointer;
}

.uh-input {
  padding: 8px 12px; font-size: 14px;
  border: 1px solid #dbe8de; border-radius: 8px;
  background: #f4f9f5; color: var(--vp-c-text-1);
  outline: none; resize: vertical; width: 100%;
}
.uh-input.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 13px; }
.uh-input:focus { border-color: var(--vp-c-brand-2); background: #ffffff; }
.dark .uh-input { background: #1a201c; border-color: #2a352d; }
.dark .uh-input:focus { background: #1e2620; }
.uh-textarea { min-height: 200px; }

.uh-btn {
  padding: 7px 14px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
  white-space: nowrap;
}
.uh-btn:hover { background: var(--vp-c-brand-2); }
.uh-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.uh-btn.ghost:hover { background: var(--vp-c-brand-soft); }
.uh-btn.tiny { padding: 3px 10px; font-size: 12px; }
.dark .uh-btn.ghost { color: #a8cdb6; }

.uh-out { display: flex; flex-direction: column; gap: 6px; }
.uh-out-h {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--vp-c-text-2);
}

.uh-error {
  padding: 10px 14px;
  background: rgba(200, 90, 90, 0.08);
  color: #b04b4b; border-radius: 8px; font-size: 13px;
}

/* JWT */
.uh-badge {
  display: inline-flex; align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  align-self: flex-start;
}
.uh-badge.st-valid   { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-dark); }
.uh-badge.st-expired { background: rgba(200, 90, 90, 0.12); color: #b04b4b; }
.uh-badge.st-notyet  { background: rgba(200, 150, 60, 0.15); color: #b47a1a; }
.dark .uh-badge.st-valid { color: #a8cdb6; }

.uh-jwt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.uh-jwt-item {
  border: 1px solid #dbe8de; border-radius: 8px; overflow: hidden;
  background: #f4f9f5;
}
.dark .uh-jwt-item { background: #1a201c; border-color: #2a352d; }
.uh-jwt-h {
  padding: 8px 12px;
  font-size: 12px; font-weight: 500;
  background: var(--vp-c-brand-soft); color: var(--vp-c-brand-dark);
  border-bottom: 1px solid #dbe8de;
}
.dark .uh-jwt-h { color: #a8cdb6; border-bottom-color: #2a352d; }
.uh-code {
  margin: 0; padding: 12px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px; line-height: 1.6;
  color: var(--vp-c-text-1);
  white-space: pre-wrap; word-break: break-all;
  max-height: 240px; overflow: auto;
}
.uh-jwt-meta { padding: 8px 12px; font-size: 12px; color: var(--vp-c-text-2); border-top: 1px solid #eaf2ec; }
.dark .uh-jwt-meta { border-top-color: #2a352d; }
.uh-jwt-sig { font-size: 12px; color: var(--vp-c-text-2); word-break: break-all; }

@media (max-width: 700px) {
  .uh-jwt-grid { grid-template-columns: 1fr; }
}
</style>
