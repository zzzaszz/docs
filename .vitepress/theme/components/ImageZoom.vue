<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

const visible = ref(false)
const src = ref('')
const alt = ref('')
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)

const MIN_SCALE = 0.5
const MAX_SCALE = 6

// 工具面板里的预览图（ImageBase64 / ImageCompress / ImageConvert / QrCode）
// 有自己的交互，不参与点击放大
const EXCLUDED = '.ib-tool, .cp-tool, .ic-tool, .qr-tool'

const pointers = new Map<number, { x: number; y: number }>()
let startX = 0
let startY = 0
let startTx = 0
let startTy = 0
let startDist = 0
let startScale = 1
let pinchX = 0
let pinchY = 0

function clampScale(v: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v))
}

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function open(image: HTMLImageElement) {
  src.value = image.currentSrc || image.src
  alt.value = image.alt || ''
  pointers.clear()
  dragging.value = false
  reset()
  visible.value = true
}

function close() {
  visible.value = false
  pointers.clear()
  dragging.value = false
}

// 以某个屏幕坐标为锚点缩放：锚点下的像素保持不动
function zoomAt(next: number, clientX: number, clientY: number) {
  const target = clampScale(next)
  const ratio = target / scale.value
  const cx = clientX - window.innerWidth / 2
  const cy = clientY - window.innerHeight / 2
  tx.value = cx - (cx - tx.value) * ratio
  ty.value = cy - (cy - ty.value) * ratio
  scale.value = target
}

function onWheel(e: WheelEvent) {
  zoomAt(scale.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)
}

function onDblClick(e: MouseEvent) {
  if (scale.value > 1.05) reset()
  else zoomAt(2.5, e.clientX, e.clientY)
}

function onPointerDown(e: PointerEvent) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)

  if (pointers.size === 1) {
    dragging.value = true
    startX = e.clientX
    startY = e.clientY
    startTx = tx.value
    startTy = ty.value
    startDist = 0
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    startDist = Math.hypot(a.x - b.x, a.y - b.y)
    startScale = scale.value
    startTx = tx.value
    startTy = ty.value
    pinchX = (a.x + b.x) / 2 - window.innerWidth / 2
    pinchY = (a.y + b.y) / 2 - window.innerHeight / 2
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size >= 2 && startDist > 0) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const next = clampScale(startScale * (dist / startDist))
    const ratio = next / startScale
    tx.value = pinchX - (pinchX - startTx) * ratio
    ty.value = pinchY - (pinchY - startTy) * ratio
    scale.value = next
  } else if (dragging.value) {
    tx.value = startTx + (e.clientX - startX)
    ty.value = startTy + (e.clientY - startY)
  }
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) startDist = 0
  if (pointers.size === 0) dragging.value = false
  else if (pointers.size === 1) {
    // 双指变单指：把手势起点重置为当前这一指，避免跳变
    const [p] = [...pointers.values()]
    startX = p.x
    startY = p.y
    startTx = tx.value
    startTy = ty.value
  }
}

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target || target.tagName !== 'IMG') return
  const img = target as HTMLImageElement
  if (!img.closest('.vp-doc')) return
  if (img.closest('a')) return
  if (img.closest(EXCLUDED)) return
  if (img.classList.contains('no-zoom')) return
  if (!img.src) return
  e.preventDefault()
  open(img)
}

function onKeydown(e: KeyboardEvent) {
  if (!visible.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === '0') {
    reset()
  } else if (e.key === '+' || e.key === '=') {
    zoomAt(scale.value * 1.2, window.innerWidth / 2, window.innerHeight / 2)
  } else if (e.key === '-') {
    zoomAt(scale.value / 1.2, window.innerWidth / 2, window.innerHeight / 2)
  }
}

watch(visible, async (on) => {
  await nextTick()
  document.body.style.overflow = on ? 'hidden' : ''
})

// 切换页面时关掉遮罩，否则新页面下会残留
watch(() => route.path, () => {
  if (visible.value) close()
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="iz-fade">
      <div
        v-if="visible"
        class="iz-overlay"
        @click.self="close"
        @wheel.prevent="onWheel"
      >
        <button class="iz-close" type="button" aria-label="关闭" @click="close">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <img
          class="iz-img"
          :class="{ 'is-dragging': dragging }"
          :src="src"
          :alt="alt"
          :style="{ transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})` }"
          draggable="false"
          @click.stop
          @dblclick.stop="onDblClick"
          @pointerdown.prevent="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />

        <div class="iz-hint">滚轮缩放 · 拖拽移动 · 双击放大 · Esc 关闭</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.iz-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
}

.iz-img {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: 92vw;
  max-height: 92vh;
  border-radius: 4px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
  cursor: grab;
  transition: transform 0.16s ease-out;
  will-change: transform;
}

.iz-img.is-dragging {
  cursor: grabbing;
  transition: none;
}

.iz-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  transition: background 0.2s;
}

.iz-close:hover {
  background: rgba(255, 255, 255, 0.26);
}

.iz-hint {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(0, 0, 0, 0.35);
  white-space: nowrap;
  pointer-events: none;
}

.iz-fade-enter-active,
.iz-fade-leave-active {
  transition: opacity 0.18s ease;
}

.iz-fade-enter-from,
.iz-fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .iz-hint {
    font-size: 11px;
  }
}
</style>
