<script setup lang="ts">
import { ref, computed, watch } from 'vue'

/**
 * 「任性一点」的 JSON 解析器 —— 不用严格 JSON.parse。
 * 允许：
 *   1. 单引号 / 反引号字符串
 *   2. 无引号的 key
 *   3. // 单行 / /* 块级 *​/ 注释
 *   4. 尾逗号
 *   5. undefined / NaN / Infinity / -Infinity
 *   6. 十六进制数字、+ 前缀数字、以 . 开头 / 结尾的数字
 *   7. 首尾多余的分号、逗号
 *   8. 最外层用 JS 表达式包裹（如 `const a = {...};`）
 *   9. Python 风格：True / False / None
 */
function relaxedParse(src: string): any {
  let s = src

  // 剥掉像 `const x = { ... };` 这样的 JS 包裹
  s = s.replace(/^[\s\S]*?(?=[\[{"'`\-0-9tfnNIu])/, m => {
    // 只有当 m 里出现 = 时才认为是赋值前缀，否则原样返回
    return /=/.test(m) ? '' : m
  })

  const len = s.length
  let i = 0

  function err(msg: string): never {
    throw new SyntaxError(`${msg}（位置 ${i}）`)
  }

  function skip() {
    while (i < len) {
      const c = s[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') { i++; continue }
      // // 行注释
      if (c === '/' && s[i + 1] === '/') {
        i += 2
        while (i < len && s[i] !== '\n') i++
        continue
      }
      // /* 块注释 */
      if (c === '/' && s[i + 1] === '*') {
        i += 2
        while (i < len && !(s[i] === '*' && s[i + 1] === '/')) i++
        i += 2
        continue
      }
      // Python # 注释也顺手兼容
      if (c === '#') {
        while (i < len && s[i] !== '\n') i++
        continue
      }
      // 多余的分号
      if (c === ';') { i++; continue }
      return
    }
  }

  function parseValue(): any {
    skip()
    if (i >= len) err('意外的末尾')
    const c = s[i]
    if (c === '{') return parseObject()
    if (c === '[') return parseArray()
    if (c === '"' || c === "'" || c === '`') return parseString(c)
    if (c === '-' || c === '+' || (c >= '0' && c <= '9') || c === '.') return parseNumber()
    return parseWord()
  }

  function parseString(quote: string): string {
    i++ // 跳过起始引号
    let out = ''
    while (i < len) {
      const c = s[i]
      if (c === quote) { i++; return out }
      if (c === '\\') {
        i++
        const e = s[i++]
        switch (e) {
          case 'n': out += '\n'; break
          case 't': out += '\t'; break
          case 'r': out += '\r'; break
          case 'b': out += '\b'; break
          case 'f': out += '\f'; break
          case 'v': out += '\v'; break
          case '0': out += '\0'; break
          case '\\': out += '\\'; break
          case '/': out += '/'; break
          case "'": out += "'"; break
          case '"': out += '"'; break
          case '`': out += '`'; break
          case '\n': break            // 多行字符串续行
          case 'u': {
            const hex = s.slice(i, i + 4)
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) err('\\u 转义格式错误')
            out += String.fromCharCode(parseInt(hex, 16))
            i += 4
            break
          }
          case 'x': {
            const hex = s.slice(i, i + 2)
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) err('\\x 转义格式错误')
            out += String.fromCharCode(parseInt(hex, 16))
            i += 2
            break
          }
          default: out += e
        }
        continue
      }
      out += c
      i++
    }
    err('字符串未闭合')
  }

  function parseNumber(): number {
    const start = i
    if (s[i] === '+' || s[i] === '-') i++
    // 十六进制
    if (s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X')) {
      i += 2
      const hs = i
      while (i < len && /[0-9a-fA-F]/.test(s[i])) i++
      return parseInt(s.slice(hs, i), 16) * (s[start] === '-' ? -1 : 1)
    }
    while (i < len && /[0-9]/.test(s[i])) i++
    if (s[i] === '.') { i++; while (i < len && /[0-9]/.test(s[i])) i++ }
    if (s[i] === 'e' || s[i] === 'E') {
      i++
      if (s[i] === '+' || s[i] === '-') i++
      while (i < len && /[0-9]/.test(s[i])) i++
    }
    const n = Number(s.slice(start, i))
    if (isNaN(n)) err('无效的数字')
    return n
  }

  function parseWord(): any {
    const start = i
    while (i < len && /[A-Za-z_$][A-Za-z0-9_$]*/.test(s[i])) i++
    const w = s.slice(start, i)
    if (!w) err(`意外的字符 ${JSON.stringify(s[i])}`)
    switch (w) {
      case 'true': case 'True':   return true
      case 'false': case 'False': return false
      case 'null': case 'None': case 'nil': case 'undefined': return null
      case 'NaN':       return NaN
      case 'Infinity':  return Infinity
    }
    err(`未知的字面量 ${w}`)
  }

  function parseKey(): string {
    skip()
    const c = s[i]
    if (c === '"' || c === "'" || c === '`') return parseString(c)
    const start = i
    while (i < len && /[A-Za-z0-9_$\-\.]/.test(s[i])) i++
    const k = s.slice(start, i)
    if (!k) err('key 为空')
    return k
  }

  function parseObject(): Record<string, any> {
    i++ // 跳过 {
    const obj: Record<string, any> = {}
    skip()
    if (s[i] === '}') { i++; return obj }
    while (i < len) {
      skip()
      if (s[i] === '}') { i++; return obj }             // 尾逗号
      const key = parseKey()
      skip()
      if (s[i] !== ':' && s[i] !== '=') err(`key "${key}" 后缺少冒号`)
      i++
      obj[key] = parseValue()
      skip()
      if (s[i] === ',' || s[i] === ';') { i++; continue }
      if (s[i] === '}') { i++; return obj }
      // 允许换行分隔（无逗号）
      if (i < len) continue
      err('对象未闭合')
    }
    err('对象未闭合')
  }

  function parseArray(): any[] {
    i++ // 跳过 [
    const arr: any[] = []
    skip()
    if (s[i] === ']') { i++; return arr }
    while (i < len) {
      skip()
      if (s[i] === ']') { i++; return arr }             // 尾逗号
      arr.push(parseValue())
      skip()
      if (s[i] === ',' || s[i] === ';') { i++; continue }
      if (s[i] === ']') { i++; return arr }
      if (i < len) continue
      err('数组未闭合')
    }
    err('数组未闭合')
  }

  const value = parseValue()
  skip()
  // 允许末尾的分号、逗号、注释残留
  return value
}

/** 高亮 JSON —— 把字符串 / 数字 / 布尔 / 键分色 */
function highlight(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_m, str, colon, keyword, num) => {
      if (str) {
        return colon
          ? `<span class="jf-key">${str}</span>${colon}`
          : `<span class="jf-str">${str}</span>`
      }
      if (keyword) return `<span class="jf-kw">${keyword}</span>`
      if (num) return `<span class="jf-num">${num}</span>`
      return _m
    }
  )
}

