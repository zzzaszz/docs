---
title: UUID / 哈希 / JWT
outline: false
---

# 🆔 UUID / 哈希 / JWT

一次搞定几个高频小工具：

- **UUID / ID 生成**：v4 随机、v7 时间有序、NanoID、随机 hex，可批量 1000 个
- **哈希**：SHA-1/256/384/512（浏览器原生）+ MD5（内置实现）
- **JWT 解析**：粘贴即拆开 header / payload，显示签发 / 过期时间和有效性

<UuidHashJwtTool />

<div class="vp-doc" style="margin-top: 16px;">

::: tip 提示
浏览器的 `SubtleCrypto` 出于安全考虑不提供 MD5，此工具内置了标准 MD5 实现（约 30 行代码）。
JWT 解析**不会校验签名**，因为签名校验需要密钥；本工具只解析结构与时间字段。
:::

</div>
