import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://lyonbrown4d.github.io',
  base: '/marklab',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Marklab',
      description: 'Markdown 写作、Git 与 Vim 使用指南。',
      favicon: '/marklab/favicon.svg',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
        en: { label: 'English', lang: 'en' },
      },
      sidebar: [
        {
          slug: 'guide/getting-started',
          label: '快速开始',
          translations: { en: 'Getting started' },
        },
        { slug: 'guide/installation', label: '下载与安装', translations: { en: 'Installation' } },
        {
          slug: 'guide/writing',
          label: '写作与工作区',
          translations: { en: 'Writing & workspaces' },
        },
        { slug: 'guide/vim', label: 'Vim 模式', translations: { en: 'Vim mode' } },
        { slug: 'guide/git', label: 'Git 与冲突处理', translations: { en: 'Git & conflicts' } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/lyonbrown4d/marklab' }],
      customCss: ['./src/styles/docs.css'],
      disable404Route: true,
    }),
  ],
  vite: { plugins: [tailwindcss()] },
})
