mod commands;
mod path_safety;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::ws_list,
            commands::ws_list_stash,
            commands::ws_list_drafts,
            commands::ws_list_work,
            commands::ws_read,
            commands::ws_write,
            commands::ws_rename,
            commands::ws_delete,
            commands::ws_stash,
            commands::ws_restore_stash,
            commands::ws_delete_stash,
            commands::ws_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
