use super::menus::{MenuState, focused, refresh_shortcuts};
use crate::error::{BackendError, BackendResult};
use tauri::{
  AppHandle, Manager,
  menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
};
pub fn install(app: &AppHandle, locale: &str) -> BackendResult<super::policy::MenuLocale> {
  let locale = super::policy::normalize_locale(locale);
  let zh = locale == super::policy::MenuLocale::ZhCn;
  let menu = Menu::new(app)?;
  let mut shortcuts = Vec::new();
  let text = |english: &'static str, chinese: &'static str| if zh { chinese } else { english };
  let build = |label: &str,
               values: &[(&str, &str, Option<&str>)],
               shortcuts: &mut Vec<(MenuItem<tauri::DynRuntime>, String)>|
   -> BackendResult<Submenu<tauri::DynRuntime>> {
    let section = Submenu::new(app, label, true)?;
    for (id, label, accelerator) in values {
      if *id == "separator" {
        section.append(&PredefinedMenuItem::separator(app)?)?;
        continue;
      }
      let item = MenuItem::with_id(app, *id, *label, true, *accelerator)?;
      if let Some(accelerator) = accelerator {
        shortcuts.push((item.clone(), accelerator.to_string()));
      }
      section.append(&item)?;
    }
    Ok(section)
  };
  #[cfg(target_os = "macos")]
  {
    let application = Submenu::new(app, "Marklab", true)?;
    application.append(&MenuItem::with_id(
      app,
      "help.about",
      text("About Marklab", "关于 Marklab"),
      true,
      None::<&str>,
    )?)?;
    application.append(&PredefinedMenuItem::separator(app)?)?;
    application.append(&PredefinedMenuItem::services(
      app,
      Some(text("Services", "服务")),
    )?)?;
    application.append(&PredefinedMenuItem::separator(app)?)?;
    application.append(&PredefinedMenuItem::hide(
      app,
      Some(text("Hide Marklab", "隐藏 Marklab")),
    )?)?;
    application.append(&PredefinedMenuItem::hide_others(
      app,
      Some(text("Hide Others", "隐藏其他")),
    )?)?;
    application.append(&PredefinedMenuItem::show_all(
      app,
      Some(text("Show All", "全部显示")),
    )?)?;
    application.append(&PredefinedMenuItem::separator(app)?)?;
    let quit = MenuItem::with_id(
      app,
      "app.quit",
      text("Quit Marklab", "退出 Marklab"),
      true,
      Some("CmdOrCtrl+Q"),
    )?;
    shortcuts.push((quit.clone(), "CmdOrCtrl+Q".into()));
    application.append(&quit)?;
    menu.append(&application)?;
  }
  let file = build(
    text("File", "文件"),
    &[
      (
        "window.open_current_workspace_in_new_window",
        text("New Window", "新建窗口"),
        Some("CmdOrCtrl+Shift+N"),
      ),
      ("separator", "", None),
      (
        "file.open_project",
        text("Open Project...", "打开项目..."),
        Some("CmdOrCtrl+O"),
      ),
      (
        "file.open_file",
        text("Open File...", "打开文件..."),
        Some("CmdOrCtrl+Shift+O"),
      ),
      ("separator", "", None),
      (
        "file.new",
        text("New File", "新建文件"),
        Some("CmdOrCtrl+N"),
      ),
      ("separator", "", None),
      (
        "file.export_workspace",
        text("Export Workspace...", "导出工作区..."),
        None,
      ),
      (
        "file.export_pdf",
        text("Export to PDF...", "导出为 PDF..."),
        None,
      ),
      (
        "file.export_docx",
        text("Export to Word...", "导出为 Word..."),
        None,
      ),
      (
        "file.export_html",
        text("Export to HTML...", "导出为 HTML..."),
        None,
      ),
      (
        "file.export_epub",
        text("Export to EPUB...", "导出为 EPUB..."),
        None,
      ),
      (
        "file.export_txt",
        text("Export to TXT...", "导出为 TXT..."),
        None,
      ),
      (
        if cfg!(target_os = "macos") {
          "window.close"
        } else {
          "app.quit"
        },
        if cfg!(target_os = "macos") {
          text("Close Window", "关闭窗口")
        } else {
          text("Quit Marklab", "退出 Marklab")
        },
        Some(if cfg!(target_os = "macos") {
          "CmdOrCtrl+W"
        } else {
          "Ctrl+Q"
        }),
      ),
    ],
    &mut shortcuts,
  )?;
  menu.append(&file)?;
  let edit = build(
    text("Edit", "编辑"),
    &[
      ("edit.undo", text("Undo", "撤销"), Some("CmdOrCtrl+Z")),
      (
        "edit.redo",
        text("Redo", "重做"),
        Some(if cfg!(target_os = "macos") {
          "CmdOrCtrl+Shift+Z"
        } else {
          "Ctrl+Y"
        }),
      ),
      ("separator", "", None),
      ("edit.cut", text("Cut", "剪切"), Some("CmdOrCtrl+X")),
      ("edit.copy", text("Copy", "复制"), Some("CmdOrCtrl+C")),
      ("edit.paste", text("Paste", "粘贴"), Some("CmdOrCtrl+V")),
      ("separator", "", None),
      (
        "edit.select_all",
        text("Select All", "全选"),
        Some("CmdOrCtrl+A"),
      ),
    ],
    &mut shortcuts,
  )?;
  menu.append(&edit)?;
  let view = build(
    text("View", "视图"),
    &[
      ("view.wysiwyg", text("WYSIWYG", "所见即所得"), None),
      ("view.source", text("Source", "源码"), None),
      ("separator", "", None),
      (
        "view.toggle_sidebar",
        text("Toggle Sidebar", "切换侧边栏"),
        None,
      ),
      (
        "view.toggle_right_sidebar",
        text("Toggle Right Sidebar", "切换右侧栏"),
        None,
      ),
      ("separator", "", None),
      (
        "view.toggle_zen_mode",
        text("Toggle Zen Mode", "切换 Zen 模式"),
        None,
      ),
      (
        "view.toggle_focus_mode",
        text("Toggle Focus Mode", "切换 Focus 模式"),
        None,
      ),
      (
        "view.toggle_typewriter_mode",
        text("Toggle Typewriter Mode", "切换打字机模式"),
        None,
      ),
      (
        "view.toggle_fullscreen",
        text("Toggle Fullscreen", "切换全屏"),
        Some(if cfg!(target_os = "macos") {
          "Ctrl+Super+F"
        } else {
          "F11"
        }),
      ),
    ],
    &mut shortcuts,
  )?;
  menu.append(&view)?;
  let theme = build(
    text("Theme", "主题"),
    &[
      ("theme-mode.system", text("Follow System", "跟随系统"), None),
      ("theme-mode.light", text("Light Mode", "明亮模式"), None),
      ("theme-mode.dark", text("Dark Mode", "暗黑模式"), None),
      ("separator", "", None),
      ("theme.paper", text("Paper", "纸张"), None),
      ("theme.ivory", text("Ivory", "象牙"), None),
      ("theme.sepia", text("Sepia", "暖褐"), None),
      ("theme.github", "GitHub", None),
      ("theme.solarized", "Solarized", None),
      ("theme.mist", text("Mist", "雾蓝"), None),
      ("theme.ink", text("Ink", "墨色"), None),
      ("theme.graphite", text("Graphite", "石墨"), None),
      ("theme.nord", "Nord", None),
      ("theme.obsidian", text("Obsidian", "黑曜"), None),
    ],
    &mut shortcuts,
  )?;
  menu.append(&theme)?;
  menu.append(&build(
    text("Help", "帮助"),
    &[("help.about", text("About Marklab", "关于 Marklab"), None)],
    &mut shortcuts,
  )?)?;
  app.set_menu(menu)?;
  // Rebuilt GTK menus need no_show_all too, so presenting a window cannot
  // restore a second menu above the renderer's Linux chrome.
  #[cfg(target_os = "linux")]
  for window in app.windows().values() {
    super::window_chrome::align(window);
  }
  let state = app.state::<MenuState>();
  *state
    .items
    .lock()
    .map_err(|_| BackendError::new("MENU_ERROR", "Menu state is unavailable"))? = shortcuts;
  *state
    .locale
    .lock()
    .map_err(|_| BackendError::new("MENU_ERROR", "Menu state is unavailable"))? =
    locale.as_str().into();
  if let Some(window) = focused(app) {
    refresh_shortcuts(app, window.label())?;
  }
  Ok(locale)
}
