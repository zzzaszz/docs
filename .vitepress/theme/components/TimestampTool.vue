<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const nowSec = computed(() => Math.floor(now.value / 1000))
const nowMs = computed(() => now.value)

/** ---------- 时间戳 → 日期 ---------- */
const tsInput = ref(String(Math.floor(Date.now() / 1000)))
const tsUnit = ref<'auto' | 's' | 'ms'>('auto')
const tsTz = ref('Asia/Shanghai')

function parseTs(raw: string, unit: 'auto' | 's' | 'ms'): number | null {
  const s = raw.trim()
  if (!s) return null
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!isFinite(n)) return null
  if (unit === 's')  return Math.round(n * 1000)
  if (unit === 'ms') return Math.round(n)
  // auto：10 位以内当秒，13 位左右当毫秒，16 位当微秒
  const abs = Math.abs(n)
  if (abs < 1e11) return Math.round(n * 1000)          // 秒
  if (abs < 1e14) return Math.round(n)                 // 毫秒
  if (abs < 1e17) return Math.round(n / 1000)          // 微秒
  return Math.round(n / 1_000_000)                     // 纳秒
}

const tsResult = computed(() => {
  const ms = parseTs(tsInput.value, tsUnit.value)
  if (ms === null) return { ok: false, list: [] as {label: string; value: string}[] }
  const d = new Date(ms)
  if (isNaN(d.getTime())) return { ok: false, list: [] }

  const fmt = (tz: string) => new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(d).replace(/\//g, '-')

  return {
    ok: true,
    list: [
      { label: '本地时间',   value: fmt(Intl.DateTimeFormat().resolvedOptions().timeZone) },
      { label: '选定时区',   value: `${fmt(tsTz.value)}  (${tsTz.value})` },
      { label: 'UTC',       value: d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') },
      { label: 'ISO 8601',  value: d.toISOString() },
      { label: 'RFC 2822',  value: d.toUTCString() },
      { label: '相对时间',   value: relativeFromNow(ms) }
    ]
  }
})

function relativeFromNow(ms: number) {
  const diff = (ms - Date.now()) / 1000
  const abs = Math.abs(diff)
  const units: [number, string][] = [
    [60, '秒'], [60, '分钟'], [24, '小时'], [30, '天'], [12, '个月'], [Number.POSITIVE_INFINITY, '年']
  ]
  let v = abs, u = '秒'
  for (const [n, name] of units) {
    if (v < n) { u = name; break }
    v /= n; u = name
  }
  const val = v.toFixed(v < 10 ? 1 : 0)
  return diff >= 0 ? `${val} ${u}后` : `${val} ${u}前`
}

/** ---------- 日期 → 时间戳 ---------- */
const dateInput = ref(toLocalInput(new Date()))
const dateTz = ref('Asia/Shanghai')

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function wallToUTC(wall: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || '0'))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const tzWall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return new Date(guess - (tzWall - guess))
}

const dateResult = computed(() => {
  const d = wallToUTC(dateInput.value, dateTz.value)
  if (!d || isNaN(d.getTime())) return { ok: false, sec: '', ms: '' }
  return { ok: true, sec: String(Math.floor(d.getTime() / 1000)), ms: String(d.getTime()) }
})

async function copy(txt: string) { try { await navigator.clipboard.writeText(txt) } catch {} }
function useNowTs() { tsInput.value = String(Math.floor(Date.now() / 1000)) }
function useNowMs() { tsInput.value = String(Date.now()) }
function useNowDate() { dateInput.value = toLocalInput(new Date()) }

const ZONES = [
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore',
  'Europe/London', 'Europe/Berlin', 'Europe/Moscow',
  'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Australia/Sydney', 'UTC'
]
</script>

