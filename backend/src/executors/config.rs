use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub path_command: &'static str,
    pub npx_package: &'static str,
    pub args: &'static str,
}

lazy_static::lazy_static! {
    pub static ref AGENT_CONFIGS: HashMap<&'static str, AgentConfig> = {
        let mut m = HashMap::new();
        
        m.insert("claude", AgentConfig {
            path_command: "claude-code",
            npx_package: "@anthropic-ai/claude-code@latest",
            args: "-p --dangerously-skip-permissions --verbose --output-format=stream-json",
        });
        
        m.insert("claude-plan", AgentConfig {
            path_command: "claude-code",
            npx_package: "@anthropic-ai/claude-code@latest",
            args: "-p --permission-mode=plan --verbose --output-format=stream-json",
        });
        
        m.insert("gemini", AgentConfig {
            path_command: "gemini",
            npx_package: "@google/gemini-cli@latest",
            args: "--yolo",
        });
        
        m.insert("amp", AgentConfig {
            path_command: "amp",
            npx_package: "@sourcegraph/amp@0.0.1752148945-gd8844f",
            args: "--format=jsonl",
        });
        
        m.insert("codex", AgentConfig {
            path_command: "codex",
            npx_package: "@openai/codex",
            args: "exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check",
        });
        
        m
    };
}