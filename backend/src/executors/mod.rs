pub mod aider;
pub mod amp;
pub mod ccr;
pub mod charm_opencode;
pub mod claude;
pub mod cleanup_script;
pub mod codex;
pub mod config;
pub mod dev_server;
pub mod echo;
pub mod gemini;
pub mod setup_script;
pub mod sst_opencode;

pub use aider::AiderExecutor;
pub use amp::AmpExecutor;
pub use ccr::CCRExecutor;
pub use charm_opencode::CharmOpencodeExecutor;
pub use claude::ClaudeExecutor;
pub use cleanup_script::CleanupScriptExecutor;
pub use codex::CodexExecutor;
pub use dev_server::DevServerExecutor;
pub use echo::EchoExecutor;
pub use gemini::GeminiExecutor;
pub use setup_script::SetupScriptExecutor;
pub use sst_opencode::SstOpencodeExecutor;

use crate::utils::command_utils::command_exists;
use anyhow::{anyhow, Result};
use self::config::AGENT_CONFIGS;

/// Build command with PATH-first resolution, falling back to npx
pub fn build_agent_command(agent_name: &str, additional_args: Option<&str>) -> Result<String> {
    let config = AGENT_CONFIGS.get(agent_name)
        .ok_or_else(|| anyhow!("Unknown agent: {}", agent_name))?;
    
    // Try PATH first
    if command_exists(config.path_command) {
        let mut cmd = config.path_command.to_string();
        cmd.push(' ');
        cmd.push_str(config.args);
        if let Some(extra) = additional_args {
            cmd.push(' ');
            cmd.push_str(extra);
        }
        tracing::info!("Using {} from PATH", config.path_command);
        Ok(cmd)
    } else {
        // Fall back to npx
        let mut cmd = format!("npx -y {} {}", config.npx_package, config.args);
        if let Some(extra) = additional_args {
            cmd.push(' ');
            cmd.push_str(extra);
        }
        tracing::info!("Using {} via npx (not found in PATH)", config.path_command);
        Ok(cmd)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_agent_command() {
        // Test building command for a known agent
        let result = build_agent_command("claude", None);
        assert!(result.is_ok());
        let cmd = result.unwrap();
        
        // The command should contain either claude-code (PATH) or npx (fallback)
        assert!(cmd.contains("claude-code") || cmd.contains("npx"));
        assert!(cmd.contains("--dangerously-skip-permissions"));
        
        // Test with additional args
        let result = build_agent_command("claude", Some("--project-id test"));
        assert!(result.is_ok());
        let cmd = result.unwrap();
        assert!(cmd.contains("--project-id test"));
        
        // Test with unknown agent
        let result = build_agent_command("unknown-agent", None);
        assert!(result.is_err());
    }
}
