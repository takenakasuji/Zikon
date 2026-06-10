use crate::workspace::{
    delete_document, delete_stash, list_draft_files, list_markdown_files, list_stash_files,
    list_work_files, read_document, rename_document, restore_stash, stash_document, write_document,
    FileEntry,
};
use std::path::PathBuf;

#[tauri::command]
pub fn ws_list(workspace: String) -> Result<Vec<FileEntry>, String> {
    list_markdown_files(&PathBuf::from(&workspace)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_list_stash(workspace: String) -> Result<Vec<FileEntry>, String> {
    list_stash_files(&PathBuf::from(&workspace)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_list_drafts(workspace: String) -> Result<Vec<FileEntry>, String> {
    list_draft_files(&PathBuf::from(&workspace)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_list_work(workspace: String) -> Result<Vec<FileEntry>, String> {
    list_work_files(&PathBuf::from(&workspace)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_read(workspace: String, name: String) -> Result<String, String> {
    read_document(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_write(workspace: String, name: String, content: String) -> Result<(), String> {
    write_document(&PathBuf::from(&workspace), &name, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_rename(workspace: String, from: String, to: String) -> Result<(), String> {
    rename_document(&PathBuf::from(&workspace), &from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_delete(workspace: String, name: String) -> Result<(), String> {
    delete_document(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_stash(workspace: String, name: String) -> Result<String, String> {
    stash_document(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_restore_stash(workspace: String, name: String) -> Result<String, String> {
    restore_stash(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_delete_stash(workspace: String, name: String) -> Result<(), String> {
    delete_stash(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_search(workspace: String, query: String) -> Result<Vec<crate::workspace::SearchHit>, String> {
    crate::workspace::search_documents(&PathBuf::from(&workspace), &query).map_err(|e| e.to_string())
}
