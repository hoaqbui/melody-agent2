use anyhow::Result;
use futures::future::BoxFuture;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::acp::{
    extension_configs_to_mcp_servers, AcpProvider, AcpProviderConfig, ACP_CURRENT_MODEL,
};
use crate::config::search_path::SearchPaths;
use crate::config::{Config, GooseMode};
use crate::providers::base::{
    current_working_dir, ProviderDef, ProviderDescriptor, ProviderMetadata,
};
use crate::providers::catalog::ProviderSetupMetadata;

pub(crate) const CURSOR_ACP_PROVIDER_NAME: &str = "cursor-acp";
const CURSOR_ACP_DOC_URL: &str = "https://docs.cursor.com/en/cli/overview";
pub(crate) const CURSOR_ACP_BINARY: &str = "cursor-agent";

pub struct CursorAcpProvider;

impl goose_providers::base::ProviderDescriptor for CursorAcpProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            CURSOR_ACP_PROVIDER_NAME,
            "Cursor Agent ACP",
            "Use goose with your Cursor subscription via cursor-agent's native ACP server (Grok, Composer and other Cursor models).",
            ACP_CURRENT_MODEL,
            vec![],
            CURSOR_ACP_DOC_URL,
            vec![],
        )
        .with_setup_steps(vec![
            "Install Cursor Agent CLI: curl https://cursor.com/install -fsS | bash",
            "Sign in: run cursor-agent login",
        ])
        .with_setup(
            ProviderSetupMetadata::cli_agent(
                CURSOR_ACP_BINARY,
                &["cursor-acp", "cursor_agent", "cursor"],
            )
            .with_acp()
            .with_docs_url(CURSOR_ACP_DOC_URL)
            .with_capabilities(true, true, true),
        )
    }
}

impl ProviderDef for CursorAcpProvider {
    type Provider = AcpProvider;

    fn from_env(
        extensions: Vec<crate::config::ExtensionConfig>,
        tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<AcpProvider>> {
        Self::from_env_with_working_dir(extensions, current_working_dir(), tls_config)
    }

    fn from_env_with_working_dir(
        extensions: Vec<crate::config::ExtensionConfig>,
        working_dir: PathBuf,
        _tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<AcpProvider>> {
        Box::pin(async move {
            let config = Config::global();
            // SearchPaths includes ~/.local/bin; with_npm() adds npm global bin dir
            let resolved_command = SearchPaths::builder()
                .with_npm()
                .resolve(CURSOR_ACP_BINARY)?;
            let goose_mode = config.get_goose_mode().unwrap_or(GooseMode::Auto);

            // cursor-agent acp advertises modes `agent` / `plan` / `ask` at
            // session/new (checked 2026-09-15). `agent` is full tool access;
            // `plan` is read-only with no writes or commands — it cannot edit
            // without telling me, so Approve maps there (decision 2 of
            // docs/2026-09-18-ux-parity-plan-v1.md). `ask` is Q&A with no
            // edits or commands, matching Chat.
            let mode_mapping = HashMap::from([
                (GooseMode::Auto, vec!["agent".to_string()]),
                (GooseMode::Approve, vec!["plan".to_string()]),
                (GooseMode::SmartApprove, vec!["agent".to_string()]),
                (GooseMode::Chat, vec!["ask".to_string()]),
            ]);

            let provider_config = AcpProviderConfig {
                command: resolved_command,
                args: cursor_acp_args(),
                env: vec![],
                env_remove: vec![],
                work_dir: working_dir,
                mcp_servers: extension_configs_to_mcp_servers(&extensions),
                session_mode_id: mode_mapping[&goose_mode].first().cloned(),
                session_config_options: vec![],
                // Cursor advertises models through the ACP `models` field
                // (session/set_model), not a config option; AcpProvider does
                // not drive set_model yet, so the session keeps cursor-agent's
                // current model.
                model_config_option_id: None,
                mode_mapping,
                notification_callback: None,
            };

            let metadata = Self::metadata();
            AcpProvider::connect(metadata.name, goose_mode, provider_config).await
        })
    }
}

pub(crate) fn cursor_acp_args() -> Vec<String> {
    vec!["acp".to_string()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_acp_metadata_names_binary_and_args() {
        assert_eq!(CursorAcpProvider::metadata().name, "cursor-acp");
        assert_eq!(CURSOR_ACP_BINARY, "cursor-agent");
        assert_eq!(cursor_acp_args(), vec!["acp".to_string()]);
    }
}
