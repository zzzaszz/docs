<script setup lang="ts">
import { ref, computed } from 'vue'

interface Loaded {
  file: File
  img: HTMLImageElement
  url: string
  size: number
}

const items = ref<Loaded[]>([])
const target = ref<'image/png' | 'image/jpeg' | 'image/webp' | 'image/bmp'>('image/webp')
const quality = ref(0.9)   // 0 ~ 1，仅对 jpeg / webp 有效
const scale = ref(1)       // 缩放比例
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
const showQuality = computed(() => target.value === 'image/jpeg' || target.value === 'image/webp')

function loadFiles(files: FileList | File[]) {
  const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
  arr.forEach(file => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      items.value.push({ file, img, url, size: file.size })
    }
    img.src = url
  })
}
function onSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files) loadFiles(files)
}
function onDrop(e: DragEvent) {
  e.preventDefault(); dragOver.value = false
  if (e.dataTransfer?.files) loadFiles(e.dataTransfer.files)
}
function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
function removeItem(i: number) {
  URL.revokeObjectURL(items.value[i].url)
  items.value.splice(i, 1)
}
function clearAll() {
  items.value.forEach(it => URL.revokeObjectURL(it.url))
  items.value = []
  if (fileInput.value) fileInput.value.value = ''
}

/** 把 img 按当前设置画到 canvas 并输出 Blob & dataURL */
async function convertOne(it: Loaded): Promise<{ blob: Blob; url: string; w: number; h: number } | null> {
  return new Promise(resolve => {
    const w = Math.max(1, Math.round(it.img.naturalWidth * scale.value))
    const h = Math.max(1, Math.round(it.img.naturalHeight * scale.value))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) { resolve(null); return }
    // JPG/BMP 不透明，先铺白底
    if (target.value === 'image/jpeg' || target.value === 'image/bmp') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(it.img, 0, 0, w, h)
    c.toBlob(blob => {
      if (!blob) { resolve(null); return }
      resolve({ blob, url: URL.createObjectURL(blob), w, h })
    }, target.value, quality.value)
  })
}

interface Result {
  name: string
  originName: string
  originSize: number
  size: number
  width: number
  height: number
  url: string
  blob: Blob
}
const results = ref<Result[]>([])
const converting = ref(false)

async function convertAll() {
  if (!items.value.length) return
  converting.value = true
  results.value.forEach(r => URL.revokeObjectURL(r.url))
  results.value = []
  const ext = target.value.split('/')[1]
  for (const it of items.value) {
    const r = await convertOne(it)
    if (!r) continue
    const baseName = it.file.name.replace(/\.[^.]+$/, '')
    results.value.push({
      name: `${baseName}.${ext === 'jpeg' ? 'jpg' : ext}`,
      originName: it.file.name,
      originSize: it.size,
      size: r.blob.size,
      width: r.w, height: r.h,
      url: r.url, blob: r.blob
    })
  }
  converting.value = false
}
function downloadOne(r: Result) {
  const a = document.createElement('a')
  a.href = r.url; a.download = r.name; a.click()
}
async function downloadAll() {
  for (const r of results.value) {
    downloadOne(r)
    // 浏览器多文件下载需要间隔
    await new Promise(res => setTimeout(res, 200))
  }
}
</script>

