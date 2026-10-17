# Electron 迁移历史

本页保留原运行时的架构背景。当前应用使用 Tauri 2 和 Rust，Electron 源码、preload、Node 侧车、打包依赖与专用测试入口已移除。当前开发、打包和验收入口见 [Tauri 桌面迁移](tauri-migration.md)及[质量检查](quality-gates.md)。

原 Electron main 负责窗口、菜单、对话框、文件和进程访问；React 通过隔离的 preload 和命名 IPC 访问桌面能力。迁移后，这些职责由 Rust 服务与命名 Tauri commands 承接，前端继续经 `src/services/*` 和 `src/runtime/*` 调用桌面能力。生产 renderer 不获得 Node.js 或通用命令执行能力。

SQLite、索引、语言能力、Git、PTY、WebDAV、导出与缓存均进入 Rust 后端。Tauri 使用独立的应用标识和数据目录，源码构建不读取或自动转换旧 Electron 数据。

[2026-10-13 启动测量](performance/electron-startup-2026-10-13.md)和[2026-10-14 窗口呈现测量](performance/window-presentation-2026-10-14.md)保留当时的数据与环境。这些历史页中的命令只用于解释原测量，不是当前可执行入口，也不证明新运行时的性能。
