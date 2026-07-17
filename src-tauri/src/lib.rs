mod agent;
mod bundle;
mod db;
mod paths;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Windows does not expose title bar colors via tauri.conf.json, so the native
// caption is themed here to match the app's --background/--foreground palette
// (src/index.css) via the DWM caption/text color attributes (Windows 11+).
#[cfg(target_os = "windows")]
fn apply_titlebar_theme(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR};

    const CAPTION_COLOR: COLORREF = COLORREF(0x00E7E4E4); // #E4E4E7 (zinc-200)
    const TEXT_COLOR: COLORREF = COLORREF(0x00222640); // #402622 (--foreground)

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_CAPTION_COLOR,
                &CAPTION_COLOR as *const _ as *const _,
                std::mem::size_of::<COLORREF>() as u32,
            );
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_TEXT_COLOR,
                &TEXT_COLOR as *const _ as *const _,
                std::mem::size_of::<COLORREF>() as u32,
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = db::init_state(app.handle());
            app.manage(state);

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                apply_titlebar_theme(&window);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            db::db_query,
            db::db_rpc,
            db::storage_upload,
            db::storage_download,
            db::storage_dir_path,
            bundle::validate_course_bundle,
            bundle::import_course_bundle,
            bundle::delete_course_package,
            agent::test_agent_connection,
            agent::agent_chat,
            agent::get_agent_chat_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
