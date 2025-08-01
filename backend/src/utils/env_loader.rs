use std::path::Path;
use std::collections::HashMap;

#[derive(Debug)]
pub struct EnvLoadResult {
    pub env_vars: HashMap<String, String>,
    pub env_file_path: Option<String>,
    pub var_count: usize,
}

/// Load environment variables from a .env file in the specified directory
/// Returns detailed information about what was loaded
pub fn load_env_from_directory(directory: &str) -> Result<EnvLoadResult, String> {
    let env_path = Path::new(directory).join(".env");
    
    if !env_path.exists() {
        tracing::debug!("No .env file found in {}", directory);
        return Ok(EnvLoadResult {
            env_vars: HashMap::new(),
            env_file_path: None,
            var_count: 0,
        });
    }
    
    tracing::info!("Loading .env file from: {:?}", env_path);
    let env_file_path = env_path.to_string_lossy().to_string();
    
    // Load .env file and return the variables
    match dotenvy::from_path_iter(&env_path) {
        Ok(iter) => {
            let mut env_vars = HashMap::new();
            for item in iter {
                match item {
                    Ok((key, value)) => {
                        tracing::debug!("Loaded env var: {}", key);
                        env_vars.insert(key, value);
                    }
                    Err(e) => {
                        tracing::warn!("Error parsing .env entry: {}", e);
                    }
                }
            }
            let var_count = env_vars.len();
            Ok(EnvLoadResult {
                env_vars,
                env_file_path: Some(env_file_path),
                var_count,
            })
        }
        Err(e) => {
            Err(format!("Failed to load .env file: {}", e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_load_env_from_directory_no_file() {
        let temp_dir = TempDir::new().unwrap();
        let result = load_env_from_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());
        let load_result = result.unwrap();
        assert!(load_result.env_vars.is_empty());
        assert_eq!(load_result.var_count, 0);
        assert!(load_result.env_file_path.is_none());
    }

    #[test]
    fn test_load_env_from_directory_with_file() {
        let temp_dir = TempDir::new().unwrap();
        let env_content = "TEST_VAR=test_value\nANOTHER_VAR=another_value";
        fs::write(temp_dir.path().join(".env"), env_content).unwrap();
        
        let result = load_env_from_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());
        
        let load_result = result.unwrap();
        assert_eq!(load_result.env_vars.get("TEST_VAR"), Some(&"test_value".to_string()));
        assert_eq!(load_result.env_vars.get("ANOTHER_VAR"), Some(&"another_value".to_string()));
        assert_eq!(load_result.var_count, 2);
        assert!(load_result.env_file_path.is_some());
    }

    #[test]
    fn test_load_env_with_comments_and_empty_lines() {
        let temp_dir = TempDir::new().unwrap();
        let env_content = "# This is a comment\nTEST_VAR=test_value\n\n# Another comment\nANOTHER_VAR=another_value";
        fs::write(temp_dir.path().join(".env"), env_content).unwrap();
        
        let result = load_env_from_directory(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());
        
        let load_result = result.unwrap();
        assert_eq!(load_result.env_vars.len(), 2);
        assert_eq!(load_result.env_vars.get("TEST_VAR"), Some(&"test_value".to_string()));
        assert_eq!(load_result.env_vars.get("ANOTHER_VAR"), Some(&"another_value".to_string()));
        assert_eq!(load_result.var_count, 2);
    }
}