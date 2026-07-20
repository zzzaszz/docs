<script setup lang="ts">
import { ref, computed } from 'vue'

/* ---------------- 通用 ---------------- */
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
async function copy(txt: string) { try { await navigator.clipboard.writeText(txt) } catch {} }

/* ============== 图 → Base64 ============== */
interface Encoded {
  name: string
  type: string
  size: number
  dataUrl: string
  base64: string
}
const encoded = ref<Encoded | null>(null)
const encodeErr = ref('')
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function readFile(file: File) {
  encodeErr.value = ''
  if (!file.type.startsWith('image/')) {
    encodeErr.value = `不是图片：${file.type || '未知类型'}`
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result || '')
    const comma = dataUrl.indexOf(',')
    encoded.value = {
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
      base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
    }
  }
  reader.onerror = () => { encodeErr.value = '读取失败' }
  reader.readAsDataURL(file)
}

function onSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) readFile(f)
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) readFile(f)
}
function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) { readFile(f); e.preventDefault(); return }
    }
  }
}
function clearEncoded() {
  encoded.value = null
  encodeErr.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const encodedStats = computed(() => {
  if (!encoded.value) return null
  const b64Len = encoded.value.base64.length
  const rate = encoded.value.size ? ((b64Len / encoded.value.size - 1) * 100).toFixed(1) : '0'
  return {
    origin: fmtSize(encoded.value.size),
    base64: fmtSize(b64Len),
    rate: `${rate}%`
  }
})

const cssSnippet = computed(() =>
  encoded.value ? `background-image: url("${encoded.value.dataUrl}");` : ''
)
const imgSnippet = computed(() =>
  encoded.value ? `<img src="${encoded.value.dataUrl}" alt="${encoded.value.name}" />` : ''
)

/* ============== Base64 → 图 ============== */
const decodeInput = ref('')
const decodeErr = ref('')

/** 把粘进来的东西正规化成 dataURL；识别不了就报错 */
const decoded = computed<{ dataUrl: string; type: string; size: number } | null>(() => {
  decodeErr.value = ''
  const raw = decodeInput.value.trim()
    .replace(/^["'`]|["'`]$/g, '')          // 去掉包裹的引号
    .replace(/\s+/g, '')                    // 去掉换行/空格
  if (!raw) return null

  let dataUrl = raw
  if (!dataUrl.startsWith('data:')) {
    // 纯 base64 —— 猜一下类型
    const type = sniffImageType(dataUrl) || 'image/png'
    dataUrl = `data:${type};base64,${dataUrl}`
  }

  const m = /^data:([^;,]+)?(;base64)?,(.+)$/i.exec(dataUrl)
  if (!m) { decodeErr.value = '不是有效的 dataURL 或 base64'; return null }
  const type = m[1] || 'image/png'
  const isB64 = !!m[2]
  const body = m[3]

  let size = 0
  try {
    if (isB64) {
      // base64 长度 → 字节数
      const pad = (body.match(/=+$/)?.[0]?.length) || 0
      size = Math.floor(body.length * 3 / 4) - pad
      // 校验一下是否真的能 decode（防止乱粘）
      atob(body.slice(0, 100))
    } else {
      size = decodeURIComponent(body).length
    }
  } catch {
    decodeErr.value = 'base64 解码失败'
    return null
  }

  if (!type.startsWith('image/')) {
    decodeErr.value = `不是图片 MIME：${type}`
    return null
  }

  return { dataUrl, type, size }
})

/** 用 base64 前几字节猜一下图片类型 */
function sniffImageType(b64: string): string | null {
  try {
    const head = atob(b64.slice(0, 24))
    const bytes = [...head].map(c => c.charCodeAt(0))
    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    // GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
    // WebP: "RIFF....WEBP"
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp'
    // BMP
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
    // SVG（文本开头）
    if (head.trim().startsWith('<svg') || head.trim().startsWith('<?xml')) return 'image/svg+xml'
  } catch {}
  return null
}

async function pasteDecode() {
  try {
    const t = await navigator.clipboard.readText()
    if (t) decodeInput.value = t
  } catch {}
}
function clearDecode() { decodeInput.value = '' }

function downloadDecoded() {
  if (!decoded.value) return
  const a = document.createElement('a')
  a.href = decoded.value.dataUrl
  const ext = decoded.value.type.split('/')[1]?.split('+')[0] || 'png'
  a.download = `image.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
}
</script>

<template>
  <div class="ib-tool">
    <!-- ================= 图片 → Base64 ================= -->
    <section class="ib-block">
      <h3 class="ib-h">🖼️ 图片 → Base64</h3>

      <div
        class="ib-dropzone"
        :class="{ over: dragOver, has: !!encoded }"
        tabindex="0"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @paste="onPaste"
        @click="fileInput?.click()"
      >
        <template v-if="!encoded">
          <div class="ib-drop-icon">📤</div>
          <div class="ib-drop-title">点击、拖拽 或 Ctrl+V 粘贴图片</div>
          <div class="ib-drop-hint">支持 PNG / JPG / GIF / WebP / SVG / BMP</div>
        </template>
        <template v-else>
          <img :src="encoded.dataUrl" class="ib-preview" :alt="encoded.name" />
          <div class="ib-preview-info">
            <div><b>{{ encoded.name }}</b> · {{ encoded.type }}</div>
            <div v-if="encodedStats">
              原图 {{ encodedStats.origin }} → Base64 {{ encodedStats.base64 }}
              <span class="ib-mute">（{{ encodedStats.rate }}）</span>
            </div>
          </div>
        </template>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="ib-file"
          @change="onSelect"
          @click.stop
        />
      </div>

      <div v-if="encodeErr" class="ib-error">❌ {{ encodeErr }}</div>

      <div v-if="encoded" class="ib-outputs">
        <div class="ib-out">
          <div class="ib-out-h">
            <span>Data URL</span>
            <div class="ib-out-actions">
              <button class="ib-btn ghost tiny" @click="copy(encoded.dataUrl)">复制</button>
            </div>
          </div>
          <textarea readonly class="ib-textarea mono" :value="encoded.dataUrl"></textarea>
        </div>

        <div class="ib-out-row">
          <div class="ib-out small">
            <div class="ib-out-h">
              <span>纯 Base64</span>
              <button class="ib-btn ghost tiny" @click="copy(encoded.base64)">复制</button>
            </div>
            <textarea readonly class="ib-textarea mono short" :value="encoded.base64"></textarea>
          </div>
          <div class="ib-out small">
            <div class="ib-out-h">
              <span>CSS background</span>
              <button class="ib-btn ghost tiny" @click="copy(cssSnippet)">复制</button>
            </div>
            <textarea readonly class="ib-textarea mono short" :value="cssSnippet"></textarea>
          </div>
          <div class="ib-out small">
            <div class="ib-out-h">
              <span>HTML &lt;img&gt;</span>
              <button class="ib-btn ghost tiny" @click="copy(imgSnippet)">复制</button>
            </div>
            <textarea readonly class="ib-textarea mono short" :value="imgSnippet"></textarea>
          </div>
        </div>

        <div class="ib-actions">
          <button class="ib-btn ghost" @click="clearEncoded">清空 / 重换一张</button>
        </div>
      </div>
    </section>

    <!-- ================= Base64 → 图片 ================= -->
    <section class="ib-block">
      <h3 class="ib-h">🧬 Base64 → 图片</h3>
      <div class="ib-decode">
        <textarea
          v-model="decodeInput"
          class="ib-textarea mono tall"
          placeholder="粘 dataURL（data:image/png;base64,...）或纯 base64 到这里……"
          spellcheck="false"
        ></textarea>
        <div class="ib-decode-side">
          <div class="ib-preview-box">
            <img
              v-if="decoded"
              :src="decoded.dataUrl"
              class="ib-preview big"
              alt="preview"
            />
            <div v-else class="ib-preview-empty">
              <span v-if="decodeErr">❌ {{ decodeErr }}</span>
              <span v-else>预览会显示在这里</span>
            </div>
          </div>
          <div v-if="decoded" class="ib-decoded-info">
            <div>类型：<b>{{ decoded.type }}</b></div>
            <div>大小：{{ fmtSize(decoded.size) }}</div>
          </div>
          <div class="ib-actions">
            <button class="ib-btn ghost" @click="pasteDecode">粘贴</button>
            <button class="ib-btn ghost" @click="clearDecode">清空</button>
            <button class="ib-btn" :disabled="!decoded" @click="downloadDecoded">下载</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ib-tool { display: flex; flex-direction: column; gap: 24px; }
.ib-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
}
.dark .ib-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.ib-h { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; }

.ib-dropzone {
  position: relative;
  min-height: 180px;
  padding: 24px;
  border: 2px dashed #c5dbcc;
  border-radius: 12px;
  background: #f4f9f5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}
.ib-dropzone:hover, .ib-dropzone:focus { border-color: var(--vp-c-brand-2); background: #eef5f0; }
.ib-dropzone.over { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.ib-dropzone.has { min-height: 160px; padding: 16px; flex-direction: row; align-items: center; gap: 20px; }
.dark .ib-dropzone { background: #1a201c; border-color: #2a352d; }
.dark .ib-dropzone:hover { background: #1e2620; }
.ib-drop-icon { font-size: 36px; }
.ib-drop-title { font-size: 15px; color: var(--vp-c-text-1); }
.ib-drop-hint { font-size: 12px; color: var(--vp-c-text-2); }
.ib-file { display: none; }

.ib-preview {
  max-width: 200px; max-height: 140px;
  border-radius: 8px;
  background: #fff url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="8" height="8" fill="%23eef5f0"/><rect x="8" y="8" width="8" height="8" fill="%23eef5f0"/></svg>');
  object-fit: contain;
}
.ib-preview.big { max-width: 100%; max-height: 260px; }
.ib-preview-info { font-size: 13px; color: var(--vp-c-text-1); line-height: 1.7; }
.ib-mute { color: var(--vp-c-text-2); font-size: 12px; }

.ib-outputs { margin-top: 16px; display: flex; flex-direction: column; gap: 14px; }
.ib-out { display: flex; flex-direction: column; }
.ib-out-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.ib-out.small .ib-textarea { min-height: 80px; }
.ib-out-h {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 2px;
  font-size: 12px; color: var(--vp-c-text-2);
}
.ib-out-actions { display: flex; gap: 6px; }

.ib-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dbe8de;
  border-radius: 8px;
  background: #f4f9f5;
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  min-height: 120px;
  outline: none;
}
.ib-textarea.mono { font-family: 'JetBrains Mono', Consolas, monospace; }
.ib-textarea.short { min-height: 80px; }
.ib-textarea.tall  { min-height: 260px; }
.ib-textarea:focus { border-color: var(--vp-c-brand-2); background: #ffffff; }
.dark .ib-textarea { background: #1a201c; border-color: #2a352d; }
.dark .ib-textarea:focus { background: #1e2620; }

.ib-btn {
  padding: 7px 14px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
}
.ib-btn:hover:not(:disabled) { background: var(--vp-c-brand-2); }
.ib-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ib-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.ib-btn.ghost:hover { background: var(--vp-c-brand-soft); }
.ib-btn.tiny { padding: 3px 10px; font-size: 12px; }
.dark .ib-btn.ghost { color: #a8cdb6; }

.ib-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.ib-error {
  margin-top: 10px;
  padding: 10px 14px;
  background: rgba(200, 90, 90, 0.08);
  color: #b04b4b;
  border-radius: 8px;
  font-size: 13px;
}

.ib-decode { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
.ib-decode-side { display: flex; flex-direction: column; gap: 10px; }
.ib-preview-box {
  min-height: 200px;
  padding: 12px;
  background: #f4f9f5;
  border: 1px solid #dbe8de;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.dark .ib-preview-box { background: #1a201c; border-color: #2a352d; }
.ib-preview-empty { color: var(--vp-c-text-3); font-size: 13px; }
.ib-decoded-info { font-size: 13px; color: var(--vp-c-text-1); line-height: 1.7; padding: 0 4px; }

@media (max-width: 900px) {
  .ib-out-row { grid-template-columns: 1fr; }
  .ib-decode  { grid-template-columns: 1fr; }
}
</style>