/** 处理特殊值：NaN、Infinity 不合法，转 null；undefined 也转 null */
function safeStringify(v: any, indent: number | string): string {
  return JSON.stringify(v, (_k, val) => {
    if (typeof val === 'number' && !isFinite(val)) return null
    if (typeof val === 'undefined') return null
    return val
  }, indent)
}

const input = ref(`// 试试这段「任性」JSON —— 单引号、注释、尾逗号、无引号 key，都能识别
{
  name: 'CAOSHI',
  age: 18,          // 行注释
  /* 块注释也可以 */
  skills: ['Vue', "Java", \`SQL\`,],   // 尾逗号
  active: True,
  score: NaN,
  meta: {
    tags: ['前端', '后端',],
    time: 0x1a2b,
  }
}`)
const indent = ref<'2' | '4' | 'tab' | '0'>('2')
const sortKeys = ref(false)
const errorMsg = ref('')

function sortObj(v: any): any {
  if (Array.isArray(v)) return v.map(sortObj)
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce<Record<string, any>>((acc, k) => {
      acc[k] = sortObj(v[k])
      return acc
    }, {})
  }
  return v
}

const parsed = computed(() => {
  errorMsg.value = ''
  const raw = input.value.trim()
  if (!raw) return { ok: true, text: '', html: '' }
  try {
    let v = relaxedParse(raw)
    if (sortKeys.value) v = sortObj(v)
    const ind = indent.value === 'tab' ? '\t' : Number(indent.value)
    const text = safeStringify(v, ind)
    return { ok: true, text, html: highlight(text ?? '') }
  } catch (e: any) {
    errorMsg.value = e?.message || String(e)
    return { ok: false, text: '', html: '' }
  }
})

