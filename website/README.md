# Marklab website

Astro 静态官网与 Starlight 用户指南，部署到 <https://lyonbrown4d.github.io/marklab/>。

## 本地开发

从仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @marklab/website dev
```

打开终端输出的 `/marklab/` 地址。中文首页位于 `/marklab/`，英文首页位于 `/marklab/en/`。

```sh
pnpm --filter @marklab/website check
pnpm --filter @marklab/website test
pnpm --filter @marklab/website build
pnpm --filter @marklab/website preview
```

## 内容与边界

- `src/components/HomePage.astro`：首页布局。
- `src/lib/homeCopy.ts`：中英文首页文案。
- `src/content/docs/guide/` 与 `src/content/docs/en/guide/`：用户指南。
- `src/assets/`：真实应用截图，使用公开示例工作区。
- `src/data/releases.json`：已验证的公开发行版本快照。

官网是独立 workspace，不导入桌面应用的 React、Tauri、IPC 或编辑器运行时代码。所有页面预渲染，托管端只提供静态文件。

维护边界及部署流程见 [docs/website.md](../docs/website.md)。

## 更新下载数据

```sh
pnpm --filter @marklab/website releases:sync
```

这个命令在构建时读取 GitHub Releases，排除草稿和预发布版本，校验官方仓库链接。下载版本按平台分别选择；不会把 GitHub 全局 Latest 当成所有平台的最新版本。

本地构建使用已提交快照，不依赖网络。发布前刷新快照；刷新失败时保留已上线站点。当前通过 `gh-pages` 分支发布，操作步骤与恢复 Actions 自动部署的条件见 [docs/website.md](../docs/website.md)。

如需认证，可通过进程环境或本地 `.env` 设置 `GITHUB_TOKEN`；令牌只用于刷新脚本，不进入页面代码或静态产物。

## 更新截图

截图应来自实际 Tauri 应用，使用公开示例工作区，并记录对应构建版本。可以先运行 `pnpm build:desktop` 构建本机应用，再按[原生验收说明](../docs/quality-gates.md#desktop-smoke-checklist)打开隔离工作区并人工采集。

原 Electron 专用截图脚本已移除。Chromium renderer 测试截图仅用于前端诊断，不能当作原生窗口或系统菜单的产品截图。现有官网图片保留其原始来源；替换前需完成对应版本的界面验收。图片经 Astro 管线压缩为响应式 WebP。
