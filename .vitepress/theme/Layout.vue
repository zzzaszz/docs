<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ImageZoom from './components/ImageZoom.vue'
import HeadingCollapse from './components/HeadingCollapse.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <ImageZoom />
      <HeadingCollapse />
    </template>
  </Layout>
</template>
