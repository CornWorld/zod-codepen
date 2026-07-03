import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/',
  cleanUrls: true,
  srcExclude: ['CLAUDE.md'],

  vite: {
    build: {
      rollupOptions: {
        // Dev-only imports, prod uses esm.sh CDN
        external: ['@zod-codepen/zod-v3', '@zod-codepen/zod-v4'],
      },
    },
  },

  markdown: {
    lineNumbers: false,
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

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'zod-codepen',
      description: '将 Zod 模式对象序列化为纯 Zod 代码字符串',
      themeConfig: {
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
                { text: '静态提取', link: '/guide/static-extraction' },
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
                { text: 'castFromAst()', link: '/api/cast-from-ast' },
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
        },

        darkModeSwitchLabel: '外观',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '切换语言',
      }
    },

    en: {
      label: 'English',
      lang: 'en',
      title: 'zod-codepen',
      description: 'Serialize Zod schemas to pure Zod code strings',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'API', link: '/en/api/serialize' },
          { text: 'Playground', link: '/en/playground' },
          {
            text: 'Packages',
            items: [
              { text: 'v3 Adapter', link: '/en/guide/zod-v3' },
              { text: 'v4 Adapter', link: '/en/guide/zod-v4' },
              { text: 'Vite Plugin', link: '/en/guide/vite-plugin' },
            ]
          }
        ],

        sidebar: {
          '/en/guide/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/en/guide/introduction' },
                { text: 'Quick Start', link: '/en/guide/getting-started' },
                { text: 'Installation', link: '/en/guide/installation' },
              ]
            },
            {
              text: 'Core Concepts',
              items: [
                { text: 'Basic Usage', link: '/en/guide/basic-usage' },
                { text: 'Optimizations', link: '/en/guide/optimizations' },
                { text: 'Formatting', link: '/en/guide/formatting' },
                { text: 'Module Generation', link: '/en/guide/module-generation' },
              ]
            },
            {
              text: 'Zod Versions',
              items: [
                { text: 'v3 Adapter', link: '/en/guide/zod-v3' },
                { text: 'v4 Adapter', link: '/en/guide/zod-v4' },
                { text: 'v3/v4 Differences', link: '/en/guide/v3-v4-differences' },
              ]
            },
            {
              text: 'Advanced',
              items: [
                { text: 'Vite Plugin', link: '/en/guide/vite-plugin' },
                { text: 'Static Extraction', link: '/en/guide/static-extraction' },
                { text: 'Custom Handlers', link: '/en/guide/custom-handlers' },
                { text: 'Supported Types', link: '/en/guide/supported-types' },
                { text: 'Online Playground', link: '/en/playground' },
              ]
            }
          ],
          '/en/api/': [
            {
              text: 'API Reference',
              items: [
                { text: 'serialize()', link: '/en/api/serialize' },
                { text: 'generateModule()', link: '/en/api/generate-module' },
                { text: 'castFromAst()', link: '/en/api/cast-from-ast' },
                { text: 'registerHandler()', link: '/en/api/register-handler' },
                { text: 'createSerializer()', link: '/en/api/create-serializer' },
                { text: 'Vite Plugin', link: '/en/api/vite-plugin' },
              ]
            },
            {
              text: 'Types',
              items: [
                { text: 'SerializeOptions', link: '/en/api/types/serialize-options' },
                { text: 'ZodAdapter', link: '/en/api/types/zod-adapter' },
                { text: 'SchemaHandler', link: '/en/api/types/schema-handler' },
              ]
            }
          ]
        },

        search: {
          provider: 'local',
          options: {
            translations: {
              button: {
                buttonText: 'Search',
                buttonAriaLabel: 'Search'
              },
              modal: {
                noResultsText: 'No results found',
                resetButtonTitle: 'Clear search',
                footer: {
                  selectText: 'Select',
                  navigateText: 'Navigate'
                }
              }
            }
          }
        },

        editLink: {
          pattern: 'https://github.com/CornWorld/zod-codepen/edit/main/docs/:path',
          text: 'Edit this page on GitHub'
        },

        lastUpdated: {
          text: 'Last updated',
        },

        outline: {
          label: 'On this page'
        },

        docFooter: {
          prev: 'Previous page',
          next: 'Next page'
        },

        darkModeSwitchLabel: 'Appearance',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Return to top',
        langMenuLabel: 'Change language',
      }
    }
  },

  // Shared themeConfig — both locales inherit these
  themeConfig: {
    logo: '/logo.svg',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/CornWorld/zod-codepen' }
    ],

    footer: {
      message: 'Released under the MPL 2.0 License.',
      copyright: 'Copyright © 2025-present <a href="https://github.com/CornWorld">CornWorld</a>'
    },
  }
})