<template>
  <div class="ic-tool">
    <section class="ic-block">
      <h3 class="ic-h">🎨 图片格式转换</h3>

      <div
        class="ic-drop"
        :class="{ over: dragOver }"
        @click="fileInput?.click()"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <div class="ic-drop-icon">🖼️</div>
        <div class="ic-drop-title">点击 / 拖拽多张图片到这里（可批量）</div>
        <input ref="fileInput" type="file" accept="image/*" multiple class="ic-file" @change="onSelect" @click.stop />
      </div>

      <div class="ic-options">
        <div class="ic-field">
          <label class="ic-lb">输出格式</label>
          <select v-model="target" class="ic-input">
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WebP</option>
            <option value="image/bmp">BMP</option>
          </select>
        </div>
        <div class="ic-field" v-if="showQuality">
          <label class="ic-lb">质量 <b>{{ (quality * 100).toFixed(0) }}%</b></label>
          <input v-model.number="quality" type="range" min="0.1" max="1" step="0.05" class="ic-range" />
        </div>
        <div class="ic-field">
          <label class="ic-lb">缩放 <b>{{ (scale * 100).toFixed(0) }}%</b></label>
          <input v-model.number="scale" type="range" min="0.1" max="2" step="0.05" class="ic-range" />
        </div>
        <div class="ic-actions">
          <button class="ic-btn" :disabled="!items.length || converting" @click="convertAll">
            {{ converting ? '转换中…' : `转换 ${items.length} 张` }}
          </button>
          <button class="ic-btn ghost" v-if="items.length" @click="clearAll">清空</button>
        </div>
      </div>

      <!-- 待转列表 -->
      <div v-if="items.length" class="ic-list">
        <div class="ic-list-h">已选 {{ items.length }} 张</div>
        <div class="ic-thumbs">
          <div v-for="(it, i) in items" :key="it.url" class="ic-thumb">
            <img :src="it.url" alt="" />
            <div class="ic-thumb-meta">
              <div class="ic-thumb-name" :title="it.file.name">{{ it.file.name }}</div>
              <div class="ic-thumb-info">
                {{ it.img.naturalWidth }}×{{ it.img.naturalHeight }} · {{ fmtSize(it.size) }}
              </div>
            </div>
            <button class="ic-thumb-del" @click="removeItem(i)" title="移除">×</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 结果 -->
    <section v-if="results.length" class="ic-block">
      <div class="ic-result-h">
        <h3 class="ic-h" style="margin: 0;">✅ 转换结果</h3>
        <button class="ic-btn ghost" @click="downloadAll">全部下载</button>
      </div>
      <div class="ic-thumbs">
        <div v-for="r in results" :key="r.url" class="ic-thumb">
          <img :src="r.url" alt="" />
          <div class="ic-thumb-meta">
            <div class="ic-thumb-name" :title="r.name">{{ r.name }}</div>
            <div class="ic-thumb-info">
              {{ r.width }}×{{ r.height }} ·
              <span :class="r.size < r.originSize ? 'good' : 'bad'">{{ fmtSize(r.size) }}</span>
              <span class="ic-mute"> ← {{ fmtSize(r.originSize) }}</span>
            </div>
          </div>
          <button class="ic-thumb-dl" @click="downloadOne(r)" title="下载">⬇</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ic-tool { display: flex; flex-direction: column; gap: 24px; }
.ic-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
}
.dark .ic-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.ic-h { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; }

.ic-drop {
  min-height: 140px; padding: 20px;
  border: 2px dashed #c5dbcc; border-radius: 12px;
  background: #f4f9f5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; outline: none; transition: all 0.15s ease;
}
.ic-drop:hover { border-color: var(--vp-c-brand-2); background: #eef5f0; }
.ic-drop.over { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.dark .ic-drop { background: #1a201c; border-color: #2a352d; }
.ic-drop-icon { font-size: 30px; }
.ic-drop-title { font-size: 14px; color: var(--vp-c-text-1); }
.ic-file { display: none; }

.ic-options {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 14px;
  align-items: end;
}
.ic-field { display: flex; flex-direction: column; gap: 6px; }
.ic-lb { font-size: 12px; color: var(--vp-c-text-2); }
.ic-lb b { color: var(--vp-c-brand-dark); font-weight: 600; }
.dark .ic-lb b { color: #a8cdb6; }
.ic-input {
  padding: 8px 12px; font-size: 14px;
  border: 1px solid #dbe8de; border-radius: 8px;
  background: #f4f9f5; color: var(--vp-c-text-1); outline: none;
}
.dark .ic-input { background: #1a201c; border-color: #2a352d; }
.ic-range { width: 100%; accent-color: var(--vp-c-brand-1); }
.ic-actions { display: flex; gap: 8px; align-items: end; }

.ic-btn {
  padding: 8px 16px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
  white-space: nowrap;
}
.ic-btn:hover:not(:disabled) { background: var(--vp-c-brand-2); }
.ic-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ic-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.ic-btn.ghost:hover:not(:disabled) { background: var(--vp-c-brand-soft); }
.dark .ic-btn.ghost { color: #a8cdb6; }

.ic-list { margin-top: 16px; }
.ic-list-h { font-size: 12px; color: var(--vp-c-text-2); margin-bottom: 8px; }
.ic-result-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }

.ic-thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.ic-thumb {
  position: relative;
  background: #f4f9f5;
  border: 1px solid #dbe8de;
  border-radius: 10px;
  padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.dark .ic-thumb { background: #1a201c; border-color: #2a352d; }
.ic-thumb img {
  width: 100%; height: 100px;
  object-fit: contain;
  background: #fff;
  border-radius: 6px;
}
.ic-thumb-meta { font-size: 11px; color: var(--vp-c-text-2); line-height: 1.5; }
.ic-thumb-name {
  color: var(--vp-c-text-1); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ic-thumb-info .good { color: #4c8f5f; font-weight: 500; }
.ic-thumb-info .bad  { color: #b47a4c; font-weight: 500; }
.ic-mute { color: var(--vp-c-text-3); }

.ic-thumb-del, .ic-thumb-dl {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.45); color: #fff;
  cursor: pointer; font-size: 14px; line-height: 22px;
  display: flex; align-items: center; justify-content: center;
}
.ic-thumb-dl { background: var(--vp-c-brand-1); }
.ic-thumb-dl:hover { background: var(--vp-c-brand-2); }

@media (max-width: 700px) {
  .ic-options { grid-template-columns: 1fr 1fr; }
}
</style>
