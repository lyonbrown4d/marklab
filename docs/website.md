# 官网边界与部署

官网位于 `website/`，是 pnpm workspace 中的独立包 `@marklab/website`。

## 依赖方向

```text
website → Astro / Starlight / Tailwind
desktop → Electron / React / 编辑器与本地服务
```

两者不互相导入运行时代码。官网新增依赖只声明在 `website/package.json`；共享根目录的锁文件、Node 版本和 pnpm 版本约束。

官网使用 Astro 静态输出与 Starlight 文档主题。基础路径为 `/marklab/`，内部链接通过统一的基础路径函数生成。用户文档与工程文档分别维护。

## 自动部署

`.github/workflows/pages.yml` 在以下事件运行：

- `main` 的官网、workspace、锁文件或 Pages 工作流发生修改。
- 对应 Pull Request：构建验证，不部署。
- 正式 Release 发布：从 `main` 重新构建，刷新各平台下载链接。
- 手动触发：仅主分支允许部署。

工作流只安装官网所需依赖，执行页面类型检查和下载解析测试，然后构建、上传 Pages artifact，由独立部署任务发布到 `github-pages` 环境。部署任务才持有 `pages: write` 和 `id-token: write`。

仓库 Settings → Pages 使用 GitHub Actions 作为发布来源。站点地址为 <https://lyonbrown4d.github.io/marklab/>。

## 发布数据

刷新脚本读取最近 100 个 Release，校验并筛选已发布的稳定版本，然后按语义版本排序。每个平台选择首个包含匹配架构安装包的版本。没有匹配文件时显示安装说明，不生成猜测地址。

GitHub API 凭证仅由构建脚本读取，构建后的网页不请求 GitHub API。网站版本信息随部署更新，不修改桌面应用的更新源或发行附件。

同步或构建失败不会覆盖现有站点。可在 Actions 手动重新运行 Website 工作流。需要回退时，在 `main` 回退对应官网提交，再重新部署。
