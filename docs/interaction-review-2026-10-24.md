# 交互审查记录（2026-10-24）

本轮审查基于主分支 `85600f7c` 及其工作区改动，覆盖编辑、文件导航、预览、设置、终端、AI、同步和导出。结论来自代码追踪、定向测试和渲染器浏览器测试；不代表全部原生窗口和所有平台已完成实际操作验收。

## 已修复

| 场景              | 问题与处理                                                                                   | 实现位置                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 打开本地链接      | 懒加载文件树没有目标节点时误报 404；以当前文件路由状态判断，原生文件检查仍保留               | `src/pages/FilePreviewPage.tsx`                                                                   |
| Markdown 标题链接 | 普通点击保留编辑行为，修饰键点击定位标题；跨文件链接打开文档后定位，异步结果受工作区版本保护 | `src/components/plate/nodes/LinkElement.tsx`、`src/pages/hooks/useWorkspaceLinkNavigation.ts`     |
| 放大预览          | 默认尺寸随窗口计算，支持四边、四角及键盘调整，缩小窗口时限制尺寸                             | `src/components/ui/ResizableDialogContent.tsx`、`useDialogResize.ts`                              |
| Excel 阅读        | 表格填满预览区域；列宽可拖动或双击调整，分页时保留，各工作表独立                             | `src/components/previews/SpreadsheetGrid.tsx`、`SpreadsheetPreviewSurface.tsx`                    |
| 正文宽度          | 增加“标准 / 撑满视图”，默认维持标准宽度；切换时保留编辑器、内容、选区和撤销记录              | `src/components/MarkdownEditor.tsx`、`src/components/settings/ImmersiveSettingsSection.tsx`       |
| 网页登录          | 交互 Webview 使用共享持久数据存储；后台截图工作器继续隔离                                    | `src-tauri/src/web_tabs/create.rs`                                                                |
| 网页预览图        | 页面加载及切换时排队更新截图；防止旧导航、旧工作区和较早请求覆盖新图，缓存按拍摄时间过期     | `src-tauri/src/web_tabs/previews.rs`、`src-tauri/src/link_preview/screenshots.rs`                 |
| 截图资源          | 限制原生截图尺寸与解码内存，缩放保留比例；前端按作用域接收更新并取消旧请求                   | `src-tauri/src/link_preview/capture/`、`src/components/previews/useExternalWebPreviewData.ts`     |
| 文件搜索          | 文件树变化后重新查询；拒绝旧结果，失败时提示并回退当前文件树                                 | `src/components/file-tree/useWorkspaceTreeSearch.ts`                                              |
| 剪切与粘贴        | 异步剪贴板操作绑定原始选区，内容改变、只读或切换文档后取消；写剪贴板失败不删除内容           | `src/components/plate/usePlateEditorContextMenu.ts`                                               |
| 图片说明          | 插入图片使用编辑器与 Markdown 序列化一致的 caption 字段                                      | `src/components/plate/slash/plateSlashUrlInsertion.ts`、`usePlateAssetDrop.ts`                    |
| 失败反馈          | 内嵌预览可重试，系统打开失败可见；避免重复操作和旧请求回写                                   | `src/components/previews/EmbeddedFilePreview.tsx`、`src/pages/FilePreviewPage.tsx`                |
| 图视图内嵌 PDF    | 刷新资源地址时保留有效预览组件，避免丢失用户点击加载的状态                                   | `src/components/previews/EmbeddedFilePreview.tsx`                                                 |
| 网页标签栏        | 去掉顶部 44px 固定留白，收起入口与地址栏共用一行；展开列表浮动显示，并复用原生网页遮挡机制   | `src/components/TabsBar.tsx`、`src/pages/web/WebTabSurface.tsx`                                   |
| 标签关闭          | 关闭按钮的 Enter/Space 不再同时激活父标签                                                    | `src/components/TabsBarTab.tsx`                                                                   |
| 终端              | 终端内 Escape 交给终端，切换语言不重建会话；启动确认前的输出与退出按顺序回放，缓存有上限     | `src/components/TerminalPanel.tsx`、`src/components/terminal/`                                    |
| AI 生成           | 启动确认前到达的事件有界缓存并按请求回放；取消、切文档及卸载后不更新旧界面，阻止重复启动     | `src/components/ai/useAiGenerationEvents.ts`、`src/components/plate/usePlateInlineAiComposer.ts`  |
| 窄屏发布          | 章节、预览与设置通过标签切换，保留选章；错误提示不遮挡导出按钮                               | `src/components/WorkspacePublicationDialog.tsx`                                                   |
| 同步与导出        | 旧保存结果不影响重新打开的表单；导出取消及打开失败可重试，处理重复点击和卸载                 | `src/components/settings/WorkspaceSyncSettingsPage.tsx`、`src/components/ExportStatusOverlay.tsx` |

## 验证边界

- Rust 库测试：318 项全部通过。运行时允许测试服务监听本机回环端口，并保留系统文件监听检查。
- 前端全量：651 个测试文件、3,479 项测试通过，逐文件覆盖率门槛保持不变。网页标签栏追加的 28 项定向检查也通过。
- 最终生产构建及 23 项浏览器回归通过，包括真实 Chromium IME、选区工具栏、表格/光标、本地跳转、Excel 缩放及 640/800/1440 像素发布布局。静态检查、类型检查、格式与 300 有效行限制均通过。
- 定向测试覆盖上述改动的正常、失败、异步失效和取消路径。
- 浏览器回归使用生产渲染器及类型明确的原生命令替身，不启动 Tauri 原生窗口，不访问用户的私有站点，不执行真实导出。
- 原生登录、重启后的 Cookie 保留、网页标签栏与原生网页的叠层，以及 Windows/Linux 原生截图仍需实际环境验收。旧隐私会话的登录信息无法迁移，需要重新登录一次。
- 依赖更新包含前端、网站和 Cargo；保留原生绑定与协议生成工具要求的兼容版本。生成的 IPC 代码仍不纳入 Git。
- SheetJS 保持官方 CDN 的 [0.20.3](https://cdn.sheetjs.com/)；该版本仍是官方列出的当前版本。
