<script setup lang="ts">
import { ref, computed } from 'vue'

/**
 * 图片压缩：
 * - 模式一「按质量」：直接给定 0.1 ~ 1.0 输出
 * - 模式二「按目标大小」：二分法在 [0.05, 1.0] 里找一个质量，使得输出 ≤ 目标 KB
 * - 可选缩放到最大边（例如最大 2000px），进一步压体积
 * - JPG / WebP 有质量控制；PNG 由浏览器决定
 */

interface Loaded {
  file: File
  img: HTMLImageElement
  url: string
  size: number
  width: number
  height: number
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
  quality: number   // 实际用到的质量
  format: string
}

const items = ref<Loaded[]>([])
const results = ref<Result[]>([])
const converting = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const format = ref<'auto' | 'image/jpeg' | 'image/webp' | 'image/png'>('auto')
const mode = ref<'quality' | 'target'>('quality')
const quality = ref(0.75)         // mode = quality 时用
const targetKb = ref(200)         // mode = target 时用
const maxSide = ref(0)            // 0 = 不限制，其它 = 最长边像素

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function loadFiles(files: FileList | File[]) {
  const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
  arr.forEach(file => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      items.value.push({
        file, img, url,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight
      })
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
  results.value.forEach(r => URL.revokeObjectURL(r.url))
  items.value = []
  results.value = []
  if (fileInput.value) fileInput.value.value = ''
}

/** 决定输出 MIME */
function pickMime(it: Loaded): 'image/jpeg' | 'image/webp' | 'image/png' {
  if (format.value !== 'auto') return format.value
  // auto：透明的 png 保持 png，其它按 jpeg
  if (it.file.type === 'image/png') return 'image/png'
  if (it.file.type === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

/** 把图画到 canvas 并按 q 输出 blob */
function renderBlob(it: Loaded, mime: string, q: number): Promise<Blob | null> {
  return new Promise(resolve => {
    let w = it.width, h = it.height
    if (maxSide.value > 0 && Math.max(w, h) > maxSide.value) {
      const ratio = maxSide.value / Math.max(w, h)
      w = Math.round(w * ratio)
      h = Math.round(h * ratio)
    }
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) { resolve(null); return }
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(it.img, 0, 0, w, h)
    c.toBlob(b => resolve(b), mime, q)
  })
}

/** 二分找到 ≤ 目标 KB 的最高质量；找不到就返回最小质量的输出 */
async function compressToTarget(it: Loaded, mime: string, targetBytes: number): Promise<{ blob: Blob; q: number } | null> {
  // 先试 0.92 —— 大部分照片这个就够小了
  let low = 0.05, high = 0.95
  let best: { blob: Blob; q: number } | null = null

  // 先 high 试一次
  const b0 = await renderBlob(it, mime, high)
  if (!b0) return null
  if (b0.size <= targetBytes) return { blob: b0, q: high }
  best = { blob: b0, q: high }

  // 再 low 试 —— 如果最低质量都还超，就返回 low 的结果
  const bLow = await renderBlob(it, mime, low)
  if (!bLow) return null
  if (bLow.size > targetBytes) return { blob: bLow, q: low }

  // 二分 8 轮足够收敛
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2
    const b = await renderBlob(it, mime, mid)
    if (!b) break
    if (b.size <= targetBytes) {
      // 满足 —— 记录并尝试更高质量
      best = { blob: b, q: mid }
      low = mid
    } else {
      high = mid
    }
  }
  return best
}

async function run() {
  if (!items.value.length) return
  converting.value = true
  results.value.forEach(r => URL.revokeObjectURL(r.url))
  results.value = []

  for (const it of items.value) {
    const mime = pickMime(it)
    let out: { blob: Blob; q: number } | null = null

    if (mime === 'image/png' || mode.value === 'quality') {
      const q = quality.value
      const blob = await renderBlob(it, mime, q)
      if (blob) out = { blob, q }
    } else {
      out = await compressToTarget(it, mime, targetKb.value * 1024)
    }

    if (!out) continue
    const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]
    const baseName = it.file.name.replace(/\.[^.]+$/, '')
    const url = URL.createObjectURL(out.blob)
    // 重新拿一下宽高（可能被 maxSide 缩过）
    const w = maxSide.value > 0 && Math.max(it.width, it.height) > maxSide.value
      ? Math.round(it.width * (maxSide.value / Math.max(it.width, it.height)))
      : it.width
    const h = maxSide.value > 0 && Math.max(it.width, it.height) > maxSide.value
      ? Math.round(it.height * (maxSide.value / Math.max(it.width, it.height)))
      : it.height
    results.value.push({
      name: `${baseName}-min.${ext}`,
      originName: it.file.name,
      originSize: it.size,
      size: out.blob.size,
      width: w, height: h,
      url,
      blob: out.blob,
      quality: out.q,
      format: mime
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
    await new Promise(res => setTimeout(res, 200))
  }
}

const totalOrigin = computed(() => items.value.reduce((s, i) => s + i.size, 0))
const totalOut    = computed(() => results.value.reduce((s, r) => s + r.size, 0))
const savedPct = computed(() => {
  if (!totalOrigin.value || !totalOut.value) return 0
  return Math.round((1 - totalOut.value / totalOrigin.value) * 100)
})
</script>

<template>
  <div class="cp-tool">
    <section class="cp-block">
      <h3 class="cp-h">📦 图片容量压缩</h3>

      <div
        class="cp-drop"
        :class="{ over: dragOver }"
        @click="fileInput?.click()"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <div class="cp-drop-icon">📥</div>
        <div class="cp-drop-title">点击 / 拖拽图片到这里（可批量）</div>
        <input ref="fileInput" type="file" accept="image/*" multiple class="cp-file" @change="onSelect" @click.stop />
      </div>

      <div class="cp-options">
        <div class="cp-field">
          <label class="cp-lb">输出格式</label>
          <select v-model="format" class="cp-input">
            <option value="auto">自动（PNG 保留、其它转 JPG）</option>
            <option value="image/jpeg">JPG（压缩率高）</option>
            <option value="image/webp">WebP（体积最小）</option>
            <option value="image/png">PNG（无损，会更大）</option>
          </select>
        </div>

        <div class="cp-field">
          <label class="cp-lb">压缩策略</label>
          <div class="cp-tabs">
            <button
              class="cp-tab" :class="{ active: mode === 'quality' }"
              @click="mode = 'quality'"
            >按质量</button>
            <button
              class="cp-tab" :class="{ active: mode === 'target' }"
              @click="mode = 'target'"
            >按目标大小</button>
          </div>
        </div>

        <div class="cp-field" v-if="mode === 'quality'">
          <label class="cp-lb">质量 <b>{{ (quality * 100).toFixed(0) }}%</b></label>
          <input v-model.number="quality" type="range" min="0.1" max="1" step="0.05" class="cp-range" />
        </div>
        <div class="cp-field" v-else>
          <label class="cp-lb">目标大小 (KB)</label>
          <input v-model.number="targetKb" type="number" min="10" max="10240" step="10" class="cp-input" />
        </div>

        <div class="cp-field">
          <label class="cp-lb">
            最长边 (px)
            <span class="cp-hint">0 = 不缩放</span>
          </label>
          <input v-model.number="maxSide" type="number" min="0" max="8000" step="100" class="cp-input" />
        </div>

        <div class="cp-actions">
          <button class="cp-btn" :disabled="!items.length || converting" @click="run">
            {{ converting ? '压缩中…' : `压缩 ${items.length} 张` }}
          </button>
          <button class="cp-btn ghost" v-if="items.length || results.length" @click="clearAll">清空</button>
        </div>
      </div>

      <!-- 待压缩 -->
      <div v-if="items.length" class="cp-list">
        <div class="cp-list-h">
          已选 {{ items.length }} 张 · 合计 {{ fmtSize(totalOrigin) }}
        </div>
        <div class="cp-thumbs">
          <div v-for="(it, i) in items" :key="it.url" class="cp-thumb">
            <img :src="it.url" alt="" />
            <div class="cp-thumb-meta">
              <div class="cp-thumb-name" :title="it.file.name">{{ it.file.name }}</div>
              <div class="cp-thumb-info">
                {{ it.width }}×{{ it.height }} · {{ fmtSize(it.size) }}
              </div>
            </div>
            <button class="cp-thumb-del" @click="removeItem(i)" title="移除">×</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 结果 -->
    <section v-if="results.length" class="cp-block">
      <div class="cp-result-h">
        <div>
          <h3 class="cp-h" style="margin: 0;">✅ 压缩结果</h3>
          <div class="cp-total">
            共 {{ results.length }} 张 · {{ fmtSize(totalOrigin) }} → {{ fmtSize(totalOut) }}
            <span :class="savedPct >= 0 ? 'good' : 'bad'">
              （{{ savedPct >= 0 ? '省' : '多' }} {{ Math.abs(savedPct) }}%）
            </span>
          </div>
        </div>
        <button class="cp-btn ghost" @click="downloadAll">全部下载</button>
      </div>
      <div class="cp-thumbs">
        <div v-for="r in results" :key="r.url" class="cp-thumb">
          <img :src="r.url" alt="" />
          <div class="cp-thumb-meta">
            <div class="cp-thumb-name" :title="r.name">{{ r.name }}</div>
            <div class="cp-thumb-info">
              {{ r.width }}×{{ r.height }} ·
              <span :class="r.size < r.originSize ? 'good' : 'bad'">{{ fmtSize(r.size) }}</span>
              <span class="cp-mute"> ← {{ fmtSize(r.originSize) }}</span>
            </div>
            <div class="cp-thumb-info cp-mute">
              q = {{ (r.quality * 100).toFixed(0) }}% · {{ r.format.split('/')[1].toUpperCase() }}
            </div>
          </div>
          <button class="cp-thumb-dl" @click="downloadOne(r)" title="下载">⬇</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cp-tool { display: flex; flex-direction: column; gap: 24px; }
.cp-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
}
.dark .cp-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.cp-h { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; }

.cp-drop {
  min-height: 130px; padding: 20px;
  border: 2px dashed #c5dbcc; border-radius: 12px;
  background: #f4f9f5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; outline: none; transition: all 0.15s ease;
}
.cp-drop:hover { border-color: var(--vp-c-brand-2); background: #eef5f0; }
.cp-drop.over { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.dark .cp-drop { background: #1a201c; border-color: #2a352d; }
.cp-drop-icon { font-size: 28px; }
.cp-drop-title { font-size: 14px; color: var(--vp-c-text-1); }
.cp-file { display: none; }

.cp-options {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr auto;
  gap: 14px;
  align-items: end;
}
.cp-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cp-lb { font-size: 12px; color: var(--vp-c-text-2); display: flex; align-items: center; gap: 6px; }
.cp-lb b { color: var(--vp-c-brand-dark); font-weight: 600; }
.dark .cp-lb b { color: #a8cdb6; }
.cp-hint { font-size: 11px; color: var(--vp-c-text-3); font-weight: normal; }

.cp-input {
  padding: 8px 12px; font-size: 14px;
  border: 1px solid #dbe8de; border-radius: 8px;
  background: #f4f9f5; color: var(--vp-c-text-1); outline: none;
}
.dark .cp-input { background: #1a201c; border-color: #2a352d; }
.cp-range { width: 100%; accent-color: var(--vp-c-brand-1); }

.cp-tabs { display: flex; gap: 4px; background: #eef5f0; padding: 3px; border-radius: 8px; }
.cp-tab {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
  background: transparent;
  border: none; border-radius: 6px;
  color: var(--vp-c-text-2); cursor: pointer;
}
.cp-tab.active {
  background: #ffffff; color: var(--vp-c-brand-dark); font-weight: 500;
  box-shadow: 0 1px 2px rgba(107, 158, 127, 0.15);
}
.dark .cp-tabs { background: #1a201c; }
.dark .cp-tab.active { background: #232a25; color: #a8cdb6; box-shadow: none; }

.cp-actions { display: flex; gap: 8px; align-items: end; }
.cp-btn {
  padding: 8px 16px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
  white-space: nowrap;
}
.cp-btn:hover:not(:disabled) { background: var(--vp-c-brand-2); }
.cp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cp-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.cp-btn.ghost:hover:not(:disabled) { background: var(--vp-c-brand-soft); }
.dark .cp-btn.ghost { color: #a8cdb6; }

.cp-list { margin-top: 16px; }
.cp-list-h { font-size: 12px; color: var(--vp-c-text-2); margin-bottom: 8px; }
.cp-result-h {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  margin-bottom: 14px; flex-wrap: wrap;
}
.cp-total { font-size: 13px; color: var(--vp-c-text-2); margin-top: 4px; }
.cp-total .good { color: #4c8f5f; font-weight: 500; }
.cp-total .bad  { color: #b47a4c; font-weight: 500; }

.cp-thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.cp-thumb {
  position: relative;
  background: #f4f9f5;
  border: 1px solid #dbe8de;
  border-radius: 10px;
  padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.dark .cp-thumb { background: #1a201c; border-color: #2a352d; }
.cp-thumb img {
  width: 100%; height: 100px; object-fit: contain;
  background: #fff; border-radius: 6px;
}
.cp-thumb-meta { font-size: 11px; color: var(--vp-c-text-2); line-height: 1.5; }
.cp-thumb-name {
  color: var(--vp-c-text-1); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cp-thumb-info .good { color: #4c8f5f; font-weight: 500; }
.cp-thumb-info .bad  { color: #b47a4c; font-weight: 500; }
.cp-mute { color: var(--vp-c-text-3); }

.cp-thumb-del, .cp-thumb-dl {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.45); color: #fff;
  cursor: pointer; font-size: 14px; line-height: 22px;
  display: flex; align-items: center; justify-content: center;
}
.cp-thumb-dl { background: var(--vp-c-brand-1); }
.cp-thumb-dl:hover { background: var(--vp-c-brand-2); }

@media (max-width: 900px) {
  .cp-options { grid-template-columns: 1fr 1fr; }
  .cp-actions { grid-column: 1 / -1; }
}
</style>
