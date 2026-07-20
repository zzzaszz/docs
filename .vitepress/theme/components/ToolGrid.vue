<script setup lang="ts">
import { withBase } from 'vitepress'

interface Tool {
  icon: string
  title: string
  desc: string
  link: string
  tag?: string
}

const tools: Tool[] = [
  {
    icon: '🌐',
    title: '时区转换',
    desc: '任意城市 / UTC 偏移之间互转，也能看当前各时区的时间',
    link: '/tools/timezone',
    tag: '时间'
  },
  {
    icon: '⏱️',
    title: '时间戳转换',
    desc: '秒 / 毫秒时间戳与日期字符串互转，支持自定义时区和格式',
    link: '/tools/timestamp',
    tag: '时间'
  },
  {
    icon: '🧾',
    title: 'JSON 格式化',
    desc: '容错解析 —— 单引号、注释、尾逗号、无引号 key 都能处理',
    link: '/tools/json',
    tag: '文本'
  },
  {
    icon: '🖼️',
    title: '图片 ↔ Base64',
    desc: '拖拽 / 粘贴图片转 Base64；也能把 Base64 还原成图片并下载',
    link: '/tools/image-base64',
    tag: '编码'
  }
  // 后续继续往这里加：URL 编解码、Base64、正则测试、UUID、颜色转换、Diff、SQL 格式化……
]
</script>

<template>
  <div class="tool-grid">
    <a
      v-for="t in tools"
      :key="t.link"
      class="tool-card"
      :href="withBase(t.link)"
    >
      <div class="tool-icon">{{ t.icon }}</div>
      <div class="tool-body">
        <div class="tool-title-row">
          <span class="tool-title">{{ t.title }}</span>
          <span v-if="t.tag" class="tool-tag">{{ t.tag }}</span>
        </div>
        <div class="tool-desc">{{ t.desc }}</div>
      </div>
    </a>
  </div>
</template>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin: 24px 0;
}
.tool-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 18px;
  background: #ffffff;
  border: 1px solid #dbe8de;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(107, 158, 127, 0.06);
  text-decoration: none !important;
  color: inherit;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.tool-card:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-brand-2);
  box-shadow: 0 4px 14px rgba(107, 158, 127, 0.15);
}
.tool-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}
.tool-body { flex: 1; min-width: 0; }
.tool-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.tool-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.tool-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-dark);
}
.tool-desc {
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
.dark .tool-card {
  background: var(--vp-c-bg-alt);
  border-color: #2a352d;
  box-shadow: none;
}
.dark .tool-tag {
  color: #a8cdb6;
}
</style>
