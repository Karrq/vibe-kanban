// Test script to verify truncate_output implementation
#[path = "backend/src/executors/amp.rs"]
mod amp;

#[path = "backend/src/executors/claude.rs"]
mod claude;

use amp::AmpExecutor;
use claude::ClaudeExecutor;

fn main() {
    println!("Testing truncate_output implementations...");
    
    // Test data for AMP
    let amp_logs = r#"{"type":"initial","threadID":"T-test"}
{"type":"messages","messages":[[0,{"role":"user","content":[{"type":"text","text":"Test"}]}]],"toolResults":[]}
{"type":"messages","messages":[[1,{"role":"assistant","content":[{"type":"text","text":"Message 1"}]}]],"toolResults":[]}
{"type":"messages","messages":[[2,{"role":"assistant","content":[{"type":"text","text":"Message 2"}]}]],"toolResults":[]}"#;
    
    let amp_executor = AmpExecutor;
    
    // Test truncating at different indices
    for index in 0..3 {
        match amp_executor.truncate_output(amp_logs, index, "/tmp") {
            Ok((truncated, count)) => {
                println!("AMP: Truncate at index {}: {} lines, {} messages", 
                    index, truncated.lines().count(), count);
            }
            Err(e) => {
                println!("AMP: Error at index {}: {}", index, e);
            }
        }
    }
    
    // Test data for Claude
    let claude_logs = r#"{"type":"system","subtype":"init","cwd":"/tmp","session_id":"test-session"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Message 1"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Message 2"}]}}"#;
    
    let claude_executor = ClaudeExecutor::new();
    
    // Test truncating at different indices  
    for index in 0..3 {
        match claude_executor.truncate_output(claude_logs, index, "/tmp") {
            Ok((truncated, count)) => {
                println!("Claude: Truncate at index {}: {} lines, {} messages",
                    index, truncated.lines().count(), count);
            }
            Err(e) => {
                println!("Claude: Error at index {}: {}", index, e);
            }
        }
    }
    
    println!("Tests completed!");
}