<template>
  <div class="ts-tool">
    <!-- 当前时间 -->
    <section class="ts-block ts-now">
      <div class="ts-now-item">
        <div class="ts-now-label">当前时间戳（秒）</div>
        <div class="ts-now-value">
          <span>{{ nowSec }}</span>
          <button class="ts-btn ghost" @click="copy(String(nowSec))">复制</button>
        </div>
      </div>
      <div class="ts-now-item">
        <div class="ts-now-label">当前时间戳（毫秒）</div>
        <div class="ts-now-value">
          <span>{{ nowMs }}</span>
          <button class="ts-btn ghost" @click="copy(String(nowMs))">复制</button>
        </div>
      </div>
    </section>

    <!-- 时间戳 → 日期 -->
    <section class="ts-block">
      <h3 class="ts-h">⏱️ 时间戳 → 日期</h3>
      <div class="ts-row">
        <input v-model="tsInput" class="ts-input mono" placeholder="1721000000 或 1721000000000" />
        <select v-model="tsUnit" class="ts-input tight">
          <option value="auto">自动识别</option>
          <option value="s">秒</option>
          <option value="ms">毫秒</option>
        </select>
        <select v-model="tsTz" class="ts-input tight">
          <option v-for="z in ZONES" :key="z" :value="z">{{ z }}</option>
        </select>
        <button class="ts-btn" @click="useNowTs">当前(秒)</button>
        <button class="ts-btn ghost" @click="useNowMs">当前(毫秒)</button>
      </div>

      <div v-if="tsResult.ok" class="ts-result-list">
        <div v-for="r in tsResult.list" :key="r.label" class="ts-result-item">
          <span class="ts-result-label">{{ r.label }}</span>
          <span class="ts-result-value mono">{{ r.value }}</span>
          <button class="ts-btn ghost tiny" @click="copy(r.value)">复制</button>
        </div>
      </div>
      <div v-else class="ts-result bad">输入格式不对（应为数字）</div>
    </section>

    <!-- 日期 → 时间戳 -->
    <section class="ts-block">
      <h3 class="ts-h">📅 日期 → 时间戳</h3>
      <div class="ts-row">
        <input type="datetime-local" step="1" v-model="dateInput" class="ts-input" />
        <select v-model="dateTz" class="ts-input tight">
          <option v-for="z in ZONES" :key="z" :value="z">{{ z }}</option>
        </select>
        <button class="ts-btn" @click="useNowDate">当前时间</button>
      </div>

      <div v-if="dateResult.ok" class="ts-result-list">
        <div class="ts-result-item">
          <span class="ts-result-label">秒</span>
          <span class="ts-result-value mono">{{ dateResult.sec }}</span>
          <button class="ts-btn ghost tiny" @click="copy(dateResult.sec)">复制</button>
        </div>
        <div class="ts-result-item">
          <span class="ts-result-label">毫秒</span>
          <span class="ts-result-value mono">{{ dateResult.ms }}</span>
          <button class="ts-btn ghost tiny" @click="copy(dateResult.ms)">复制</button>
        </div>
      </div>
      <div v-else class="ts-result bad">日期格式不对</div>
    </section>
  </div>
</template>

<style scoped>
.ts-tool { display: flex; flex-direction: column; gap: 24px; }
.ts-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
}
.dark .ts-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.ts-h { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; }

.ts-now { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; }
.ts-now-item { display: flex; flex-direction: column; gap: 6px; }
.ts-now-label { font-size: 12px; color: var(--vp-c-text-2); }
.ts-now-value {
  display: flex; align-items: center; gap: 10px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 20px;
  color: var(--vp-c-brand-dark);
}
.dark .ts-now-value { color: #a8cdb6; }

.ts-row {
  display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
  margin-bottom: 14px;
}
.ts-input {
  flex: 1; min-width: 200px;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #dbe8de;
  border-radius: 8px;
  background: #f4f9f5;
  color: var(--vp-c-text-1);
}
.ts-input.tight { flex: 0 1 auto; min-width: 140px; }
.ts-input.mono { font-family: 'JetBrains Mono', Consolas, monospace; }
.ts-input:focus { outline: none; border-color: var(--vp-c-brand-2); background: #ffffff; }
.dark .ts-input { background: #1a201c; border-color: #2a352d; }
.dark .ts-input:focus { background: #1e2620; }

.ts-btn {
  padding: 7px 14px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 8px; cursor: pointer;
}
.ts-btn:hover { background: var(--vp-c-brand-2); }
.ts-btn.ghost { color: var(--vp-c-brand-dark); background: transparent; }
.ts-btn.ghost:hover { background: var(--vp-c-brand-soft); }
.ts-btn.tiny { padding: 4px 10px; font-size: 12px; }
.dark .ts-btn.ghost { color: #a8cdb6; }

.ts-result-list { display: flex; flex-direction: column; gap: 8px; }
.ts-result-item {
  display: grid;
  grid-template-columns: 90px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--vp-c-brand-soft);
  border-radius: 8px;
}
.ts-result-label { font-size: 12px; color: var(--vp-c-brand-dark); }
.dark .ts-result-label { color: #a8cdb6; }
.ts-result-value {
  font-size: 14px; word-break: break-all;
  color: var(--vp-c-text-1);
}
.mono { font-family: 'JetBrains Mono', Consolas, monospace; }

.ts-result {
  padding: 14px 16px;
  background: var(--vp-c-brand-soft);
  border-radius: 8px;
  font-size: 14px;
}
.ts-result.bad { color: #b04b4b; background: rgba(200, 90, 90, 0.08); }

@media (max-width: 640px) {
  .ts-now { grid-template-columns: 1fr; }
  .ts-result-item { grid-template-columns: 1fr; }
}
</style>
