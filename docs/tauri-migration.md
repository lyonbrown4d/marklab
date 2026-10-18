# Tauri 桌面迁移

默认桌面入口已切换为 Tauri 2：React 负责界面，Rust 服务负责文件、持久化、索引、Git、PTY、同步和原生窗口。Node.js 用于前端和构建工具，不随 Tauri 应用作为后端运行时分发。Electron 源码、Node 后端、preload、打包依赖和专用脚本已移除，历史测量保留在 `docs/performance/`。

## 开发和打包

安装 [Tauri 官方平台依赖](https://v2.tauri.app/start/prerequisites/)、Rust 1.99.1 或更新版本、Node.js 24 LTS 和 pnpm 12.11.2，再运行：

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

构建与测试默认使用仓库内 `src-tauri/target`，不把普通 target 输出重定向到临时目录。前端 Chromium 测试通过 `pnpm test:renderer:e2e` 运行，性能入口为 `pnpm test:perf`、`pnpm test:perf:software` 和 `pnpm test:perf:all`；这些测试只验证生产 renderer 与测试夹具，不替代原生窗口验收。当前打包与 Windows 验证边界见[发布说明](release.md)。

## 服务组装

Rust 服务通过 FluxDI 2 的 `static_module` 宏声明依赖。`composition/core.rs` 组装配置、数据库、设置、工作区注册表和分析服务；桌面模块导入同一核心上下文，再组装窗口所需的原生服务。数据库与分析初始化保持异步，文件系统构造通过受控的阻塞任务执行。全部桌面服务解析完成后转为具体的 Tauri `State<T>`，现有命令不通过容器动态查找依赖。

只读 MCP 复用核心模块中的数据库与分析服务，不创建窗口、工作区监听器或桌面句柄。桌面初始化仍在 splash 创建后异步进行。服务组装已通过本轮 Rust 库测试，覆盖共享数据库连接池、具体 Tauri 状态转交、初始化失败后重试和无界面 MCP 组装；实际 WebView 启动另行验收。

## Markdown 编辑能力

Markdown 语言能力由 Rust 内部服务直接提供，不启动 LSP 服务，也不要求复刻 LSP 协议。现有前端通过类型化异步接口调用补全、诊断、大纲、跳转、引用、悬停、快速修复和标题重命名。解析复用 pulldown-cmark，补全匹配复用 strsim；工作区索引、当前未保存内容和 UTF-16 编辑范围沿用现有编辑流程。文件或目录移动后的引用改写也在原生侧完成，保留保存冲突检查。

## AI 与只读 MCP

AI 请求与响应由 Rig 0.44.0 的供应商客户端及 completion 模型处理；应用保留配置、系统凭据库、明确的云端上下文授权、队列、取消和现有 DTO 适配。供应商类型是闭合枚举，支持 OpenAI Responses、Anthropic Messages、Google GenerateContent、DeepSeek、OpenAI-compatible Chat 和本地 Ollama。模型名称仍由用户配置，不新增远端模型目录或聊天业务层。

内联补全继续沿用生成完成后发布结果的原行为，单条结果按前端 UTF-16 长度限制为 512。模型不支持的采样参数会省略并返回解释警告；Anthropic 旧模型的 temperature 上限为 1。探测供应商不重试，普通生成最多重试一次，总超时为 120 秒，所有状态的响应均限制为 4 MiB。凭据不进入前端 DTO 或错误正文。

这些 AI 变更已通过本轮 Rust 测试中的本地 HTTP 供应商协议、超时、重试、响应上限和日志脱敏检查，未使用真实供应商凭据。MCP 使用原生 `marklab-desktop mcp` 子命令和 rmcp stdio，只暴露工作区状态与搜索；SDK 会话和只读搜索测试通过，参数及范围见[工作区分析与 MCP](architecture/node-knowledge-sidecar.md)。

## 文件监听、通知与日志

文件监听使用 [notify](https://github.com/notify-rs/notify) 8.2，以系统原生事件驱动刷新。同一工作区共用一个监听器，事件通过有界通道进入 Tokio，按 120 毫秒合并；队列溢出、事件丢失、重扫标记或无法定位的变更转为完整刷新。每批最多保留 4,096 个不同路径，持续收到事件也会定期让出处理机会。文件读取事件不应使 Git 查询缓存失效，`.git` 的真实变更仍会使其失效。

原生通知沿用总开关、仅后台通知和导出／同步／更新三个分类开关。任一应用窗口在前台时，默认不显示通知；取消或忙碌不发失败通知。点击通知恢复所属窗口，成功导出的通知还可定位文件。macOS 使用 UserNotifications，Windows 使用 Toast 和 COM 激活回调，Linux 使用 freedesktop D-Bus；官方插件无法覆盖所需的桌面关闭和点击行为，因此使用系统 SDK 的 Rust 绑定。Windows 的通知中心点击依赖当前应用进程仍在运行。通知权限和投递失败不改变任务结果，也不阻塞启动。

日志使用 tauri-plugin-log，保留控制台与本地 `main.log`：开发环境记录应用 Debug，打包后记录 Info，第三方库从 Warn 开始。单文件上限 5 MiB，保留一个归档。原生 panic 与前端错误进入相同日志；格式化与脱敏均限制单条记录大小，处理密钥、认证信息、URL 凭据及换行控制字符，退出时刷新日志。

## 缓存与工作区隔离

Rust 内存缓存使用 Moka；缓存键包含对应工作区身份、内容版本或查询条件。同一工作区的多个窗口共享缓冲区和文件监听，关闭其中一个窗口不会停掉其他窗口仍在使用的工作区。编辑器按实际加载的版本保存，发现其他窗口已修改文件时保留草稿并报冲突。

| 缓存                             | 内存预算与过期规则                             | 持久化                                                                    |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| 工作区路径快照                   | 每个共享工作区 16 MiB，30 秒，按版本合并扫描   | 无                                                                        |
| 分析索引、解析结果、图与页面查询 | 分别 64、32、32 MiB；15、15、5 分钟            | SQLite 保存解析结果、FTS 与图数据；按内容哈希校验后复用                   |
| Git 查询                         | 64 MiB，700 毫秒；写操作和文件监听使旧结果失效 | 无                                                                        |
| 网页信息与截图                   | 各 32 MiB，按请求合并；资源权限按窗口重新签发  | PNG 缓存 200 MiB，闲置 24 小时过期；首次延后 30 秒维护，此后每 6 小时维护 |

分析磁盘缓存按逻辑占用控制在 128 MiB、最多 32 个工作区、30 天未访问后清理；SQLite 删除后的空闲页可复用，数据库文件本身不保证立即缩小。缓存损坏或过期时从源文件重建。未保存的编辑内容属于缓冲区状态，不按缓存过期规则淘汰。

预览权限使用的临时文件与源文件分开管理：启动时清理上一进程的遗留副本，每分钟清理过期权限对应的副本，关闭窗口时撤销其权限并删除副本。有效副本的总长度上限为 512 MiB，达到上限时拒绝新增副本，保留已有预览；直接引用的源文件不计入这个预算，也不会被清理。搜索缓存除检查行数外，还核对路径、标题和正文；不一致时扫描源索引，并在下一次持久化时重建。

Typst 引擎在首次导出时发现字体并在进程内复用字体目录，字体文件仍按需读取。正文和图片通过当前任务的输入与资源映射提供，编译成功或失败后清理资源映射；失败不会阻止后续任务重试。单次生成的 Typst 源文本上限为 128 MiB，图片总量上限为 100 MiB、每张 15 MiB；出版任务仍沿用最多 1,000 章、每章 50 张图片的限制。

2026-10-18，在基线 `cb163e0` 推送并完成集成修复后，macOS ARM 使用 `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --test-threads=2` 运行的 187 项库测试全部通过。缓存回归覆盖请求合并、内容更新、损坏恢复、图数据复用与改名失效、延迟旧结果隔离、内存容量与 TTL、磁盘预算，以及同行数 FTS 损坏后的回源与重建。预览副本测试覆盖启动遗留清理、过期删除、目录符号链接隔离和 512 MiB 预算拒绝。语言服务测试覆盖补全、诊断、UTF-16 范围、引用改写、标题内重复目标文本，以及重命名等待期间的源稿变化。其他测试覆盖历史恢复冲突与草稿保留、Git、PTY、同步、资源访问、Typst 任务隔离、中文及 PNG 导出，以及 DOCX 标题与窄页图片比例。新增测试还覆盖原生监听生命周期、事件丢失重扫与批量上限、读取事件不清除 Git 缓存、窗口事件隔离、通知分类与一次性动作、日志 5 MiB 轮转、级别过滤和嵌套 JSON 密钥脱敏。这些库测试不包含实际 WebView、多窗口交互、跨平台运行或性能测量。

## 需要单独验收的行为差异

网页标签仍使用独立原生 WebView。网页截图则使用经过清理的静态 HTML，禁用脚本和外部资源；依赖 JavaScript 或原站样式的页面外观可能与 Electron 截图不同。

本地 PDF 使用 PDF.js 分段传输，原生读取每块 256 KiB；单次 PDF.js 合并请求上限为 128 MiB。预览权限固定文件身份、长度和修改时间，检测到源文件变化后要求重新打开预览。原生预览与大文件交互的结论须以对应版本实际验收记录为准。

## 发布流水线与凭据

`.github/workflows/release.yml` 采用[官方 GitHub Actions 流程](https://v2.tauri.app/distribute/pipelines/github/)和 `tauri-apps/tauri-action@v1`，仅构建 macOS ARM、Windows x64 和 Linux x64。仓库固定为 `lyonbrown4d/marklab`，标签必须为 `app-v<version>`，且 `package.json`、`tauri.conf.json`、`Cargo.toml` 三处版本一致。

流水线保留 `pnpm check` 和逐文件四维 85% 覆盖率门禁；原 Electron 发布回归由生产 renderer 的 Chromium 测试和真实 Rust 库测试承接。各平台运行 Rust 格式、严格 Clippy 和库测试，再构建 Tauri 产物并上传到**草稿 Release**。维护者应在三个构建全部成功、完成原生验收后检查并发布草稿；流水线不会自动公开发布。

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

`Plate performance (software rendering)` 保留原 CI job 名称和数值预算，现使用生产 renderer 的 Playwright Chromium 测试；`renderer-gpu` 与 `software-rendering` 都要求一次预热及五次测量。浏览器中的后端是测试夹具，保存断言不执行 Rust CAS，启动指标不测 Tauri 原生隐藏窗口与 splash。旧 Electron 测量只作为历史证据；当前 Tauri 启动、原生进程内存与平台运行性能须单独采集。现有质量门禁见[质量检查说明](quality-gates.md)。

## 分支原生 CI

`.github/workflows/native.yml` 在 `main`、`codex/**` 分支推送、PR 和手动触发时，分别使用 Linux x64、Windows x64、macOS ARM 本机 runner 执行 Rust 格式检查、严格 Clippy 和 `cargo test --lib`。macOS 显式检查 runner 为 ARM，不增加 Intel 目标；runner 标签依据 [GitHub 官方说明](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

这些库测试覆盖不创建 Tauri 窗口的服务、临时工作区、Git 仓库、同步测试服务器及 Unix PTY；Windows 按源码中的平台条件编译测试。CI 不启动应用事件循环、不安装或发布应用，也不使用签名密钥。它补充现有覆盖率与 Chromium renderer 回归、性能门禁；真实窗口、WebView、安装包及更新仍需独立验收。当前 GitHub 账号被禁用，Actions 无法运行，用户已确认本轮无法恢复；工作流配置不构成三平台成功记录。系统通知授权按本轮授权范围暂不验收，其库测试不能替代操作系统权限与投递验证。

`Plate Performance Gate` 保留手动触发时复用三平台原生检查的配置；普通 PR 和推送不增加这次复用调用，也不触发发布。账号被禁用期间，这不是可执行的验收路径。

## Electron 清理后的验证边界

清理前的完整前端基线已执行：942 个测试文件、5,102 项测试通过，逐文件 lines、functions、statements、branches 四项 85% 门禁通过。该结果只对应清理前工作树；删除旧后端、替换 renderer harness、迁移运行时命名和新增 AI/MCP 之后，需要对最终源码重新执行检查。当前文档不预先将这些新检查记为通过。

2026-10-18，清理后的完整前端覆盖率检查通过：613 个测试文件、3,217 项测试，逐文件四维 85% 门禁全部通过。使用 Node.js 24、单 worker 和进程级防休眠运行，未修改阈值或测试超时。生产 renderer 的 Chromium 冒烟测试 16 项、网站下载匹配测试 10 项通过；macOS ARM 严格 Clippy `--all-targets -- -D warnings` 通过。

同日，真实 Tauri WebDriver 的两项原生流程通过：外部 CLI 工作区的 Plate 输入经 Rust 缓冲区保存到磁盘；第二窗口关闭时完成生产保存流程并清除其 SQLite 会话，原窗口与文件保持隔离。测试使用独立标识、临时数据与工作区，显式检查原生窗口可见和页面完成呈现。驱动需先定位 DOM 光标，再通过标准 element send-keys 输入；此结果不涵盖系统键盘、输入法、交通灯位置或安装更新。性能门禁另行记录，尚不能据此宣称全部验收完成。

本轮清理后，`6423f7f` 的 212 项 Rust 库测试全部通过。测试使用仓库内 `src-tauri/target`，覆盖新增服务组装、AI SDK、MCP、搜索兼容和显示器缩放处理；该结果不代表原生窗口或全部用户流程已验收。

Windows 自定义窗口在本轮仅做静态审查，不执行 Windows 集成验收。已检查无边框窗口配置、标题栏拖动与双击、最小化／最大化／还原、关闭前保存、各窗口事件与订阅清理，以及多显示器位置恢复。最大化状态改为读取原生窗口事件；保存的逻辑尺寸在位置恢复检查中按目标显示器缩放比例换算。相关单元测试通过，静态审查未发现其他待修复问题。跨屏 DPI 切换、原生拖动和系统关闭行为仍未在 Windows 实机验证。

生产 renderer 的 Chromium 测试、真实 Tauri WebDriver 测试与人工原生操作应分别记录，不能相互代替。

## 大文档与标题栏复测

块操作菜单改为打开时挂载 Radix 菜单，保留拖动按钮的 DOM 身份和键盘入口，避免为每个未打开的菜单长期注册全局监听。大文档分批载入时，使用 Plate 的 `normalizeNodeIdWithEditor` 初始化当前批次的块 ID；比较外部内容时忽略缺失或变化的 ID，同时保留其他属性和子节点顺序的差异。真实 Plate 回归已覆盖监听清理、块选择、引用复用和恢复；未降低性能或覆盖率门槛。

最新工作树的完整覆盖率运行耗时 833 秒，612 个测试文件、3,219 项测试通过，22 个覆盖率目标均通过逐文件四维 85% 门槛；`PlateDnd.integration.test.tsx` 因 fork worker 启动超时未执行，命令退出码为 1。随后仅复测该文件，6 项测试在 3.08 秒内通过，未修改测试超时。上述结果分别记录，单次全量命令仍有 worker 启动错误。

性能测试要求可拖动的原生滚动条，并分别记录 DOM 文本选择和 Plate 块选择。一次全选须覆盖夹具的全部 488／4,000 个块，Esc 须清除选择，随后输入与保存须保留正文和哨兵顺序。两个性能项目均移除 headless Chromium 隐藏滚动条的默认参数，并关闭浮动滚动条；这些启动选项不证明硬件加速。本机诊断观察到 SwiftShader，不能把 `renderer-gpu` 的项目名称解释为物理 GPU 或 Tauri WebView 的验收结果。

首次保留原预算、一次预热和五次测量后，软件渲染的两组测试通过，输入 p95 分别为 19.4ms 和 24.0ms。修正原生滚动条前置条件后，`renderer-gpu` 的 4,000 块文档通过；长文本仅第 5 次测量出现两次长任务，累计 3,271ms、最长帧 1,716.7ms，超过 500ms 预算。采样时页面可见且已就绪，没有加载遮罩；当时的记录缺少任务调用栈，该轮结论为三组通过、一组失败。

随后对长文本执行一次临时追踪诊断和一次正式定点复测。诊断的六次滚轮采样均未复现上述秒级任务，追踪无数据丢失；初始化存在一个约 413ms 的 React scheduler 主线程任务。正式定点复测中，滚轮阶段没有长任务，最长帧 33.3ms；首个测量样本的加载长任务累计 564ms，超过 500ms 预算，其余四个样本为 432／422／409／458ms。该组仍失败，旧滚轮停顿根因仍未确定，不修改阈值或删除失败记录。

离线调用栈将初始化热点定位到文档补全索引：`replaceBlocks` 同步分析文本时，`cjkNgrams` 对无汉字文本也展开 `Intl.Segmenter` 的逐字素结果。快速路径在整段不含 Han 字符时直接返回空词组，单词与句子分词保持原样，含汉字文本继续走原逻辑。原实现与优化后实现针对 211 个语料、两种分词器模式的 422 次输出对比全部一致；覆盖 emoji、组合字符、扩展汉字、变体选择符和孤立代理项。补全相关四个文件的 37 项测试经过分组运行全部通过。

优化后重新构建生产 renderer，四组正式门禁全部通过：24 次采集成功，包括四次预热、20 次测量，无采集失败或重试，预算和断言保持原值。长文本在软件／默认 Chromium 配置下的加载长任务最大值分别为 280／245ms；四组滚轮阶段均无长任务、空白帧或加载遮罩回退。默认配置的 4,000 块文档保留了一个 9,830ms 的就绪样本，仍在原 30 秒预算内。旧失败记录完整保留，原秒级滚轮停顿根因仍未确定。测试前另有一次预览启动竞争，未启动浏览器或产生样本；就绪后的正式执行未触发备用服务启动。

同一生产 renderer 随后的 16 项 Chromium 冒烟测试全部通过，覆盖数学与脚注、选择工具栏、IME、缩放与响应式布局、设置、快捷键、只读编辑及工作区隔离；本机预览服务在测试后关闭。

macOS 标题栏的 52px 高度包含 1px 底边框，内容中心为 25.5px。本机隐藏 AppKit 窗口探针测得原生按钮高 14pt、局部中心为 16pt，对应 Wry 垂直 inset 为 27.5pt。窗口改用 `WindowConfig` 同时向 Tao、Wry 写入该位置，避免改标题或切换全屏时两者使用不同配置。探针覆盖布局、尺寸变化和重复应用位置；严格 Clippy、原生编译及独立测试包构建通过。

最终 macOS 测试包完成前台验收：交通灯与标题栏内容居中对齐，进入全屏并通过原生菜单退出后仍对齐。通过系统粘贴和 `⌘S` 保存的标记已在真实 Markdown 文件中确认，原文完整保留；原生退出菜单正常结束进程，退出码为 0。工作区与数据均为临时测试目录，已安装应用保持原样。

同一最新程序的两项真实 Tauri WebDriver 流程再次通过，耗时约 3.5 秒，覆盖 Rust 缓冲保存落盘、第二窗口生产关闭流程及邻接工作区隔离。Debug 测试应用包为 331.15 MiB，位于仓库内 `src-tauri/target`，通过本地临时签名与 `codesign --verify --deep --strict`；未安装或公证，不能用这个包含测试驱动的未优化包推断正式发布体积。
