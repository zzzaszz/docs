---
layout: home

title: CAOSHI 技术文档
titleTemplate: Java / Vue / SQL 笔记

hero:
  name: CAOSHI 技术文档
  text: 前端 · 后端 · 数据库
  tagline: 平时写代码时随手记的东西，方便自己回头查
  image:
    src: /logo.svg
    alt: CAOSHI Docs
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
    details: Vue3、Vite、npm、CSS 布局，还有一些常用的工具方法
    link: /doc/web
    linkText: 前端笔记

  - icon: 🍃
    title: 后端
    details: Spring Boot、Stream、Optional、EasyPOI、跨域、HTTP、线程、时间
    link: /doc/svc
    linkText: 后端笔记

  - icon: 🗄️
    title: 数据库 / 其他
    details: MySQL 索引、EXPLAIN、联合索引、锁排查，Linux 和 Git 常用命令
    link: /doc/other
    linkText: DB / 其他

  - icon: 🔧
    title: 遇到的问题
    details: SQL Server 兼容、MyBatis BATCH、CASE WHEN 批量更新、Redis 预警列表
    link: /doc/question
    linkText: 问题记录
---

<div class="home-content vp-doc">

## 快速导航

| 分类 | 内容 | 入口 |
|---|---|---|
| 前端 | Volta、npm ci、JSON 处理、Flex 布局、easytable | [/doc/web](/doc/web) |
| 后端 | Optional、StringUtils、EasyPOI、Stream、线程、时间 API | [/doc/svc](/doc/svc) |
| DB / 其他 | MySQL 索引、Linux、Git 代理 | [/doc/other](/doc/other) |
| 问题记录 | SQL Server、批量写入 / 更新、Redis 预警 | [/doc/question](/doc/question) |

## 关于本站

- 用 [VitePress](https://vitepress.dev/) 搭的，支持本地搜索和深色模式。
- 快捷键 <kbd>Ctrl</kbd> + <kbd>K</kbd> 打开搜索。

</div>
