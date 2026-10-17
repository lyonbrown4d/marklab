# 官网边界与部署

官网位于 `website/`，是 pnpm workspace 中的独立包 `@marklab/website`。

## 依赖方向

```text
website → Astro / Starlight / Tailwind
desktop → Tauri / Rust / React / 编辑器与本地服务
```

两者不互相导入运行时代码。官网新增依赖只声明在 `website/package.json`；共享根目录的锁文件、Node 版本和 pnpm 版本约束。

官网使用 Astro 静态输出与 Starlight 文档主题。基础路径为 `/marklab/`，内部链接通过统一的基础路径函数生成。用户文档与工程文档分别维护。

## 当前发布方式

站点地址为 <https://lyonbrown4d.github.io/marklab/>。仓库 Settings → Pages 当前使用 `gh-pages` 分支的根目录发布。

GitHub 账号目前无法启动 Actions 工作流，因此先在本地完成构建和检查，再把静态产物推送到 `gh-pages`。`website/public/.nojekyll` 会随构建复制到产物根目录，供 Pages 直接发布。`main` 保存源码，不存放构建产物；只更新 `main` 不会更新当前站点。

更新站点时，从仓库根目录执行：

```sh
pnpm --filter @marklab/website releases:sync
pnpm --filter @marklab/website format:check
pnpm --filter @marklab/website check
pnpm --filter @marklab/website test
pnpm --filter @marklab/website build
```

随后在独立的 `gh-pages` 检出目录中，用 `website/dist/` 的全部内容替换原静态文件，保留该检出目录的 `.git/`，提交并推送。发布提交应注明对应的源码提交。上线后核对首页、图视图、指南、文档搜索和下载链接。

需要回退时，先在源码中回退对应改动，再构建并更新 `gh-pages`；也可以在 `gh-pages` 回退对应发布提交后推送。

## 恢复 Actions 自动部署

账号恢复 Actions 权限后，将 Settings → Pages 的发布来源改为 GitHub Actions，再手动运行 Website 工作流。此后可使用以下自动部署规则。

`.github/workflows/pages.yml` 在以下事件运行：

- `main` 的官网、workspace、锁文件或 Pages 工作流发生修改。
- 对应 Pull Request：构建验证，不部署。
- 正式 Release 发布：从 `main` 重新构建，刷新各平台下载链接。
- 手动触发：仅主分支允许部署。

工作流只安装官网所需依赖，执行页面类型检查和下载解析测试，然后构建、上传 Pages artifact，由独立部署任务发布到 `github-pages` 环境。部署任务才持有 `pages: write` 和 `id-token: write`。

## 发布数据

刷新脚本读取最近 100 个 Release，校验并筛选已发布的稳定版本，然后按语义版本排序。每个平台选择首个包含匹配架构安装包的版本。没有匹配文件时显示安装说明，不生成猜测地址。

GitHub API 凭证仅由构建脚本读取，构建后的网页不请求 GitHub API。网站版本信息随部署更新，不修改桌面应用的更新源或发行附件。

同步或构建失败时，不发布产物，保留现有站点。Actions 方式下可手动重新运行 Website 工作流。
