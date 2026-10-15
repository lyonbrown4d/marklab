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

官网是独立 workspace，不导入桌面应用的 React、Electron、IPC 或编辑器运行时代码。所有页面预渲染，托管端只提供静态文件。

维护边界及部署流程见 [docs/website.md](../docs/website.md)。

## 更新下载数据

```sh
pnpm --filter @marklab/website releases:sync
```

这个命令在构建时读取 GitHub Releases，排除草稿和预发布版本，校验官方仓库链接。下载版本按平台分别选择；不会把 GitHub 全局 Latest 当成所有平台的最新版本。

本地构建使用已提交快照，不依赖网络。发布前刷新快照；刷新失败时保留已上线站点。当前通过 `gh-pages` 分支发布，操作步骤与恢复 Actions 自动部署的条件见 [docs/website.md](../docs/website.md)。

如需认证，可通过进程环境或本地 `.env` 设置 `GITHUB_TOKEN`；令牌只用于刷新脚本，不进入页面代码或静态产物。

## 更新截图

先构建桌面应用，然后从根目录执行：

```sh
pnpm build:desktop
pnpm test:electron:run website-assets.spec.ts
```

脚本创建独立示例笔记和 Git 仓库，使用隔离 Electron 配置生成截图并清理临时工作区。截图经 Astro 图片管线压缩为响应式 WebP。
