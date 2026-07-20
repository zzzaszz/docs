<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

/* =========== 生成二维码 =========== */
const text = ref('https://github.com/zzzaszz/docs')
const size = ref(280)
const margin = ref(2)
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const fg = ref('#1a201c')
const bg = ref('#ffffff')

const genCanvas = ref<HTMLCanvasElement | null>(null)
const genErr = ref('')

async function renderQr() {
  genErr.value = ''
  if (!genCanvas.value || !text.value.trim()) return
  try {
    await QRCode.toCanvas(genCanvas.value, text.value, {
      width: size.value,
      margin: margin.value,
      errorCorrectionLevel: level.value,
      color: { dark: fg.value, light: bg.value }
    })
  } catch (e: any) {
    genErr.value = e?.message || String(e)
  }
}

onMounted(() => { renderQr() })
watch([text, size, margin, level, fg, bg], () => { renderQr() })

function downloadPng() {
  if (!genCanvas.value) return
  const a = document.createElement('a')
  a.href = genCanvas.value.toDataURL('image/png')
  a.download = 'qrcode.png'
  a.click()
}
async function downloadSvg() {
  try {
    const svg = await QRCode.toString(text.value, {
      type: 'svg',
      margin: margin.value,
      errorCorrectionLevel: level.value,
      color: { dark: fg.value, light: bg.value }
    })
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'qrcode.svg'
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e: any) {
    genErr.value = e?.message || String(e)
  }
}
async function copyImage() {
  if (!genCanvas.value) return
  try {
    genCanvas.value.toBlob(async blob => {
      if (!blob) return
      // @ts-ignore
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
  } catch {}
}

/* =========== 识别二维码 =========== */
const decodeResult = ref('')
const decodeErr = ref('')
const decodedImage = ref('')
const decodeInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

async function decodeFile(file: File) {
  decodeErr.value = ''
  decodeResult.value = ''
  decodedImage.value = ''
  if (!file.type.startsWith('image/')) {
    decodeErr.value = `不是图片：${file.type || '未知类型'}`
    return
  }
  const url = URL.createObjectURL(file)
  decodedImage.value = url
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    if (!ctx) { decodeErr.value = 'canvas 不可用'; return }
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height)
    const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })
    if (code) {
      decodeResult.value = code.data
    } else {
      decodeErr.value = '未识别到二维码 —— 试试更清晰、更大的图'
    }
  }
  img.onerror = () => { decodeErr.value = '图片加载失败' }
  img.src = url
}

function onDecodeSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) decodeFile(f)
}
function onDecodeDrop(e: DragEvent) {
  e.preventDefault(); dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) decodeFile(f)
}
function onDecodeDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDecodeDragLeave() { dragOver.value = false }
function onDecodePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) { decodeFile(f); e.preventDefault(); return }
    }
  }
}
async function copy(txt: string) { try { await navigator.clipboard.writeText(txt) } catch {} }

const isUrl = computed(() => /^(https?:\/\/|ftp:\/\/)/i.test(decodeResult.value.trim()))
</script>

<template>
  <div class="qr-tool">
    <!-- ============ 生成 ============ -->
    <section class="qr-block">
      <h3 class="qr-h">🔳 生成二维码</h3>
      <div class="qr-gen">
        <div class="qr-form">
          <div class="qr-row">
            <label class="qr-lb">内容</label>
            <textarea v-model="text" class="qr-input" rows="3" placeholder="粘 URL / 文本 / 名片等" />
          </div>
          <div class="qr-row inline">
            <div class="qr-field">
              <label class="qr-lb">尺寸</label>
              <input v-model.number="size" type="number" min="80" max="1024" step="20" class="qr-input tight" />
            </div>
            <div class="qr-field">
              <label class="qr-lb">边距</label>
              <input v-model.number="margin" type="number" min="0" max="10" class="qr-input tight" />
            </div>
            <div class="qr-field">
              <label class="qr-lb">容错</label>
              <select v-model="level" class="qr-input tight">
                <option value="L">L (~7%)</option>
                <option value="M">M (~15%)</option>
                <option value="Q">Q (~25%)</option>
                <option value="H">H (~30%)</option>
              </select>
            </div>
          </div>
          <div class="qr-row inline">
            <div class="qr-field">
              <label class="qr-lb">前景</label>
              <input v-model="fg" type="color" class="qr-color" />
            </div>
            <div class="qr-field">
              <label class="qr-lb">背景</label>
              <input v-model="bg" type="color" class="qr-color" />
            </div>
          </div>
          <div class="qr-actions">
            <button class="qr-btn" @click="downloadPng">下载 PNG</button>
            <button class="qr-btn ghost" @click="downloadSvg">下载 SVG</button>
            <button class="qr-btn ghost" @click="copyImage">复制图片</button>
          </div>
          <div v-if="genErr" class="qr-error">❌ {{ genErr }}</div>
        </div>
        <div class="qr-preview">
          <canvas ref="genCanvas" />
        </div>
      </div>
    </section>

    <!-- ============ 识别 ============ -->
    <section class="qr-block">
      <h3 class="qr-h">🔍 识别二维码</h3>
      <div
        class="qr-drop"
        :class="{ over: dragOver }"
        tabindex="0"
        @click="decodeInput?.click()"
        @dragover="onDecodeDragOver"
        @dragleave="onDecodeDragLeave"
        @drop="onDecodeDrop"
        @paste="onDecodePaste"
      >
        <div class="qr-drop-icon">📥</div>
        <div class="qr-drop-title">点击 / 拖拽 / <kbd>Ctrl</kbd>+<kbd>V</kbd> 粘贴二维码图片</div>
        <input
          ref="decodeInput" type="file" accept="image/*"
          class="qr-file" @change="onDecodeSelect" @click.stop
        />
      </div>

      <div v-if="decodeErr" class="qr-error">❌ {{ decodeErr }}</div>

      <div v-if="decodeResult || decodedImage" class="qr-decoded">
        <img v-if="decodedImage" :src="decodedImage" class="qr-decoded-img" alt="uploaded" />
        <div v-if="decodeResult" class="qr-decoded-text">
          <div class="qr-decoded-h">
            <span>识别结果</span>
            <div class="qr-decoded-actions">
              <a v-if="isUrl" :href="decodeResult" target="_blank" rel="noopener" class="qr-btn ghost tiny">打开</a>
              <button class="qr-btn ghost tiny" @click="copy(decodeResult)">复制</button>
            </div>
          </div>
          <textarea readonly class="qr-input mono" rows="3" :value="decodeResult" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.qr-tool { display: flex; flex-direction: column; gap: 24px; }