const info = computed(() => {
  if (!parsed.value.ok || !parsed.value.text) return null
  const text = parsed.value.text
  const bytes = new TextEncoder().encode(text).length
  return {
    lines: text.split('\n').length,
    chars: text.length,
    bytes
  }
})

function minify() {
  if (!parsed.value.ok) return
  try {
    const v = relaxedParse(input.value)
    input.value = safeStringify(sortKeys.value ? sortObj(v) : v, 0)
  } catch {}
}
function pretty() {
  if (!parsed.value.ok) return
  input.value = parsed.value.text
}
function escapeToStr() {
  if (!parsed.value.ok) return
  input.value = JSON.stringify(parsed.value.text)
}
function unescapeFromStr() {
  const raw = input.value.trim()
  try {
    // 允许直接粘贴一段被 JSON.stringify 过的字符串
    const s = raw.startsWith('"') ? JSON.parse(raw) : raw
    if (typeof s !== 'string') return
    input.value = s
  } catch {}
}
function clearAll() { input.value = '' }

async function copyResult() {
  if (parsed.value.text) {
    try { await navigator.clipboard.writeText(parsed.value.text) } catch {}
  }
}
async function pasteInput() {
  try {
    const t = await navigator.clipboard.readText()
    if (t) input.value = t
  } catch {}
}
</script>

<template>
  <div class="jf-tool">
    <div class="jf-toolbar">
      <div class="jf-toolbar-left">
        <label class="jf-lb">缩进</label>
        <select v-model="indent" class="jf-select">
          <option value="2">2 空格</option>
          <option value="4">4 空格</option>
          <option value="tab">Tab</option>
          <option value="0">压缩</option>
        </select>
        <label class="jf-check">
          <input type="checkbox" v-model="sortKeys" /> 按 key 排序
        </label>
      </div>
      <div class="jf-toolbar-right">
        <button class="jf-btn ghost" @click="pretty" title="格式化">美化</button>
        <button class="jf-btn ghost" @click="minify" title="压缩">压缩</button>
        <button class="jf-btn ghost" @click="escapeToStr" title="转成 JS 字符串">转义</button>
        <button class="jf-btn ghost" @click="unescapeFromStr" title="从 JS 字符串还原">去转义</button>
        <button class="jf-btn ghost" @click="pasteInput">粘贴</button>
        <button class="jf-btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="jf-panels">
      <div class="jf-panel">
        <div class="jf-panel-h">
          <span>输入（任性模式：单引号 / 注释 / 尾逗号 / 无引号 key 都行）</span>
        </div>
        <textarea
          v-model="input"
          class="jf-textarea"
          spellcheck="false"
          placeholder="把 JSON 粘贴到这里……"
        ></textarea>
      </div>

      <div class="jf-panel">
        <div class="jf-panel-h">
          <span>输出</span>
          <div class="jf-info">
            <template v-if="info">
              <span>{{ info.lines }} 行</span>
              <span>·</span>
              <span>{{ info.chars }} 字符</span>
              <span>·</span>
              <span>{{ info.bytes }} B</span>
            </template>
            <button class="jf-btn ghost tiny" :disabled="!parsed.text" @click="copyResult">复制</button>
          </div>
        </div>
        <div v-if="!parsed.ok" class="jf-error">❌ {{ errorMsg }}</div>
        <pre v-else class="jf-output"><code v-html="parsed.html || '<span class=&quot;jf-placeholder&quot;>输出会显示在这里……</span>'"></code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.jf-tool { display: flex; flex-direction: column; gap: 14px; }

