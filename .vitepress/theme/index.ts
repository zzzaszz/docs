import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'

import ToolGrid from './components/ToolGrid.vue'
import TimezoneTool from './components/TimezoneTool.vue'
import TimestampTool from './components/TimestampTool.vue'
import JsonFormatterTool from './components/JsonFormatterTool.vue'
import ImageBase64Tool from './components/ImageBase64Tool.vue'
import QrCodeTool from './components/QrCodeTool.vue'
import ImageConvertTool from './components/ImageConvertTool.vue'
import UrlBase64Tool from './components/UrlBase64Tool.vue'
import UuidHashJwtTool from './components/UuidHashJwtTool.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ToolGrid', ToolGrid)
    app.component('TimezoneTool', TimezoneTool)
    app.component('TimestampTool', TimestampTool)
    app.component('JsonFormatterTool', JsonFormatterTool)
    app.component('ImageBase64Tool', ImageBase64Tool)
    app.component('QrCodeTool', QrCodeTool)
    app.component('ImageConvertTool', ImageConvertTool)
    app.component('UrlBase64Tool', UrlBase64Tool)
    app.component('UuidHashJwtTool', UuidHashJwtTool)
  }
} satisfies Theme
