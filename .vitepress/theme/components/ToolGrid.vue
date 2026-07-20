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
  },
  {
    icon: '🔳',
    title: '二维码',
    desc: '文本 / URL 生成二维码，可自定义颜色与容错；也能识别二维码图片',
    link: '/tools/qrcode',
    tag: '图像'
  },
  {
    icon: '🎨',
    title: '图片格式转换',
    desc: 'PNG / JPG / WebP / BMP 互转，支持批量、质量与缩放调节',
    link: '/tools/image-convert',
    tag: '图像'
  },
  {
    icon: '📦',
    title: '图片容量压缩',
    desc: '按质量或按目标大小压缩，二分法自动逼近目标 KB',
    link: '/tools/image-compress',
    tag: '图像'
  },
  {
    icon: '🔗',
    title: 'URL / Base64 文本',
    desc: 'URL 编解码、Base64 文本互转（UTF-8 安全，支持 URL-Safe 变体）',
    link: '/tools/url-base64',
    tag: '编码'
  },
  {
    icon: '🆔',
    title: 'UUID / 哈希 / JWT',
    desc: 'UUID v4/v7 & NanoID 批量生成、MD5/SHA 家族哈希、JWT 解析',
    link: '/tools/uuid-hash-jwt',
    tag: '安全'
  }
  // 后续继续往这里加：正则测试、颜色转换、Diff、SQL 格式化、Cron 表达式……
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
