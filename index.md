---
layout: home

title: ZZZ 技术文档
titleTemplate: Java / Vue / SQL 学习笔记

hero:
  name: ZZZ 技术文档
  text: 前端 · 后端 · 数据库
  tagline: 日常开发中沉淀的知识点、避坑记录与常用工具方法
  image:
    src: /logo.svg
    alt: ZZZ Docs
  actions:
    - theme: brand
      text: 开始阅读
      link: /doc/web
    - theme: alt
      text: GitHub
      link: https://github.com/zzzaszz/docs

features:
  - icon: 🎨
    title: 前端相关
    details: Vue3 / Vite / npm / CSS 布局，以及日常工具封装与常见问题处理
    link: /doc/web
    linkText: 查看前端笔记

  - icon: ⚙️
    title: 后端相关
    details: Spring Boot、Stream、Optional、EasyPOI、跨域、HTTP 请求、线程与时间处理
    link: /doc/svc
    linkText: 查看后端笔记

  - icon: 🗄️
    title: 数据库 / 其他
    details: MySQL 索引与 EXPLAIN、联合索引、锁排查，以及 Linux / Git 常用命令
    link: /doc/other
    linkText: 查看 DB / 其他

  - icon: 🐞
    title: 疑难问题
    details: SQL Server 兼容、MyBatis BATCH 批量写入、CASE WHEN 批量更新、Redis 预警列表
    link: /doc/question
    linkText: 查看问题记录
---

<div class="vp-doc" style="max-width:960px;margin:3rem auto 0;padding:0 24px;">

## 📌 快速导航

| 分类 | 主要内容 | 入口 |
|---|---|---|
| **前端** | Volta、npm ci、JSON 处理、Flex 布局、easytable | [/doc/web](/doc/web) |
| **后端** | Optional、StringUtils、EasyPOI、Stream、线程、时间 API | [/doc/svc](/doc/svc) |
| **DB / 其他** | MySQL 索引与性能、Linux、Git 代理 | [/doc/other](/doc/other) |
| **相关问题** | SQL Server、批量写入/更新、Redis 预警 | [/doc/question](/doc/question) |

## 🚀 本站说明

- 基于 [VitePress](https://vitepress.dev/) 构建，支持全文本地搜索与深色模式。
- 内容为个人学习与工作积累，欢迎参考，如有错漏欢迎提 issue。
- 快捷键：<kbd>Ctrl</kbd> + <kbd>K</kbd> 打开搜索。

</div>
