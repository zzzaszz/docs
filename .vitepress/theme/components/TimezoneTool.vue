<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

/** 常用时区列表（可继续加） */
const ZONES = [
  { label: '北京 / 上海 (UTC+8)', tz: 'Asia/Shanghai' },
  { label: '东京 (UTC+9)',        tz: 'Asia/Tokyo' },
  { label: '新加坡 (UTC+8)',      tz: 'Asia/Singapore' },
  { label: '悉尼 (UTC+10/+11)',   tz: 'Australia/Sydney' },
  { label: '伦敦 (UTC+0/+1)',     tz: 'Europe/London' },
  { label: '柏林 (UTC+1/+2)',     tz: 'Europe/Berlin' },
  { label: '莫斯科 (UTC+3)',      tz: 'Europe/Moscow' },
  { label: '纽约 (UTC-5/-4)',     tz: 'America/New_York' },
  { label: '洛杉矶 (UTC-8/-7)',   tz: 'America/Los_Angeles' },
  { label: '芝加哥 (UTC-6/-5)',   tz: 'America/Chicago' },
  { label: 'UTC',                 tz: 'UTC' }
]

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

/** 顶部：实时看各时区当前时间 */
function fmtNow(tz: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(now.value)
  } catch {
    return '—'
  }
}

/** 下方：手动转换 */
const inputTime = ref(toLocalInput(new Date()))
const fromTz = ref('Asia/Shanghai')
const toTz = ref('America/New_York')

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 把「fromTz 时区的墙上时间 inputTime」转成 UTC 时刻 */
function wallTimeToUTC(wall: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  // 先按 UTC 构造一个候选时刻
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || '0'))
  // 该 UTC 时刻在 tz 中显示的墙上时间
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const tzWall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  // 差值就是 tz 相对 UTC 的偏移，反向修正
  return new Date(guess - (tzWall - guess))
}

const converted = computed(() => {
  const d = wallTimeToUTC(inputTime.value, fromTz.value)
  if (!d || isNaN(d.getTime())) return { ok: false, text: '输入格式不对' }
  return {
    ok: true,
    text: new Intl.DateTimeFormat('zh-CN', {
      timeZone: toTz.value,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZoneName: 'short'
    }).format(d),
    utc: d.toISOString()
  }
})

function useNow() { inputTime.value = toLocalInput(new Date()) }
function swap() { [fromTz.value, toTz.value] = [toTz.value, fromTz.value] }

async function copy(txt: string) {
  try { await navigator.clipboard.writeText(txt) } catch {}
}
</script>

<template>
  <div class="tz-tool">
    <!-- 世界时钟 -->
    <section class="tz-block">
      <h3 class="tz-h">🌍 世界时钟</h3>
      <div class="tz-clock-grid">
        <div v-for="z in ZONES" :key="z.tz" class="tz-clock">
          <div class="tz-clock-name">{{ z.label }}</div>
          <div class="tz-clock-time">{{ fmtNow(z.tz) }}</div>
        </div>
      </div>
    </section>

    <!-- 手动转换 -->
    <section class="tz-block">
      <h3 class="tz-h">🔁 时区转换</h3>
      <div class="tz-form">
        <div class="tz-row">
          <label class="tz-lb">时间</label>
          <input type="datetime-local" step="1" v-model="inputTime" class="tz-input" />
          <button class="tz-btn" @click="useNow">当前时间</button>
        </div>
        <div class="tz-row">
          <label class="tz-lb">从</label>
          <select v-model="fromTz" class="tz-input">
            <option v-for="z in ZONES" :key="z.tz" :value="z.tz">{{ z.label }}</option>
          </select>
          <button class="tz-btn" @click="swap" title="交换">⇅</button>
        </div>
        <div class="tz-row">
          <label class="tz-lb">到</label>
          <select v-model="toTz" class="tz-input">
            <option v-for="z in ZONES" :key="z.tz" :value="z.tz">{{ z.label }}</option>
          </select>
        </div>

        <div class="tz-result" :class="{ bad: !converted.ok }">
          <div class="tz-result-main">
            <span>{{ converted.text }}</span>
            <button v-if="converted.ok" class="tz-btn ghost" @click="copy(converted.text)">复制</button>
          </div>
          <div v-if="converted.ok" class="tz-result-sub">UTC: {{ converted.utc }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tz-tool { display: flex; flex-direction: column; gap: 24px; }
.tz-block {
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  padding: 20px 22px;
}
.dark .tz-block { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.tz-h { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; color: var(--vp-c-text-1); }

.tz-clock-grid {
  display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.tz-clock {
  padding: 10px 12px;
  background: var(--vp-c-brand-soft);
  border-radius: 8px;
}
.tz-clock-name { font-size: 12px; color: var(--vp-c-brand-dark); margin-bottom: 4px; }
.tz-clock-time { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 14px; color: var(--vp-c-text-1); }
.dark .tz-clock-name { color: #a8cdb6; }

.tz-form { display: flex; flex-direction: column; gap: 12px; }
.tz-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tz-lb { min-width: 40px; font-size: 13px; color: var(--vp-c-text-2); }
.tz-input {
  flex: 1; min-width: 200px;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #dbe8de;
  border-radius: 8px;
  background: #f4f9f5;
  color: var(--vp-c-text-1);
}
.tz-input:focus { outline: none; border-color: var(--vp-c-brand-2); background: #ffffff; }
.dark .tz-input { background: #1a201c; border-color: #2a352d; }
.dark .tz-input:focus { background: #1e2620; }

.tz-btn {
  padding: 7px 14px;
  font-size: 13px;
  color: #fff;
  background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2);
  border-radius: 8px;
  cursor: pointer;
}
.tz-btn:hover { background: var(--vp-c-brand-2); }
.tz-btn.ghost {
  color: var(--vp-c-brand-dark);
  background: transparent;
  border-color: var(--vp-c-brand-2);
}
.tz-btn.ghost:hover { background: var(--vp-c-brand-soft); }
.dark .tz-btn.ghost { color: #a8cdb6; }

.tz-result {
  margin-top: 6px;
  padding: 14px 16px;
  background: var(--vp-c-brand-soft);
  border-radius: 10px;
  color: var(--vp-c-text-1);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 14px;
}
.tz-result.bad { color: #b04b4b; background: rgba(200, 90, 90, 0.08); }
.tz-result-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tz-result-sub { margin-top: 6px; font-size: 12px; color: var(--vp-c-text-2); }
</style>
