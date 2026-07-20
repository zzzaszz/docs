---
title: URL / Base64
outline: false
---

# 🔗 URL 编解码 / Base64 文本

- **URL**：区分 `encodeURI`（保留 URL 结构）和 `encodeURIComponent`（全部转义），
  解码把 `+` 也当作空格。
- **Base64**：UTF-8 安全，中文没问题，支持 URL-Safe (`base64url`) 变体。

<UrlBase64Tool />
