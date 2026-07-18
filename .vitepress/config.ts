import { defineConfig } from 'vitepress'

export default defineConfig({

  title: 'ZZZ技术文档',

  description: 'Java Vue SQL 学习笔记',

  base: '/doc/',


  themeConfig: {


    // 顶部导航
    nav: [
      {
        text: '前端',
        link: '/frontend/vue3'
      },
      {
        text: '后端',
        link: '/backend/springboot'
      },
      {
        text: '数据库',
        link: '/sql/mysql'
      }
    ],


    // 左侧目录
    sidebar: {


      '/frontend/': [
        {
          text: '前端相关',
          items: [
            {
              text:'Vue3',
              link:'/frontend/vue3'
            },
            {
              text:'Vite',
              link:'/frontend/vite'
            }
          ]
        }
      ],


      '/backend/': [
        {
          text:'后端相关',
          items:[
            {
              text:'SpringBoot',
              link:'/backend/springboot'
            }
          ]
        }
      ],


      '/sql/':[
        {
          text:'SQL',
          items:[
            {
              text:'MySQL',
              link:'/sql/mysql'
            }
          ]
        }
      ]
    },


    // 右侧大纲
    outline: {
      level: [2,3],
      label:'目录'
    },


    // 搜索
    search:{
      provider:'local'
    },


    socialLinks:[
      {
        icon:'github',
        link:'https://github.com/zzzaszz/docs'
      }
    ]

  }

})