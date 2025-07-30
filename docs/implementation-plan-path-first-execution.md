# Implementation Plan: PATH-First Agent Execution with NPX Fallback

## Overview

Modify the executor system to first attempt running agents (Claude Code, Gemini CLI, Amp, etc.) directly from PATH, falling back to npx only if the command is not found. This reduces dependency on npm/npx and allows users to install agents globally or use custom builds.

## Prerequisites

- [ ] Rust's `which` crate added to Cargo.toml (version 6.0+) for PATH resolution
- [ ] Access to modify executor files in `/backend/src/executors/`
- [ ] Understanding of the CommandRunner abstraction layer

## Steps

### 1. Create Command Resolution Utility

- File: `backend/src/utils/command_utils.rs` (create new)
- Operation: Create utility functions for PATH resolution and command checking
- Details:
  ```rust
  use which::which;
  use std::path::PathBuf;

  /// Check if a command exists in PATH
  pub fn command_exists(cmd: &str) -> bool {
      which(cmd).is_ok()
  }

  /// Resolve command to full path if it exists, otherwise None
  pub fn resolve_command(cmd: &str) -> Option<PathBuf> {
      which(cmd).ok()
  }

  /// Extract base command name from a complex command string
  /// e.g., "claude-code -p --verbose" -> "claude-code"
  pub fn extract_base_command(cmd: &str) -> &str {
      cmd.split_whitespace().next().unwrap_or(cmd)
  }
  ```
- Success: Module compiles and exports are available

### 2. Add Module Export

- File: `backend/src/utils/mod.rs`
- Operation: Add new module export (around line 5)
- Details:
  ```rust
  pub mod command_utils;
  ```
- Success: Command utilities accessible from other modules

### 3. Create Executor Configuration

- File: `backend/src/executors/config.rs` (create new)
- Operation: Define configuration for PATH-first execution
- Details:
  ```rust
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
  ```
- Success: Configuration available for all executors

### 4. Create Command Builder Helper

- File: `backend/src/executors/mod.rs`
- Operation: Add helper function after imports (around line 20)
- Details:
  ```rust
  use crate::utils::command_utils::{command_exists, extract_base_command};

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
  ```
- Success: Helper function available to all executors

### 5. Update Claude Executor

- File: `backend/src/executors/claude.rs`
- Operation: Modify spawn method (lines 100-120)
- Details:
  - Import: `use super::build_agent_command;`
  - Replace:
    ```rust
    let claude_command = format!(
        "npx -y @anthropic-ai/claude-code@latest -p --dangerously-skip-permissions --verbose --output-format=stream-json {}",
        project_id_flag
    );
    ```
  - With:
    ```rust
    let claude_command = build_agent_command("claude", Some(&project_id_flag))?;
    ```
- Success: Claude executor uses PATH when available

### 6. Update Gemini Executor

- File: `backend/src/executors/gemini.rs`
- Operation: Modify spawn method (lines 64-70)
- Details:
  - Import: `use super::build_agent_command;`
  - Replace:
    ```rust
    let gemini_command = format!("npx @google/gemini-cli@latest --yolo {}", &prompt);
    ```
  - With:
    ```rust
    let base_command = build_agent_command("gemini", None)?;
    let gemini_command = format!("{} {}", base_command, &prompt);
    ```
- Success: Gemini executor uses PATH when available

### 7. Update Amp Executor

- File: `backend/src/executors/amp.rs`
- Operation: Modify spawn method (lines 85-90)
- Details:
  - Import: `use super::build_agent_command;`
  - Replace:
    ```rust
    let amp_command = format!("npx @sourcegraph/amp@0.0.1752148945-gd8844f --format=jsonl {}", amp_args);
    ```
  - With:
    ```rust
    let base_command = build_agent_command("amp", None)?;
    let amp_command = format!("{} {}", base_command, amp_args);
    ```
- Success: Amp executor uses PATH when available

### 8. Update Codex Executor

- File: `backend/src/executors/codex.rs`
- Operation: Modify execute_streaming method (lines 40-45)
- Details:
  - Import: `use super::build_agent_command;`
  - Replace:
    ```rust
    command: "npx @openai/codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check".to_string(),
    ```
  - With:
    ```rust
    command: build_agent_command("codex", None)?,
    ```
- Success: Codex executor uses PATH when available

### 9. Add Logging for Command Resolution

- File: `backend/src/executors/executor.rs`
- Operation: Add debug logging in execute_streaming (around line 250)
- Details:
  - After command setup, add:
    ```rust
    tracing::debug!("Executing command: {:?}", cmd.get_command());
    tracing::debug!("Working directory: {:?}", working_dir);
    ```
- Success: Command resolution visible in logs

### 10. Update Cargo.toml

- File: `backend/Cargo.toml`
- Operation: Add which dependency (around line 30 in dependencies section)
- Details:
  ```toml
  which = "6.0"
  lazy_static = "1.4"
  ```
- Success: Dependencies available for compilation

## Testing Strategy

- [ ] Run `cargo check` in backend directory to verify compilation
- [ ] Test with claude-code installed globally: `npm install -g @anthropic-ai/claude-code`
- [ ] Verify PATH execution: Check logs for "Using claude-code from PATH"
- [ ] Test fallback: Uninstall global package, verify "Using claude-code via npx"
- [ ] Test all executors: Create tasks for Claude, Gemini, Amp, and Codex
- [ ] Verify command not found handling still works properly

## Rollback Plan

1. Remove `backend/src/utils/command_utils.rs` and `backend/src/executors/config.rs`
2. Revert changes in executor files to use hardcoded npx commands
3. Remove which and lazy_static dependencies from Cargo.toml
4. Remove module exports from utils/mod.rs and executors/mod.rs