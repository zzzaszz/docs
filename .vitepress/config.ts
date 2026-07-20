import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 生成与 VitePress 默认 anchor 相同的 slug
 * 规则：转小写 → 去掉除中英文数字空格连字符外的字符 → 空格转为连字符
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * 扫描 md 文件里的 ## 标题，自动生成侧边栏 items
 * 会跳过代码块内的 ## 干扰
 */
function autoSidebar(mdRelPath: string, groupText: string) {
  const abs = resolve(__dirname, '..', mdRelPath)
  const src = fs.readFileSync(abs, 'utf-8')
  const items: { text: string; link: string }[] = []
  const linkBase = '/' + mdRelPath.replace(/\.md$/, '')

  let inCode = false
  for (const raw of src.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue }
    if (inCode) continue
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(raw)
    if (m) {
      const text = m[1].trim()
      items.push({ text, link: `${linkBase}#${slugify(text)}` })
    }
  }
  return [{ text: groupText, collapsed: false, items }]
}

export default defineConfig({

  title: 'CAOSHI 技术文档',
  description: 'Java / Vue / SQL 学习笔记',
  base: '/docs/',
  lang: 'zh-CN',
  lastUpdated: true,
  // GitHub Pages 不支持无扩展名路由，关掉 cleanUrls，让链接带 .html
  cleanUrls: false,

  head: [
    ['link', { rel: 'icon', href: '/docs/favicon.ico' }]
  ],

  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },

  themeConfig: {

    // 顶部导航
    nav: [
      { text: '首页', link: '/' },
      { text: '前端', link: '/doc/web' },
      { text: '后端', link: '/doc/svc' },
      { text: 'DB / 其他', link: '/doc/other' },
      { text: '相关问题', link: '/doc/question' },
      {
        text: '工具',
        link: '/tools/',
        activeMatch: '/tools/'
      }
    ],

    // 左侧目录 —— 自动扫描 md 里的 ## 标题
    sidebar: {
      '/doc/web':      autoSidebar('doc/web.md',      '前端'),
      '/doc/svc':      autoSidebar('doc/svc.md',      '后端'),
      '/doc/other':    autoSidebar('doc/other.md',    'DB / 其他'),
      '/doc/question': autoSidebar('doc/question.md', '相关问题'),
      '/tools/': [
        {
          text: '开发工具',
          collapsed: false,
          items: [
            { text: '工具总览',      link: '/tools/' },
            { text: '时区转换',      link: '/tools/timezone' },
            { text: '时间戳转换',    link: '/tools/timestamp' },
            { text: 'JSON 格式化',   link: '/tools/json' },
            { text: '图片 ↔ Base64', link: '/tools/image-base64' }
          ]
        }
      ]
    },

    // 右侧大纲
    outline: {
      level: [2, 3],
      label: '本页目录'
    },

    // 搜索
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无匹配结果',
            resetButtonTitle: '重置搜索',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },

    // 页脚
    footer: {
      message: '基于 MIT 许可发布',
      copyright: 'Copyright © 2025 zzzaszz'
    },

    // 文档翻译
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    lastUpdatedText: '最后更新',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/zzzaszz/docs' }
    ]
  }
})