.jf-toolbar {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px;
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 10px;
  padding: 10px 14px;
}
.dark .jf-toolbar { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.jf-toolbar-left, .jf-toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.jf-lb { font-size: 13px; color: var(--vp-c-text-2); }
.jf-select {
  padding: 5px 10px; font-size: 13px;
  border: 1px solid #dbe8de; border-radius: 6px;
  background: #f4f9f5; color: var(--vp-c-text-1);
}
.dark .jf-select { background: #1a201c; border-color: #2a352d; }
.jf-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--vp-c-text-2); cursor: pointer; }

.jf-btn {
  padding: 6px 12px; font-size: 13px;
  color: #fff; background: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2); border-radius: 6px; cursor: pointer;
}
.jf-btn:hover:not(:disabled) { background: var(--vp-c-brand-2); }
.jf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.jf-btn.ghost {
  color: var(--vp-c-brand-dark); background: transparent;
}
.jf-btn.ghost:hover:not(:disabled) { background: var(--vp-c-brand-soft); }
.jf-btn.tiny { padding: 3px 10px; font-size: 12px; }
.dark .jf-btn.ghost { color: #a8cdb6; }

.jf-panels {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
}
.jf-panel {
  display: flex; flex-direction: column;
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 10px;
  overflow: hidden;
  min-height: 500px;
}
.dark .jf-panel { background: var(--vp-c-bg-alt); border-color: #2a352d; }
.jf-panel-h {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px;
  font-size: 12px; color: var(--vp-c-text-2);
  background: #f4f9f5;
  border-bottom: 1px solid #eaf2ec;
}
.dark .jf-panel-h { background: #1a201c; border-bottom-color: #2a352d; }
.jf-info { display: flex; align-items: center; gap: 8px; font-size: 12px; }

.jf-textarea {
  flex: 1;
  width: 100%;
  padding: 14px 16px;
  border: none;
  outline: none;
  resize: vertical;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.65;
  background: transparent;
  color: var(--vp-c-text-1);
  min-height: 460px;
}
.jf-output {
  flex: 1;
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.65;
  background: transparent;
  color: var(--vp-c-text-1);
}
.jf-output code { white-space: pre; }
.jf-placeholder { color: var(--vp-c-text-3); }

.jf-error {
  margin: 14px;
  padding: 12px 14px;
  background: rgba(200, 90, 90, 0.08);
  color: #b04b4b;
  border-radius: 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  white-space: pre-wrap;
}

/* JSON 语法高亮 */
:deep(.jf-key)  { color: #558a68; font-weight: 500; }
:deep(.jf-str)  { color: #b25c00; }
:deep(.jf-num)  { color: #1f6feb; }
:deep(.jf-kw)   { color: #8b3aaa; font-weight: 500; }
.dark :deep(.jf-key) { color: #a8cdb6; }
.dark :deep(.jf-str) { color: #e6b980; }
.dark :deep(.jf-num) { color: #7fb3ff; }
.dark :deep(.jf-kw)  { color: #d6a8f0; }

@media (max-width: 900px) {
  .jf-panels { grid-template-columns: 1fr; }
  .jf-panel { min-height: 360px; }
  .jf-textarea { min-height: 320px; }
}
</style>
