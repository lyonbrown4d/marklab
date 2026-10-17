# Tauri 桌面迁移

默认桌面入口已切换为 Tauri 2：React 负责界面，Rust 服务负责文件、持久化、索引、Git、PTY、同步和原生窗口。Node.js 用于前端和构建工具，不随 Tauri 应用作为后端运行时分发。Electron 代码与显式脚本暂留，用于回归和性能基线。

## 开发和打包

安装 [Tauri 官方平台依赖](https://v2.tauri.app/start/prerequisites/)、Rust 1.94 或更新版本、Node.js 24 LTS 和 pnpm 12.11.2，再运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

| 命令                                                     | 行为                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm dev` / `pnpm dev:desktop` / `pnpm tauri:dev`       | 启动 Tauri 开发窗口与 Vite                             |
| `pnpm build` / `pnpm build:desktop` / `pnpm tauri:build` | 构建前端和 Rust release 二进制，不打包                 |
| `pnpm package` / `pnpm dist` / `pnpm tauri:bundle`       | 构建后为当前主机打包                                   |
| `pnpm dist:mac`                                          | macOS ARM：`aarch64-apple-darwin`，app 和 dmg          |
| `pnpm dist:win`                                          | Windows x64：`x86_64-pc-windows-msvc`，NSIS 和 MSI     |
| `pnpm dist:linux`                                        | Linux x64：`x86_64-unknown-linux-gnu`，AppImage 和 deb |
| `pnpm build:renderer`                                    | 仅构建 React 与独立 HTML 入口                          |

平台命令应在对应操作系统和本机工具链上执行；这些命令不提供跨平台编译环境。未指定 target 的产物位于 `src-tauri/target/release/`，指定后位于 `src-tauri/target/<target>/release/`，安装包在其 `bundle/` 下。默认 `package` 与 `dist` 使用主机可用的 Tauri bundle 类型。

Electron 基线使用 `pnpm electron:dev`、`pnpm electron:build`、`pnpm electron:package`、`pnpm electron:dist` 和 `pnpm electron:dist:{mac,win,linux}`。原 Windows 证书库签名脚本保留为 `pnpm electron:dist:win:signed`，只用于 Electron。[历史打包说明](release.md)列出其证书要求。

## 缓存与工作区隔离

Rust 内存缓存使用 Moka；缓存键包含对应工作区身份、内容版本或查询条件。同一工作区的多个窗口共享缓冲区和文件监听，关闭其中一个窗口不会停掉其他窗口仍在使用的工作区。编辑器按实际加载的版本保存，发现其他窗口已修改文件时保留草稿并报冲突。

| 缓存                             | 内存预算与过期规则                             | 持久化                                                                    |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| 工作区路径快照                   | 每个共享工作区 16 MiB，30 秒，按版本合并扫描   | 无                                                                        |
| 分析索引、解析结果、图与页面查询 | 分别 64、32、32 MiB；15、15、5 分钟            | SQLite 保存解析结果、FTS 与图数据；按内容哈希校验后复用                   |
| Git 查询                         | 64 MiB，700 毫秒；写操作和文件监听使旧结果失效 | 无                                                                        |
| 网页信息与截图                   | 各 32 MiB，按请求合并；资源权限按窗口重新签发  | PNG 缓存 200 MiB，闲置 24 小时过期；首次延后 30 秒维护，此后每 6 小时维护 |

分析磁盘缓存按逻辑占用控制在 128 MiB、最多 32 个工作区、30 天未访问后清理；SQLite 删除后的空闲页可复用，数据库文件本身不保证立即缩小。缓存损坏或过期时从源文件重建。未保存的编辑内容属于缓冲区状态，不按缓存过期规则淘汰。

Typst 引擎在首次导出时发现字体并在进程内复用字体目录，字体文件仍按需读取。正文和图片通过当前任务的输入与资源映射提供，编译成功或失败后清理资源映射；失败不会阻止后续任务重试。单次生成的 Typst 源文本上限为 128 MiB，图片总量上限为 100 MiB、每张 15 MiB；出版任务仍沿用最多 1,000 章、每章 50 张图片的限制。

2026-10-17，在基线 `cb163e0` 推送并完成集成修复后，macOS ARM 使用 `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --test-threads=2` 运行的 133 项库测试全部通过。分析域 11 项中，7 项缓存回归覆盖请求合并、同长度同修改时间的内容更新、损坏恢复、图数据复用与改名失效、延迟旧结果隔离、内存条目容量与 TTL，以及磁盘过期和逻辑预算清理。其他测试覆盖历史恢复冲突与草稿保留、Git、PTY、同步、资源访问、Typst 任务隔离、中文及 PNG 导出，以及 DOCX 标题与窄页图片比例。这些结果不包含实际 WebView、多窗口交互、跨平台运行或性能测量。

## 需要单独验收的行为差异

网页标签仍使用独立原生 WebView。网页截图则使用经过清理的静态 HTML，禁用脚本和外部资源；依赖 JavaScript 或原站样式的页面外观可能与 Electron 截图不同。

本地 PDF 使用 PDF.js 分段传输，原生读取每块 256 KiB；单次 PDF.js 合并请求上限为 128 MiB。预览权限固定文件身份、长度和修改时间，检测到源文件变化后要求重新打开预览。这些路径仍需在提交基线后做原生验收。

## 发布流水线与凭据

`.github/workflows/release.yml` 采用[官方 GitHub Actions 流程](https://v2.tauri.app/distribute/pipelines/github/)和 `tauri-apps/tauri-action@v1`，仅构建 macOS ARM、Windows x64 和 Linux x64。仓库固定为 `lyonbrown4d/marklab`，标签必须为 `app-v<version>`，且 `package.json`、`tauri.conf.json`、`Cargo.toml` 三处版本一致。

流水线保留原 `pnpm check`、逐文件 85% 覆盖率门禁和 Electron 发布回归检查。各平台增加 Rust 格式与 Clippy 静态检查，再构建 Tauri 产物并上传到**草稿 Release**。维护者应在三个构建全部成功、完成原生验收后检查并发布草稿；流水线不会自动公开发布。

GitHub Actions 需配置以下 secrets；本次迁移不创建、读取或上传真实密钥：

| Secret                                          | 用途                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`                     | Tauri updater 私钥内容，用于签名更新产物       |
| `TAURI_SIGNING_PUBLIC_KEY`                      | 与私钥匹配的公钥内容，注入发布配置             |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`            | 私钥密码；无密码时可留空                       |
| `APPLE_CERTIFICATE`                             | macOS Developer ID 证书的 base64 编码 p12 内容 |
| `APPLE_CERTIFICATE_PASSWORD`                    | p12 密码                                       |
| `APPLE_SIGNING_IDENTITY`                        | macOS 签名身份                                 |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | 公证账号、应用专用密码与团队 ID                |

配置缺失时构建应失败。脚本只把公钥和 endpoint 写到 runner 临时配置，不写入私钥。[macOS 签名和公证](https://v2.tauri.app/distribute/sign/macos/)由 Tauri 官方工具完成。Windows Authenticode 签名尚未配置；updater 签名不能替代操作系统代码签名。

## 自动更新的实际状态

仓库默认配置中的 updater `pubkey` 为空、`endpoints` 为空。本机构建在未提供配置前，更新 UI 返回 unavailable；不能据此宣称自动更新已接通。

发布 CI 在构建时注入公钥并启用 `bundle.createUpdaterArtifacts`，endpoint 为：

```text
https://github.com/lyonbrown4d/marklab/releases/latest/download/latest.json
```

官方 action 汇总更新元数据并上传签名产物。草稿尚未发布时，该 endpoint 不会提供这个版本。必须验证公钥匹配、签名文件、已公开 Release 的 `latest.json`、安装和更新流程后，才算完成更新验收。详见 [Tauri updater 文档](https://v2.tauri.app/plugin/updater/)。

## 静态基线与后续验收

迁移基线 `cb163e0` 已按“静态审查通过 → 提交并推送 → 集成测试 → 新提交修复”的顺序推进。集成检查发现的问题在后续提交修复。源码实现、类型检查和静态编译不代表已验证所有平台运行行为；本机测试使用独立 Tauri 配置和临时工作区，不替换已安装的 Electron 应用，也不执行正式发布。

后续需在各目标系统验证多窗口、工作区切换、保存与取消、Git、PTY、同步、预览、原生菜单、安装包、签名及更新。测试结果应随对应提交记录。Linux/macOS/Windows 的 CI 静态检查也不能代替这些运行验证。

`Plate performance (software rendering)` 仍是 Electron 软件渲染性能基线，其原预算和必需状态检查保持不变。Tauri 的启动、内存和编辑性能尚需单独采集；不能用该 Electron 结果代替 Tauri 性能验收。现有质量门禁见[质量检查说明](quality-gates.md)。

## 分支原生 CI

`.github/workflows/native.yml` 在 `main`、`codex/**` 分支推送、PR 和手动触发时，分别使用 Linux x64、Windows x64、macOS ARM 本机 runner 执行 Rust 格式检查、严格 Clippy 和 `cargo test --lib`。macOS 显式检查 runner 为 ARM，不增加 Intel 目标；runner 标签依据 [GitHub 官方说明](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

这些库测试覆盖不创建 Tauri 窗口的服务、临时工作区、Git 仓库、同步测试服务器及 Unix PTY；Windows 按源码中的平台条件编译测试。CI 不启动应用事件循环、不安装或发布应用，也不使用签名密钥。它补充现有覆盖率、Electron 回归和性能门禁；真实窗口、WebView、安装包及更新仍需独立验收。工作流配置已静态解析，实际三平台结果以推送后的 Actions 记录为准。
