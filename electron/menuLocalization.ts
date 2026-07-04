export type NativeMenuLocale = 'zh-CN' | 'en-US'

const nativeMenuLabels = {
  'en-US': {
    app: {
      about: (appName: string) => `About ${appName}`,
      hide: (appName: string) => `Hide ${appName}`,
      hideOthers: 'Hide Others',
      quit: (appName: string) => `Quit ${appName}`,
      services: 'Services',
      showAll: 'Show All',
    },
    edit: {
      copy: 'Copy',
      cut: 'Cut',
      label: 'Edit',
      paste: 'Paste',
      redo: 'Redo',
      selectAll: 'Select All',
      undo: 'Undo',
    },
    file: {
      closeWindow: 'Close Window',
      exportDocx: 'Export to Word...',
      exportHtml: 'Export to HTML...',
      exportPdf: 'Export to PDF...',
      label: 'File',
      newFile: 'New File',
      newWindow: 'New Window',
      openFile: 'Open File...',
      openProject: 'Open Project...',
    },
    help: {
      about: (appName: string) => `About ${appName}`,
      label: 'Help',
    },
    theme: {
      graphite: 'Graphite',
      github: 'GitHub',
      ink: 'Ink',
      ivory: 'Ivory',
      label: 'Theme',
      dark: 'Dark Mode',
      light: 'Light Mode',
      mist: 'Mist',
      nord: 'Nord',
      obsidian: 'Obsidian',
      paper: 'Paper',
      sepia: 'Sepia',
      solarized: 'Solarized',
      system: 'Follow System',
    },
    view: {
      focusMode: 'Toggle Focus Mode',
      graph: 'Graph',
      label: 'View',
      reload: 'Reload',
      rightSidebar: 'Toggle Right Sidebar',
      sidebar: 'Toggle Sidebar',
      source: 'Source',
      typewriterMode: 'Toggle Typewriter Mode',
      devTools: 'Toggle Developer Tools',
      wysiwyg: 'WYSIWYG',
      zenMode: 'Toggle Zen Mode',
    },
  },
  'zh-CN': {
    app: {
      about: (appName: string) => `关于 ${appName}`,
      hide: (appName: string) => `隐藏 ${appName}`,
      hideOthers: '隐藏其他',
      quit: (appName: string) => `退出 ${appName}`,
      services: '服务',
      showAll: '全部显示',
    },
    edit: {
      copy: '复制',
      cut: '剪切',
      label: '编辑',
      paste: '粘贴',
      redo: '重做',
      selectAll: '全选',
      undo: '撤销',
    },
    file: {
      closeWindow: '关闭窗口',
      exportDocx: '导出为 Word...',
      exportHtml: '导出为 HTML...',
      exportPdf: '导出为 PDF...',
      label: '文件',
      newFile: '新建文件',
      newWindow: '新建窗口',
      openFile: '打开文件...',
      openProject: '打开项目...',
    },
    help: {
      about: (appName: string) => `关于 ${appName}`,
      label: '帮助',
    },
    theme: {
      graphite: '石墨',
      github: 'GitHub',
      ink: '墨色',
      ivory: '象牙',
      label: '主题',
      dark: '暗黑模式',
      light: '明亮模式',
      mist: '雾蓝',
      nord: 'Nord',
      obsidian: '黑曜',
      paper: '纸张',
      sepia: '暖褐',
      solarized: 'Solarized',
      system: '跟随系统',
    },
    view: {
      focusMode: '切换 Focus 模式',
      graph: '图谱',
      label: '视图',
      reload: '重新加载',
      rightSidebar: '切换右侧栏',
      sidebar: '切换侧边栏',
      source: '源码',
      typewriterMode: '切换打字机模式',
      devTools: '切换开发者工具',
      wysiwyg: '所见即所得',
      zenMode: '切换 Zen 模式',
    },
  },
} as const

export type NativeMenuLabels = (typeof nativeMenuLabels)[NativeMenuLocale]

export const normalizeNativeMenuLocale = (input?: string | null): NativeMenuLocale => {
  if (!input) return 'en-US'
  const locale = input.toLowerCase()
  if (locale.startsWith('zh')) return 'zh-CN'
  if (locale.startsWith('en')) return 'en-US'
  return 'en-US'
}

export const getNativeMenuLabels = (input?: string | null): NativeMenuLabels => {
  return nativeMenuLabels[normalizeNativeMenuLocale(input)]
}
