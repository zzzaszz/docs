---
title: JSON 格式化
outline: false
---

# 🧾 JSON 格式化

不严格按 JSON 规范，日常从代码里拷贝出来的乱七八糟数据基本都能吃：

- ✅ 单引号 / 反引号字符串
- ✅ 无引号的 key（`{name: 'foo'}`）
- ✅ `//` 单行注释、`/* */` 块注释、`#` 注释
- ✅ 尾逗号
- ✅ `true/false/null` 之外的 `True/False/None/undefined/NaN/Infinity`
- ✅ 十六进制数字 `0x1a`
- ✅ 前面带 `const x = ...;` 之类的 JS 赋值前缀

<JsonFormatterTool />
