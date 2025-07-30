use which::which;

/// Check if a command exists in PATH
pub fn command_exists(cmd: &str) -> bool {
    which(cmd).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_exists() {
        // Test with a command that should exist on most systems
        assert!(command_exists("sh"));
        
        // Test with a command that definitely doesn't exist
        assert!(!command_exists("this-command-definitely-does-not-exist-1234567890"));
    }
}