.qr-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
}
.dark .qr-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.qr-h { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; }

.qr-gen { display: grid; grid-template-columns: 1fr 320px; gap: 20px; align-items: start; }
.qr-form { display: flex; flex-direction: column; gap: 12px; }
.qr-row { display: flex; flex-direction: column; gap: 6px; }
.qr-row.inline { flex-direction: row; gap: 12px; }
.qr-field { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.qr-lb { font-size: 12px; color: var(--vp-c-text-2); }

.qr-input {
  padding: 8px 12px; font-size: 14px;
  border: 1px solid #dbe8de; border-radius: 8px;
  background: #f4f9f5; color: var(--vp-c-text-1);
  outline: none; resize: vertical;
}
.qr-input.tight { width: 100%; }
.qr-input.mono { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 13px; }
.qr-input:focus { border-color: var(--vp-c-brand-2); background: #ffffff; }
.dark .qr-input { background: #1a201c; border-color: #2a352d; }
.dark .qr-input:focus { background: #1e2620; }

.qr-color {
  width: 100%; height: 36px;
  padding: 2px; border: 1px solid #dbe8de; border-radius: 8px;
  background: #f4f9f5; cursor: pointer;
}
.dark .qr-color { background: #1a201c; border-color: #2a352d; }

.qr-btn {
  padding: 7px 14px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
  text-decoration: none !important;
  display: inline-flex; align-items: center;
}
.qr-btn:hover { background: var(--vp-c-brand-2); }
.qr-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.qr-btn.ghost:hover { background: var(--vp-c-brand-soft); }
.qr-btn.tiny { padding: 3px 10px; font-size: 12px; }
.dark .qr-btn.ghost { color: #a8cdb6; }
.qr-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.qr-preview {
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  background: #f4f9f5;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  min-height: 300px;
}
.dark .qr-preview { background: #1a201c; border-color: #2a352d; }
.qr-preview canvas { max-width: 100%; height: auto; border-radius: 6px; background: #fff; }

.qr-drop {
  min-height: 140px;
  padding: 20px;
  border: 2px dashed #c5dbcc;
  border-radius: 12px;
  background: #f4f9f5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; outline: none;
  transition: all 0.15s ease;
}
.qr-drop:hover, .qr-drop:focus { border-color: var(--vp-c-brand-2); background: #eef5f0; }
.qr-drop.over { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.dark .qr-drop { background: #1a201c; border-color: #2a352d; }
.qr-drop-icon { font-size: 30px; }
.qr-drop-title { font-size: 14px; color: var(--vp-c-text-1); }
.qr-file { display: none; }

.qr-decoded { margin-top: 14px; display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: start; }
.qr-decoded-img {
  max-width: 100%; max-height: 200px; border-radius: 8px;
  border: 1px solid #dbe8de; padding: 8px; background: #fff;
  object-fit: contain;
}
.dark .qr-decoded-img { border-color: #2a352d; }
.qr-decoded-text { display: flex; flex-direction: column; gap: 6px; }
.qr-decoded-h { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--vp-c-text-2); }
.qr-decoded-actions { display: flex; gap: 6px; }

.qr-error {
  padding: 10px 14px;
  background: rgba(200, 90, 90, 0.08);
  color: #b04b4b; border-radius: 8px;
  font-size: 13px; margin-top: 10px;
}

@media (max-width: 900px) {
  .qr-gen { grid-template-columns: 1fr; }
  .qr-preview { min-height: 240px; }
  .qr-decoded { grid-template-columns: 1fr; }
}
</style>
