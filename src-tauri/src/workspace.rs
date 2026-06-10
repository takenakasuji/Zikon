use crate::path_safety::resolve_within;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub title: String,
    pub mtime_ms: u128,
}

#[derive(Debug, thiserror::Error)]
pub enum WsError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("path: {0}")]
    Path(#[from] crate::path_safety::PathError),
    #[error("not found")]
    NotFound,
    #[error("destination already exists")]
    AlreadyExists,
}

const STASH_DIR: &str = ".stash";
const DRAFTS_DIR: &str = ".drafts";
const WORK_DIR: &str = ".work";
const TITLE_PEEK_BYTES: usize = 4096;

fn extract_first_h1(content: &str) -> String {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("# ") {
            return rest.trim().to_string();
        }
    }
    String::new()
}

pub fn list_markdown_files(workspace: &Path) -> Result<Vec<FileEntry>, WsError> {
    if !workspace.exists() {
        return Err(WsError::NotFound);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(workspace)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".md") { continue; }
        if name.starts_with('.') { continue; }

        let mtime_ms = entry.metadata()?.modified()?
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();

        let title = peek_title(&path)?;
        out.push(FileEntry { name, title, mtime_ms });
    }
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    Ok(out)
}

pub fn list_draft_files(workspace: &Path) -> Result<Vec<FileEntry>, WsError> {
    list_in_subdir(workspace, DRAFTS_DIR)
}

pub fn list_stash_files(workspace: &Path) -> Result<Vec<FileEntry>, WsError> {
    list_in_subdir(workspace, STASH_DIR)
}

pub fn list_work_files(workspace: &Path) -> Result<Vec<FileEntry>, WsError> {
    list_in_subdir(workspace, WORK_DIR)
}

fn list_in_subdir(workspace: &Path, subdir: &str) -> Result<Vec<FileEntry>, WsError> {
    let dir = workspace.join(subdir);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".md") { continue; }
        let mtime_ms = entry.metadata()?.modified()?
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
        let title = peek_title(&path)?;
        out.push(FileEntry { name, title, mtime_ms });
    }
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    Ok(out)
}

fn peek_title(path: &Path) -> Result<String, WsError> {
    use std::io::Read;
    let mut f = fs::File::open(path)?;
    let mut buf = vec![0u8; TITLE_PEEK_BYTES];
    let n = f.read(&mut buf)?;
    let text = String::from_utf8_lossy(&buf[..n]);
    Ok(extract_first_h1(&text))
}

pub fn read_document(workspace: &Path, name: &str) -> Result<String, WsError> {
    let path = resolve_within(workspace, name)?;
    Ok(fs::read_to_string(path)?)
}

pub fn write_document(workspace: &Path, name: &str, content: &str) -> Result<(), WsError> {
    let path = resolve_within(workspace, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    Ok(())
}

pub fn rename_document(workspace: &Path, from: &str, to: &str) -> Result<(), WsError> {
    let src = resolve_within(workspace, from)?;
    let dst = resolve_within(workspace, to)?;
    if src != dst && dst.exists() {
        return Err(WsError::AlreadyExists);
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(src, dst)?;
    Ok(())
}

pub fn delete_document(workspace: &Path, name: &str) -> Result<(), WsError> {
    let path = resolve_within(workspace, name)?;
    fs::remove_file(path)?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchHit {
    pub name: String,
    pub mtime_ms: u128,
    pub state: String, // "saved" | "draft"
}

/// ファイル名から検索対象のタイトル部分を取り出す（末尾の `_<id>.md` を除去）。
/// id は buildFilename と同じく [0-9a-z-]{6,}。
fn title_haystack(name: &str) -> String {
    let stem = name.strip_suffix(".md").unwrap_or(name);
    if let Some(idx) = stem.rfind('_') {
        let id = &stem[idx + 1..];
        if id.len() >= 6 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            return stem[..idx].to_string();
        }
    }
    stem.to_string()
}

fn search_in(dir: &Path, state: &str, q: &str, skip_hidden: bool, out: &mut Vec<SearchHit>) -> Result<(), WsError> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".md") { continue; }
        if skip_hidden && name.starts_with('.') { continue; }
        let content = fs::read_to_string(&path).unwrap_or_default();
        if title_haystack(&name).to_lowercase().contains(q) || content.to_lowercase().contains(q) {
            let mtime_ms = entry.metadata()?.modified()?
                .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
            out.push(SearchHit { name, mtime_ms, state: state.to_string() });
        }
    }
    Ok(())
}

pub fn search_documents(workspace: &Path, query: &str) -> Result<Vec<SearchHit>, WsError> {
    if !workspace.exists() {
        return Err(WsError::NotFound);
    }
    let q = query.to_lowercase();
    let mut out = Vec::new();
    if q.trim().is_empty() {
        return Ok(out);
    }
    // ドキュメントはすべてワークスペース直下にあるため、ルートのみを検索する。
    // （旧 .drafts/ は廃止。残存ファイルを返しても root として開けず開けない結果になるため走査しない）
    search_in(workspace, "saved", &q, true, &mut out)?;
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    Ok(out)
}

pub fn stash_document(workspace: &Path, name: &str) -> Result<String, WsError> {
    let stash = workspace.join(STASH_DIR);
    fs::create_dir_all(&stash)?;
    let dst_name = format!("{}/{}", STASH_DIR, name);
    rename_document(workspace, name, &dst_name)?;
    Ok(dst_name)
}

