use anyhow::Result;
use git2::{Config, Repository};
use std::process::Command;
use tracing::{debug, info, warn};

/// Helper to handle commit signing with GPG
pub struct CommitSigner {
    enabled: bool,
    signing_key: Option<String>,
    gpg_program: String,
}

impl CommitSigner {
    /// Create a new CommitSigner from repository configuration
    pub fn from_repo(repo: &Repository) -> Result<Self> {
        // Try to get the repository config
        let config = match repo.config() {
            Ok(config) => config,
            Err(e) => {
                debug!("Could not read repository config: {}", e);
                return Ok(Self {
                    enabled: false,
                    signing_key: None,
                    gpg_program: "gpg".to_string(),
                });
            }
        };

        Self::from_config(&config)
    }

    /// Create a new CommitSigner from git config
    pub fn from_config(config: &Config) -> Result<Self> {
        // Check if commit signing is enabled
        let enabled = config
            .get_bool("commit.gpgsign")
            .unwrap_or(false);

        if !enabled {
            debug!("Commit signing is not enabled (commit.gpgsign = false)");
            return Ok(Self {
                enabled: false,
                signing_key: None,
                gpg_program: "gpg".to_string(),
            });
        }

        // Get the signing key
        let signing_key = config
            .get_string("user.signingkey")
            .ok();

        // Get the GPG program to use (defaults to "gpg")
        let gpg_program = config
            .get_string("gpg.program")
            .unwrap_or_else(|_| "gpg".to_string());

        if signing_key.is_none() {
            warn!("Commit signing is enabled but no signing key is configured (user.signingkey)");
        }

        Ok(Self {
            enabled,
            signing_key,
            gpg_program,
        })
    }

    /// Check if commit signing is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled && self.signing_key.is_some()
    }

    /// Sign a commit buffer with GPG using external command
    pub fn sign_commit(&self, commit_buffer: &str) -> Result<Option<String>> {
        if !self.is_enabled() {
            return Ok(None);
        }

        let signing_key = match &self.signing_key {
            Some(key) => key,
            None => return Ok(None),
        };

        // Try to sign with GPG using external command
        match self.gpg_sign_command(commit_buffer, signing_key) {
            Ok(signature) => {
                info!("Successfully signed commit with GPG key: {}", signing_key);
                Ok(Some(signature))
            }
            Err(e) => {
                warn!("Failed to sign commit with GPG: {}. Proceeding without signature.", e);
                Ok(None)
            }
        }
    }

    /// Sign a string with GPG using external command
    fn gpg_sign_command(&self, content: &str, signing_key: &str) -> Result<String> {
        // Use the GPG command to sign the content
        let output = Command::new(&self.gpg_program)
            .arg("--status-fd=2")
            .arg("--no-tty")
            .arg("--armor")
            .arg("--detach-sign")
            .arg("--local-user")
            .arg(signing_key)
            .arg("-")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                if let Some(mut stdin) = child.stdin.take() {
                    stdin.write_all(content.as_bytes())?;
                }
                child.wait_with_output()
            })
            .map_err(|e| anyhow::anyhow!("Failed to run GPG command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("GPG signing failed: {}", stderr));
        }

        String::from_utf8(output.stdout)
            .map_err(|e| anyhow::anyhow!("Failed to convert GPG signature to UTF-8: {}", e))
    }

    /// Create a signed commit or fallback to unsigned if signing fails
    pub fn create_commit(
        &self,
        repo: &Repository,
        update_ref: Option<&str>,
        author: &git2::Signature,
        committer: &git2::Signature,
        message: &str,
        tree: &git2::Tree,
        parents: &[&git2::Commit],
    ) -> Result<git2::Oid, git2::Error> {
        // Only attempt signing if it's enabled
        if self.is_enabled() {
            // Create the commit buffer
            let commit_buffer = repo.commit_create_buffer(
                author,
                committer,
                message,
                tree,
                parents,
            )?;

            let commit_text = String::from_utf8_lossy(&commit_buffer);
            
            // Try to sign the commit
            if let Ok(Some(signature)) = self.sign_commit(&commit_text) {
                debug!("Creating signed commit");
                // Create a signed commit
                return repo.commit_signed(
                    &commit_text,
                    &signature,
                    update_ref.map(|s| s.as_ref()),
                );
            } else {
                debug!("Falling back to unsigned commit");
            }
        }

        // Fallback to regular unsigned commit
        repo.commit(
            update_ref,
            author,
            committer,
            message,
            tree,
            parents,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_commit_signer_reads_config() {
        // Create a temporary repository
        let temp_dir = TempDir::new().unwrap();
        let repo = git2::Repository::init(temp_dir.path()).unwrap();
        
        // Configure the repository
        let mut config = repo.config().unwrap();
        config.set_bool("commit.gpgsign", true).unwrap();
        config.set_str("user.signingkey", "test@example.com").unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        
        // Create a CommitSigner
        let signer = CommitSigner::from_repo(&repo).unwrap();
        
        // Verify it's enabled
        assert!(signer.is_enabled());
    }
    
    #[test]
    fn test_commit_signer_disabled_when_no_config() {
        // Create a temporary repository
        let temp_dir = TempDir::new().unwrap();
        let repo = git2::Repository::init(temp_dir.path()).unwrap();
        
        // Configure minimal repo settings and explicitly disable signing
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        config.set_bool("commit.gpgsign", false).unwrap();  // Explicitly disable signing
        
        // Create a CommitSigner without signing config
        let signer = CommitSigner::from_repo(&repo).unwrap();
        
        // Verify it's disabled
        assert!(!signer.is_enabled());
    }
    
    #[test]
    fn test_unsigned_commit_fallback() {
        // Create a temporary repository
        let temp_dir = TempDir::new().unwrap();
        let repo = git2::Repository::init(temp_dir.path()).unwrap();
        
        // Configure minimal repo settings
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        
        // Create a CommitSigner (signing disabled)
        let signer = CommitSigner::from_repo(&repo).unwrap();
        
        // Create a tree
        let tree_id = {
            let tree_builder = repo.treebuilder(None).unwrap();
            tree_builder.write().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        
        // Create signature
        let signature = git2::Signature::now("Test User", "test@example.com").unwrap();
        
        // Create an unsigned commit
        let commit_id = signer.create_commit(
            &repo,
            Some("refs/heads/main"),
            &signature,
            &signature,
            "Test commit",
            &tree,
            &[],
        ).unwrap();
        
        // Verify the commit was created
        let commit = repo.find_commit(commit_id).unwrap();
        assert_eq!(commit.message(), Some("Test commit"));
    }
}