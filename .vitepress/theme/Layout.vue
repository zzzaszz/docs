<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ImageZoom from './components/ImageZoom.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <ImageZoom />
    </template>
  </Layout>
</template>
