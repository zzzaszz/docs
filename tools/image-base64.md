---
title: 图片 ↔ Base64
outline: false
---

# 🖼️ 图片 ↔ Base64

- **图 → Base64**：点击选择、拖拽、或直接 <kbd>Ctrl</kbd>+<kbd>V</kbd> 粘贴图片
- 输出 `data URL` / 纯 base64 / CSS `background-image` / HTML `<img>` 四种形式
- **Base64 → 图**：粘 dataURL 或纯 base64 都能识别、预览、下载

::: tip 提示
图片全程在本地处理、不上传任何服务器；base64 编码后体积会比原图**大约多 33%**，超过几十 KB 的图片一般不推荐用 base64 内联。
:::

<ImageBase64Tool />
