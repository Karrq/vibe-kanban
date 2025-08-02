use std::str::FromStr;
use std::sync::Arc;

use rmcp::{transport::stdio, ServiceExt};
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use tracing_subscriber::{prelude::*, EnvFilter};
use vibe_kanban::{app_state::AppState, mcp::task_server::TaskServer, models::config::{Config, Environment}, sentry_layer, utils::{asset_dir, config_path}};

fn main() -> anyhow::Result<()> {
    let environment = if cfg!(debug_assertions) {
        "dev"
    } else {
        "production"
    };
    let _guard = sentry::init(("https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937", sentry::ClientOptions {
        release: sentry::release_name!(),
        environment: Some(environment.into()),
        ..Default::default()
    }));
    sentry::configure_scope(|scope| {
        scope.set_tag("source", "mcp");
    });
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            tracing_subscriber::registry()
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                        .with_filter(EnvFilter::new("debug")),
                )
                .with(sentry_layer())
                .init();

            tracing::debug!("[MCP] Starting MCP task server...");

            // Database connection
            let database_url = format!(
                "sqlite://{}",
                asset_dir().join("db.sqlite").to_string_lossy()
            );

            let options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(false);
            let pool = SqlitePool::connect_with(options).await?;

            // Load config
            let config = match Config::load(&config_path()) {
                Ok(config) => config,
                Err(e) => {
                    tracing::warn!("Failed to load config, using defaults: {}", e);
                    Config::default()
                }
            };
            let config = Arc::new(tokio::sync::RwLock::new(config));

            // Create AppState
            let env = std::env::var("ENVIRONMENT")
                .unwrap_or_else(|_| "local".to_string());
            let mode = env.parse().unwrap_or(Environment::Local);
            tracing::info!("MCP server running in {mode} mode");
            let app_state = AppState::new(pool.clone(), config, mode).await;

            let service = TaskServer::new(pool, app_state)
                .serve(stdio())
                .await
                .inspect_err(|e| {
                    tracing::error!("serving error: {:?}", e);
                    sentry::capture_error(e);
                })?;

            service.waiting().await?;
            Ok(())
        })
}
