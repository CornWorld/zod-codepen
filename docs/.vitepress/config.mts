import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "zod-codepen",
  description: "Serialize Zod schemas to pure Zod code strings at runtime",
  base: '/',
  cleanUrls: true,

  markdown: {
    lineNumbers: false,  // 可以根据需要开启行号
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'zod-codepen' }],
    ['meta', { property: 'og:description', content: 'Serialize Zod schemas to pure Zod code strings' }],
    ['meta', { property: 'og:url', content: 'https://zod-codepen.corn.im' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/serialize' },
      { text: 'Playground', link: '/playground' },
      {
        text: '分包',
        items: [
          { text: 'v3 适配器', link: '/guide/zod-v3' },
          { text: 'v4 适配器', link: '/guide/zod-v4' },
          { text: 'Vite 插件', link: '/guide/vite-plugin' },
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '简介', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '安装', link: '/guide/installation' },
          ]
        },
        {
          text: '核心概念',
          items: [
            { text: '基本用法', link: '/guide/basic-usage' },
            { text: '代码优化', link: '/guide/optimizations' },
            { text: '格式化选项', link: '/guide/formatting' },
            { text: '模块生成', link: '/guide/module-generation' },
          ]
        },
        {
          text: 'Zod 版本',
          items: [
            { text: 'v3 适配器', link: '/guide/zod-v3' },
            { text: 'v4 适配器', link: '/guide/zod-v4' },
            { text: 'v3/v4 差异', link: '/guide/v3-v4-differences' },
          ]
        },
        {
          text: '进阶',
          items: [
            { text: 'Vite Plugin', link: '/guide/vite-plugin' },
            { text: '自定义处理器', link: '/guide/custom-handlers' },
            { text: '支持的类型', link: '/guide/supported-types' },
            { text: '在线 Playground', link: '/playground' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'serialize()', link: '/api/serialize' },
            { text: 'generateModule()', link: '/api/generate-module' },
            { text: 'registerHandler()', link: '/api/register-handler' },
            { text: 'createSerializer()', link: '/api/create-serializer' },
            { text: 'Vite Plugin', link: '/api/vite-plugin' },
          ]
        },
        {
          text: '类型',
          items: [
            { text: 'SerializeOptions', link: '/api/types/serialize-options' },
            { text: 'ZodAdapter', link: '/api/types/zod-adapter' },
            { text: 'SchemaHandler', link: '/api/types/schema-handler' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/CornWorld/zod-codepen' }
    ],

    footer: {
      message: 'Released under the MPL 2.0 License.',
      copyright: 'Copyright © 2025-present <a href="https://github.com/CornWorld">CornWorld</a>'
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换'
            }
          }
        }
      }
    },

    editLink: {
      pattern: 'https://github.com/CornWorld/zod-codepen/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },

    lastUpdated: {
      text: '最后更新于',
    },

    outline: {
      label: '页面导航'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    }
  }
})
