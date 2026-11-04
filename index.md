---
layout: home

title: CAOSHI 技术文档
titleTemplate: Java / Vue / SQL 笔记

hero:
  name: CAOSHI 技术文档
  text: 前端 · 后端 · 数据库
  actions:
    - theme: brand
      text: 开始阅读
      link: /doc/web
    - theme: alt
      text: GitHub
      link: https://github.com/zzzaszz/docs

features:
  - icon: 🌱
    title: 前端
    details: Vue3、Vite、npm、CSS 布局
    link: /doc/web

  - icon: 🍃
    title: 后端
    details: Spring Boot、Stream、EasyPOI
    link: /doc/svc

  - icon: 🔌
    title: 硬件
    details: ESP32-S3、GPIO、总线、LVGL
    link: /doc/hardware

  - icon: 🗄️
    title: 数据库 / 其他
    details: MySQL 索引、Linux、Git
    link: /doc/other

  - icon: 🔧
    title: 遇到的问题
    details: SQL Server、批量写入、Redis
    link: /doc/question

  - icon: 🧰
    title: 开发工具
    details: 时区、时间戳、JSON 格式化
    link: /tools/
---

## 关于本站

这是一个用 Markdown 写成的个人技术笔记站。平时在 Obsidian 里按主题记录前端、后端、数据库、硬件和踩坑经验，笔记保存后自动同步到 GitHub，再由 GitHub Actions 构建成现在看到的网页——不需要手动打包、上传或部署。

内容按「前端 / 后端 / 硬件 / 数据库」和「遇到的问题」分栏，另外放了一些日常用得到的小工具：时区转换、时间戳转换、JSON 格式化、图片与 Base64 互转、图片格式转换与压缩、二维码、UUID / 哈希 / JWT。

站点基于 VitePress 1.6 + Vue 3，使用 pnpm 构建，托管在 GitHub Pages；主题为自制，支持站内搜索、暗色模式、正文图片点击放大和标题按层级折叠。

## 从笔记到网页的流程

写笔记这一步做完，后面三步全自动完成：

| 步骤 | 在哪里发生 | 做了什么 |
|---|---|---|
| 1. 记笔记 | 本地 Obsidian | 用 Markdown 按主题写笔记，图片直接粘贴到 `doc/static/` |
| 2. 自动提交推送 | 本地 Obsidian | obsidian-git 插件定时扫描改动，自动 `git commit` 并 `git push` 到 GitHub 仓库 |
| 3. 自动构建 | GitHub Actions | 监听 `main` 分支推送，安装依赖并执行 `pnpm docs:build` |
| 4. 发布上线 | GitHub Pages | 构建产物发布到 `gh-pages` 分支，由 GitHub Pages 对外提供访问 |

展开说明：

1. **本地记笔记**：笔记就是普通的 Markdown 文件，按主题放在 `doc/` 下（`web.md`、`svc.md`、`other.md`、`hardware.md`、`question.md`），图片放在 `doc/static/`。在 Obsidian 里可以正常预览、搜索、链接，本质上就是本地文件。
2. **插件自动上传**：Obsidian 的 obsidian-git 插件按插件里配置的间隔检查改动，发现变化就自动生成一条提交记录（形如 `vault backup: 2026-11-04 14:37:30`）并推送到 GitHub，全程不用手动敲 git 命令。
3. **GitHub 自动部署**：仓库中的 `.github/workflows/deploy.yml` 监听 `main` 分支推送，用 Node 22 + pnpm 安装依赖、构建 VitePress、生成 `.nojekyll`，最后把构建产物发布到 `gh-pages` 分支。
4. **访问站点**：GitHub Pages 读取 `gh-pages` 分支的静态文件对外提供访问。每次推送后等 Actions 跑完，页面就是最新的。

## 项目结构

| 目录 | 说明 |
|---|---|
| `doc/` | 前端、后端、数据库、硬件、常见问题等 Markdown 笔记与图片 |
| `tools/` | 在线小工具页面：时区、时间戳、JSON、图片转换 / 压缩、二维码、Base64、UUID / 哈希 / JWT |
| `.vitepress/` | 站点配置与自定义主题：样式、图片查看器、标题折叠、各工具组件 |
| `.github/workflows/` | GitHub Actions 自动部署配置 |

源码与问题反馈见 [GitHub 仓库](https://github.com/zzzaszz/docs)。