pub fn restore_stash(workspace: &Path, stashed_name: &str) -> Result<String, WsError> {
    let src = format!("{}/{}", STASH_DIR, stashed_name);
    rename_document(workspace, &src, stashed_name)?;
    Ok(stashed_name.to_string())
}

pub fn delete_stash(workspace: &Path, stashed_name: &str) -> Result<(), WsError> {
    let path = resolve_within(workspace, &format!("{}/{}", STASH_DIR, stashed_name))?;
    fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_and_read_roundtrip() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "hello_abc123.md", "# Hello\nworld").unwrap();
        let read = read_document(dir.path(), "hello_abc123.md").unwrap();
        assert_eq!(read, "# Hello\nworld");
    }

    #[test]
    fn list_returns_md_files_sorted_by_mtime() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "a_aaaaaa.md", "# A").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        write_document(dir.path(), "b_bbbbbb.md", "# B").unwrap();
        let files = list_markdown_files(dir.path()).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "b_bbbbbb.md");
        assert_eq!(files[0].title, "B");
        assert_eq!(files[1].name, "a_aaaaaa.md");
    }

    #[test]
    fn list_excludes_hidden_files() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "visible_aaaaaa.md", "# V").unwrap();
        std::fs::create_dir_all(dir.path().join(".stash")).unwrap();
        std::fs::write(dir.path().join(".stash/hidden_bbbbbb.md"), "# H").unwrap();
        let files = list_markdown_files(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "visible_aaaaaa.md");
    }

    #[test]
    fn rename_moves_file() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "old_aaaaaa.md", "x").unwrap();
        rename_document(dir.path(), "old_aaaaaa.md", "new_bbbbbb.md").unwrap();
        assert!(read_document(dir.path(), "old_aaaaaa.md").is_err());
        assert_eq!(read_document(dir.path(), "new_bbbbbb.md").unwrap(), "x");
    }

    #[test]
    fn stash_and_restore_roundtrip() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "doc_aaaaaa.md", "stash me").unwrap();
        stash_document(dir.path(), "doc_aaaaaa.md").unwrap();
        assert!(dir.path().join(".stash/doc_aaaaaa.md").exists());
        let stash = list_stash_files(dir.path()).unwrap();
        assert_eq!(stash.len(), 1);
        restore_stash(dir.path(), "doc_aaaaaa.md").unwrap();
        // restored files land in the workspace root
        assert!(dir.path().join("doc_aaaaaa.md").exists());
        assert!(!dir.path().join(".stash/doc_aaaaaa.md").exists());
    }

    #[test]
    fn list_draft_files_lists_drafts() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join(".drafts")).unwrap();
        std::fs::write(dir.path().join(".drafts/x_aaaaaa.md"), "# X").unwrap();
        let drafts = list_draft_files(dir.path()).unwrap();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].name, "x_aaaaaa.md");
        assert_eq!(drafts[0].title, "X");
    }

    #[test]
    fn rejects_path_escape() {
        let dir = TempDir::new().unwrap();
        assert!(read_document(dir.path(), "../etc/passwd").is_err());
        assert!(write_document(dir.path(), "../bad.md", "x").is_err());
    }

    #[test]
    fn peek_title_reads_first_h1() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "doc_aaaaaa.md", "## sub\n# Title\nbody").unwrap();
        let files = list_markdown_files(dir.path()).unwrap();
        assert_eq!(files[0].title, "Title");
    }

    #[test]
    fn search_matches_title_and_body() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "Alpha_aaaaaa.md", "# Alpha\nthe quick brown fox").unwrap();
        write_document(dir.path(), "Beta_bbbbbb.md", "# Beta\nlazy dog").unwrap();

        let hits = search_documents(dir.path(), "FOX").unwrap();
        let names: Vec<_> = hits.iter().map(|h| h.name.as_str()).collect();
        assert!(names.contains(&"Alpha_aaaaaa.md"));
        assert!(!names.contains(&"Beta_bbbbbb.md"));

        let hits2 = search_documents(dir.path(), "beta").unwrap();
        assert_eq!(hits2.len(), 1);
        assert_eq!(hits2[0].name, "Beta_bbbbbb.md");
        assert_eq!(hits2[0].state, "saved");

        // 廃止された .drafts/ は検索しない（root として開けない結果を返さない）
        std::fs::create_dir_all(dir.path().join(".drafts")).unwrap();
        std::fs::write(dir.path().join(".drafts/Draft_cccccc.md"), "# Draft\nfox in drafts").unwrap();
        let hits3 = search_documents(dir.path(), "drafts").unwrap();
        assert!(hits3.is_empty());

        // ".md" 拡張子はマッチしない（タイトル部分のみ対象）
        let hits_md = search_documents(dir.path(), "md").unwrap();
        assert!(hits_md.is_empty());
    }

    #[test]
    fn rename_refuses_to_overwrite_existing_destination() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "a_aaaaaa.md", "AAA").unwrap();
        write_document(dir.path(), "b_bbbbbb.md", "BBB").unwrap();
        // b が既に存在する場所へ a を rename → 拒否され、b は無傷
        let res = rename_document(dir.path(), "a_aaaaaa.md", "b_bbbbbb.md");
        assert!(res.is_err());
        assert_eq!(read_document(dir.path(), "b_bbbbbb.md").unwrap(), "BBB");
        assert_eq!(read_document(dir.path(), "a_aaaaaa.md").unwrap(), "AAA");
    }
}
