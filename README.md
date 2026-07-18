# My Obsidian Theme

一个优雅、简洁的 Obsidian 自定义主题，同时支持亮色/暗色模式。

## ✨ 特性

- 🌓 **亮暗双模式** — 完整的亮色和暗色色彩方案
- 🎨 **精致的排版** — 优化标题、引用块、表格、代码块等元素样式
- 🔗 **强调色点缀** — 统一的蓝色强调色，贯穿整个界面
- 📐 **简洁界面** — 圆角标签页、精简状态栏、清晰的视觉层次

## 📦 安装

### 手动安装

1. 下载本仓库
2. 将 `theme.css` 和 `manifest.json` 复制到你的 Obsidian vault 的 `.obsidian/themes/my-theme/` 目录下
3. 在 Obsidian 中进入 **设置 → 外观 → 主题**，选择 **My Obsidian Theme**

### 通过 Git 安装

```bash
cd your-111/.obsidian/themes/
git clone https://github.com/zzzaszz/docs.git my-theme
```

## 🔧 自定义

编辑 `theme.css` 顶部的 CSS 变量即可快速调整配色：

| 变量类别 | 说明 |
|---------|------|
| `--color-base-*` | 基础色阶（背景/文字） |
| `--color-accent-hsl` | 强调色（默认蓝色） |
| `--text-*` | 文字颜色 |
| `--background-*` | 各区域背景色 |

只需修改 `--color-accent-hsl` 的值即可一键更换主题强调色。

## 📸 截图

> **截图占位**：请将你的主题截图放入 `screenshots/` 目录，并替换以下链接。

亮色模式预览：
`![亮色模式](./screenshots/light-mode.png)`

暗色模式预览：
`![暗色模式](./screenshots/dark-mode.png)`

## 📄 许可

MIT License © 2025 caoshi
