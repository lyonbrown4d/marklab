# 工作区分析与原 Node 侧车迁移

原 Electron `utilityProcess` 和 Node 知识侧车已移除。本页保留旧链接入口，说明当前由 Rust 承接的边界；不再分发 `dist-electron`、Node MCP 入口或嵌入式 Markdown LSP。

## 当前职责

`src-tauri/src/workspace` 负责规范化根路径、共享缓冲区、文件变更、保存冲突与原生监听；`analysis` 负责 Markdown 元数据、搜索、图、页面和文档洞察；`language` 提供补全、诊断、符号、跳转、引用、悬停与安全重命名。Markdown 解析复用 pulldown-cmark，搜索复用 SQLite FTS5。React 服务通过现有类型化异步命令访问这些结果。

同根窗口共享工作区对象，绑定与 mutation guard 防止旧窗口请求修改已切换的工作区。分析缓存包含内容版本、路径和工作区身份；磁盘缓存损坏后回源重建，用户文档仍是业务源。容量与过期规则见 [Tauri 缓存说明](../tauri-migration.md#缓存与工作区隔离)。

## 原生 MCP

同一个原生可执行文件提供 `mcp` 子命令，使用 rmcp 3.5.1 的 stdio transport。它绑定一个明确工作区，不读取 UI 当前窗口的工作区：

```text
marklab-desktop mcp --workspace-root <existing-directory> --engine-data-dir <existing-directory> --default-search-limit 10
```

macOS 应用内可执行文件为 `Marklab.app/Contents/MacOS/marklab-desktop`，Windows 为 `marklab-desktop.exe`。显式参数优先于 `MARKLAB_MCP_WORKSPACE_ROOT`、`MARKLAB_MCP_ENGINE_DATA_DIR` 和 `MARKLAB_MCP_DEFAULT_SEARCH_LIMIT`；默认搜索条数为 10，可选范围为 1–50。未知或重复参数被拒绝。

只暴露两个工具：`marklab_workspace_status` 与 `marklab_search_workspace`。源文档只读；指定的 engine data 目录允许维护 `tauri-storage/marklab.sqlite` 缓存，不读取旧 Node SQLite 数据。状态返回的字节数表示该工作区缓存的逻辑占用，不是共享数据库的物理长度。

## 检查范围

```bash
pnpm test:knowledge:integration
pnpm tauri:test --lib language::
pnpm tauri:test --lib mcp::
```

这些命令检查原生库和临时工作区，不启动应用事件循环。MCP 新实现的测试结果须以对应源码的实际执行记录为准；不能沿用旧 Node 测试或更早的 Rust 基线宣布通过。真实 WebView 与多窗口界面另按[桌面检查表](../quality-gates.md#desktop-smoke-checklist)验收。
