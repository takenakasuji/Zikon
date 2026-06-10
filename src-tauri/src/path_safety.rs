use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("path escapes workspace")]
    Escape,
    #[error("invalid path: {0}")]
    Invalid(String),
}

pub fn resolve_within(workspace: &Path, relative: &str) -> Result<PathBuf, PathError> {
    if relative.contains('\0') {
        return Err(PathError::Invalid("contains null".into()));
    }
    let candidate = workspace.join(relative);
    let normalized = normalize(&candidate);
    if !normalized.starts_with(workspace) {
        return Err(PathError::Escape);
    }
    Ok(normalized)
}

fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_traversal() {
        let ws = Path::new("/tmp/ws");
        assert!(resolve_within(ws, "../etc/passwd").is_err());
        assert!(resolve_within(ws, "a/../../../etc/passwd").is_err());
    }

    #[test]
    fn allows_simple_filename() {
        let ws = Path::new("/tmp/ws");
        let p = resolve_within(ws, "foo.md").unwrap();
        assert_eq!(p, PathBuf::from("/tmp/ws/foo.md"));
    }

    #[test]
    fn allows_stash_subfolder() {
        let ws = Path::new("/tmp/ws");
        let p = resolve_within(ws, ".stash/foo.md").unwrap();
        assert_eq!(p, PathBuf::from("/tmp/ws/.stash/foo.md"));
    }

    #[test]
    fn rejects_null_byte() {
        let ws = Path::new("/tmp/ws");
        assert!(resolve_within(ws, "foo\0.md").is_err());
    }
}
