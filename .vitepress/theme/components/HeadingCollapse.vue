<script setup lang="ts">
import { watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onContentUpdated, useRoute } from 'vitepress'

const route = useRoute()

const HEADING_SELECTOR = 'h2, h3, h4'
const BTN_CLASS = 'hc-toggle'
const COLLAPSED = 'hc-collapsed'
const HIDDEN = 'hc-hidden'

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
  '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>'

function levelOf(el: Element | null): number {
  if (!el) return 0
  const m = /^H([1-6])$/.exec(el.tagName)
  return m ? Number(m[1]) : 0
}

function getRoot(): HTMLElement | null {
  return document.querySelector('.vp-doc')
}

/** 按标题的父节点分组刷新：每个元素是否隐藏在扫描时统一算出，避免嵌套折叠互相干扰 */
function refreshGroup(parent: Element) {
  const stack: number[] = []
  let sectionLevel = 0

  for (const el of Array.from(parent.children)) {
    const level = levelOf(el)

    if (level > 0) {
      while (stack.length && stack[stack.length - 1] >= level) stack.pop()
      const hidden = stack.length > 0
      el.classList.toggle(HIDDEN, hidden)

      // 被外层折叠隐藏的标题不参与展开，但保留自身折叠状态
      if (!hidden && el.classList.contains(COLLAPSED)) stack.push(level)

      sectionLevel = level
      el.classList.remove('hc-l3', 'hc-l4')

      const btn = el.querySelector(':scope > .' + BTN_CLASS)
      if (btn) {
        const collapsed = el.classList.contains(COLLAPSED)
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
        btn.setAttribute('aria-label', collapsed ? '展开该章节' : '折叠该章节')
      }
    } else {
      el.classList.toggle(HIDDEN, stack.length > 0)
      // 正文跟随所属标题层级缩进，让层级关系看起来是嵌套的
      el.classList.toggle('hc-l3', sectionLevel === 3)
      el.classList.toggle('hc-l4', sectionLevel >= 4)
    }
  }
}

function refreshAll() {
  const root = getRoot()
  if (!root) return
  const parents = new Set<Element>()
  root.querySelectorAll(HEADING_SELECTOR).forEach((h) => {
    if (h.parentElement) parents.add(h.parentElement)
  })
  parents.forEach(refreshGroup)
}

function toggle(heading: HTMLElement) {
  heading.classList.toggle(COLLAPSED)
  if (heading.parentElement) refreshGroup(heading.parentElement)
}

/** 判断 target 是否落在 heading 的章节范围内（同一父节点、下一个同级或更高级标题之前） */
function sectionContains(heading: HTMLElement, target: Element): boolean {
  const parent = heading.parentElement
  if (!parent || target.parentElement !== parent) return false
  const kids = Array.from(parent.children)
  const from = kids.indexOf(heading)
  const to = kids.indexOf(target)
  if (from < 0 || to <= from) return false
  const level = levelOf(heading)
  for (let i = from + 1; i < to; i++) {
    const lv = levelOf(kids[i])
    if (lv > 0 && lv <= level) return false
  }
  return true
}

function expandTo(target: Element | null) {
  if (!target) return false
  const root = getRoot()
  if (!root) return false
  let changed = false
  root.querySelectorAll<HTMLElement>(HEADING_SELECTOR).forEach((h) => {
    if (h.classList.contains(COLLAPSED) && sectionContains(h, target)) {
      h.classList.remove(COLLAPSED)
      changed = true
    }
  })
  if (changed) refreshAll()
  return changed
}

/** 定位到被折叠隐藏的锚点：先展开，再校正滚动位置（扣掉吸顶导航高度） */
function revealTarget(target: Element | null) {
  if (!target || !target.classList.contains(HIDDEN)) return
  if (!expandTo(target)) return
  requestAnimationFrame(() => {
    const nav = document.querySelector('.VPNavBar')
    const offset = (nav?.getBoundingClientRect().height ?? 0) + 16
    const top = target.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top })
  })
}

function revealHash() {
  const hash = location.hash.slice(1)
  if (!hash) return
  let id = hash
  try {
    id = decodeURIComponent(hash)
  } catch {
    /* 保留原值 */
  }
  revealTarget(document.getElementById(id))
}

function init() {
  const root = getRoot()
  if (!root) return

  root.querySelectorAll<HTMLElement>(HEADING_SELECTOR).forEach((heading) => {
    heading.classList.add('hc-heading')
    if (heading.querySelector(':scope > .' + BTN_CLASS)) return

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = BTN_CLASS
    btn.setAttribute('aria-expanded', 'true')
    btn.setAttribute('aria-label', '折叠该章节')
    btn.innerHTML = CHEVRON
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      toggle(heading)
    })
    // 放在标题文字前面，和文件树一样，折叠意图更直观
    heading.insertBefore(btn, heading.firstChild)
  })

  refreshAll()
}

function onDocClick(e: MouseEvent) {
  if (e.button !== 0 || e.defaultPrevented) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // 标题里的永久链接、以及选中的文字，都不触发折叠
  if (target.closest('a')) return
  if (window.getSelection()?.toString()) return

  const heading = target.closest(HEADING_SELECTOR) as HTMLElement | null
  if (!heading || !heading.classList.contains('hc-heading')) return
  if (!heading.closest('.vp-doc')) return

  e.preventDefault()
  toggle(heading)
}

// 点击站内锚点时，先把可能要跳转到的章节展开，保证滚动位置正确
function onDocClickCapture(e: MouseEvent) {
  const anchor = (e.target as HTMLElement | null)?.closest('a[href^="#"]') as HTMLAnchorElement | null
  if (!anchor) return
  const href = anchor.getAttribute('href')
  if (!href || href.length < 2) return
  let id = href.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    /* 保留原值 */
  }
  revealTarget(document.getElementById(id))
}

onContentUpdated(() => {
  init()
  nextTick(revealHash)
})

watch(
  () => route.hash,
  () => {
    nextTick(() => setTimeout(revealHash, 0))
  }
)

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('click', onDocClickCapture, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('click', onDocClickCapture, true)
})
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
