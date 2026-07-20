<script setup lang="ts">
import { ref, computed } from 'vue'

/* ============ URL 编解码 ============ */
const urlInput = ref('https://example.com/搜索?q=你好 世界&lang=zh-CN')

/** encodeURI —— 保留 URL 结构；encodeURIComponent —— 全转 */
const urlEncoded = computed(() => {
  try { return encodeURI(urlInput.value) } catch (e: any) { return `错误：${e.message}` }
})
const urlEncodedFull = computed(() => {
  try { return encodeURIComponent(urlInput.value) } catch (e: any) { return `错误：${e.message}` }
})
const urlDecoded = computed(() => {
  try { return decodeURIComponent(urlInput.value.replace(/\+/g, ' ')) } catch (e: any) { return `错误：${e.message}` }
})

/* ============ Base64 文本 ============ */
const b64Input = ref('Hello, 世界！\n这是一段中文测试文本。')
const b64Mode = ref<'std' | 'url'>('std')

function utf8ToB64(s: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b = btoa(bin)
  return urlSafe ? b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b
}
function b64ToUtf8(s: string): string {
  let x = s.trim().replace(/-/g, '+').replace(/_/g, '/')
  while (x.length % 4) x += '='
  const bin = atob(x)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

const b64Encoded = computed(() => {
  try { return utf8ToB64(b64Input.value, b64Mode.value === 'url') }
  catch (e: any) { return `错误：${e.message}` }
})
const b64Decoded = computed(() => {
  try { return b64ToUtf8(b64Input.value) }
  catch (e: any) { return `错误：${e.message}` }
})

async function copy(t: string) { try { await navigator.clipboard.writeText(t) } catch {} }
function swapInput(target: 'url' | 'b64', v: string) {
  if (target === 'url') urlInput.value = v
  else b64Input.value = v
}
</script>

<template>
  <div class="ub-tool">
    <!-- ============ URL ============ -->
    <section class="ub-block">
      <h3 class="ub-h">🔗 URL 编解码</h3>
      <textarea v-model="urlInput" class="ub-input mono" rows="3" placeholder="输入 URL 或已编码字符串" />

      <div class="ub-out">
        <div class="ub-out-h">
          <span>encodeURI <span class="ub-hint">保留 URL 结构（`/ : ? = &`）</span></span>
          <div class="ub-out-actions">
            <button class="ub-btn ghost tiny" @click="copy(urlEncoded)">复制</button>
            <button class="ub-btn ghost tiny" @click="swapInput('url', urlEncoded)">↑ 用作输入</button>
          </div>
        </div>
        <textarea readonly class="ub-input mono" rows="2" :value="urlEncoded" />
      </div>

      <div class="ub-out">
        <div class="ub-out-h">
          <span>encodeURIComponent <span class="ub-hint">全部转义（用于 query 参数）</span></span>
          <div class="ub-out-actions">
            <button class="ub-btn ghost tiny" @click="copy(urlEncodedFull)">复制</button>
            <button class="ub-btn ghost tiny" @click="swapInput('url', urlEncodedFull)">↑ 用作输入</button>
          </div>
        </div>
        <textarea readonly class="ub-input mono" rows="2" :value="urlEncodedFull" />
      </div>

      <div class="ub-out">
        <div class="ub-out-h">
          <span>decodeURIComponent <span class="ub-hint">`+` 也当作空格处理</span></span>
          <div class="ub-out-actions">
            <button class="ub-btn ghost tiny" @click="copy(urlDecoded)">复制</button>
            <button class="ub-btn ghost tiny" @click="swapInput('url', urlDecoded)">↑ 用作输入</button>
          </div>
        </div>
        <textarea readonly class="ub-input mono" rows="2" :value="urlDecoded" />
      </div>
    </section>

    <!-- ============ Base64 ============ -->
    <section class="ub-block">
      <h3 class="ub-h">🔤 Base64 文本</h3>
      <div class="ub-toolbar">
        <label class="ub-lb">变体</label>
        <select v-model="b64Mode" class="ub-select">
          <option value="std">标准 Base64</option>
          <option value="url">URL-Safe (Base64URL)</option>
        </select>
        <span class="ub-hint">UTF-8 安全，中文没问题</span>
      </div>
      <textarea v-model="b64Input" class="ub-input mono" rows="4" placeholder="输入文本 或 Base64" />

      <div class="ub-out">
        <div class="ub-out-h">
          <span>编码 (文本 → Base64)</span>
          <div class="ub-out-actions">
            <button class="ub-btn ghost tiny" @click="copy(b64Encoded)">复制</button>
            <button class="ub-btn ghost tiny" @click="swapInput('b64', b64Encoded)">↑ 用作输入</button>
          </div>
        </div>
        <textarea readonly class="ub-input mono" rows="3" :value="b64Encoded" />
      </div>

      <div class="ub-out">
        <div class="ub-out-h">
          <span>解码 (Base64 → 文本)</span>
          <div class="ub-out-actions">
            <button class="ub-btn ghost tiny" @click="copy(b64Decoded)">复制</button>
            <button class="ub-btn ghost tiny" @click="swapInput('b64', b64Decoded)">↑ 用作输入</button>
          </div>
        </div>
        <textarea readonly class="ub-input mono" rows="3" :value="b64Decoded" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.ub-tool { display: flex; flex-direction: column; gap: 24px; }
.ub-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
  display: flex; flex-direction: column; gap: 14px;
}
.dark .ub-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.ub-h { margin: 0; font-size: 16px; font-weight: 600; }
.ub-toolbar { display: flex; align-items: center; gap: 10px; }
.ub-lb { font-size: 13px; color: var(--vp-c-text-2); }
.ub-hint { font-size: 12px; color: var(--vp-c-text-3); font-weight: normal; }

.ub-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dbe8de; border-radius: 8px;
  background: #f4f9f5; color: var(--vp-c-text-1);
  font-size: 13px; line-height: 1.6;
  resize: vertical; outline: none;
}
.ub-input.mono { font-family: 'JetBrains Mono', Consolas, monospace; }
.ub-input:focus { border-color: var(--vp-c-brand-2); background: #ffffff; }
.dark .ub-input { background: #1a201c; border-color: #2a352d; }
.dark .ub-input:focus { background: #1e2620; }

.ub-select {
  padding: 6px 10px; font-size: 13px;
  border: 1px solid #dbe8de; border-radius: 6px;
  background: #f4f9f5; color: var(--vp-c-text-1);
}
.dark .ub-select { background: #1a201c; border-color: #2a352d; }

.ub-out { display: flex; flex-direction: column; gap: 6px; }
.ub-out-h {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--vp-c-text-2);
}
.ub-out-actions { display: flex; gap: 6px; }

.ub-btn {
  padding: 7px 14px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
}
.ub-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.ub-btn.ghost:hover { background: var(--vp-c-brand-soft); }
.ub-btn.tiny { padding: 3px 10px; font-size: 12px; }
.dark .ub-btn.ghost { color: #a8cdb6; }
</style>
