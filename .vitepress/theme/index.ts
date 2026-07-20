import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'

import ToolGrid from './components/ToolGrid.vue'
import TimezoneTool from './components/TimezoneTool.vue'
import TimestampTool from './components/TimestampTool.vue'
import JsonFormatterTool from './components/JsonFormatterTool.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ToolGrid', ToolGrid)
    app.component('TimezoneTool', TimezoneTool)
    app.component('TimestampTool', TimestampTool)
    app.component('JsonFormatterTool', JsonFormatterTool)
  }
} satisfies Theme
