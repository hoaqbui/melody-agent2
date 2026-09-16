use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::base::{MessageStream, Provider, ProviderDef, ProviderMetadata};
use super::cli_common::{error_from_event, extract_usage_tokens};
use super::utils::filter_extensions_from_system_prompt;
use crate::config::search_path::SearchPaths;
use crate::config::Config;
use crate::conversation::message::{Message, MessageContent};
use crate::providers::base::ConfigKey;
use crate::subprocess::configure_subprocess;
use async_stream::try_stream;
use futures::future::BoxFuture;
use goose_providers::conversation::token_usage::{ProviderUsage, Usage};
use goose_providers::errors::ProviderError;
use goose_providers::model::ModelConfig;
use rmcp::model::Role;
use rmcp::model::Tool;

pub(crate) const AGY_PROVIDER_NAME: &str = "agy";
pub(crate) const AGY_BINARY: &str = "agy";
pub const AGY_DEFAULT_MODEL: &str = "gemini-3.8-flash-high";
pub const AGY_KNOWN_MODELS: &[&str] = &[
    "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low",
    "gemini-3.6-flash-high",
    "gemini-3.6-flash-medium",
    "gemini-3.6-flash-low",
    "gemini-3.1-pro-high",
    "gemini-3.1-pro-low",
    "claude-sonnet-4-6",
    "claude-opus-4-6-thinking",
    "gpt-oss-120b-medium",
];

pub const AGY_DOC_URL: &str = "https://antigravity.google/docs/cli/reference";

#[derive(Debug, serde::Serialize)]
pub struct AgyProvider {
    command: PathBuf,
    #[serde(skip)]
    name: String,
    #[serde(skip)]
    conversation_id: Arc<OnceLock<String>>,
}

struct AgyProcess {
    child: tokio::process::Child,
    reader: BufReader<tokio::process::ChildStdout>,
    prompt_write: tokio::task::JoinHandle<std::io::Result<()>>,
}

impl AgyProvider {
    pub async fn from_env(
        _tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> Result<Self> {
        let config = Config::global();
        let command: String = config.get_agy_command().unwrap_or_default().into();
        let resolved_command = SearchPaths::builder().with_npm().resolve(&command)?;

        Ok(Self {
            command: resolved_command,
            name: AGY_PROVIDER_NAME.to_string(),
            conversation_id: Arc::new(OnceLock::new()),
        })
    }

    fn conversation_id(&self) -> Option<&str> {
        self.conversation_id.get().map(|s| s.as_str())
    }

    fn last_user_message_text(messages: &[Message]) -> String {
        messages
            .iter()
            .rev()
            .find(|m| m.role == Role::User)
            .map(|m| m.as_concat_text())
            .unwrap_or_default()
    }

    /// When resuming a conversation the CLI holds the history itself, so only
    /// the latest user message is sent. On the first turn the system prompt is
    /// prepended — print mode has no separate system channel.
    fn build_prompt(&self, system: &str, messages: &[Message]) -> String {
        let user_text = Self::last_user_message_text(messages);

        if self.conversation_id().is_some() {
            user_text
        } else {
            let filtered_system = filter_extensions_from_system_prompt(system);
            if filtered_system.is_empty() {
                user_text
            } else {
                format!("{filtered_system}\n\n{user_text}")
            }
        }
    }

    /// Text-mode print takes the prompt only as an argument; stream-json input
    /// is the one channel that keeps it off argv.
    fn stream_input_line(prompt: &str) -> String {
        let message = serde_json::json!({
            "event": "user",
            "message": {"role": "user", "content": prompt},
        });
        format!("{message}\n")
    }

    fn build_command(&self, model_name: &str) -> Command {
        let mut cmd = Command::new(&self.command);
        configure_subprocess(&mut cmd);

        if let Ok(path) = SearchPaths::builder().with_npm().path() {
            cmd.env("PATH", path);
        }

        cmd.arg("--model").arg(model_name);

        if let Some(id) = self.conversation_id() {
            cmd.arg("--conversation").arg(id);
        }

        cmd.arg("--input-format")
            .arg("stream-json")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--dangerously-skip-permissions");

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        cmd
    }

    fn spawn_command(
        &self,
        system: &str,
        messages: &[Message],
        model_name: &str,
    ) -> Result<AgyProcess, ProviderError> {
        let input_line = Self::stream_input_line(&self.build_prompt(system, messages));

        tracing::debug!(command = ?self.command, "Executing agy command");

        let mut cmd = self.build_command(model_name);

        let mut child = cmd.kill_on_drop(true).spawn().map_err(|e| {
            ProviderError::RequestFailed(format!(
                "Failed to spawn agy command '{}': {e}. \
                Make sure agy is installed and available in the configured search paths.",
                self.command.display()
            ))
        })?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| ProviderError::RequestFailed("Failed to capture stdin".to_string()))?;
        let prompt_write = tokio::spawn(async move {
            stdin.write_all(input_line.as_bytes()).await?;
            stdin.shutdown().await
        });

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| ProviderError::RequestFailed("Failed to capture stdout".to_string()))?;

        Ok(AgyProcess {
            child,
            reader: BufReader::new(stdout),
            prompt_write,
        })
    }
}

impl goose_providers::base::ProviderDescriptor for AgyProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            AGY_PROVIDER_NAME,
            "Antigravity CLI",
            "Execute models via the agy CLI on a Google AI subscription. Requires agy installed.",
            AGY_DEFAULT_MODEL,
            AGY_KNOWN_MODELS.to_vec(),
            AGY_DOC_URL,
            vec![ConfigKey::new(
                "AGY_COMMAND",
                true,
                false,
                Some(AGY_BINARY),
                true,
            )],
        )
    }
}

impl ProviderDef for AgyProvider {
    type Provider = Self;

    fn from_env(
        _extensions: Vec<crate::config::ExtensionConfig>,
        tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(Self::from_env(tls_config))
    }
}

#[async_trait]
impl Provider for AgyProvider {
    fn get_name(&self) -> &str {
        &self.name
    }

    fn manages_own_context(&self) -> bool {
        true
    }

    async fn fetch_supported_models(&self) -> Result<Vec<String>, ProviderError> {
        Ok(AGY_KNOWN_MODELS.iter().map(|s| s.to_string()).collect())
    }

    async fn stream(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        _tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        let AgyProcess {
            mut child,
            mut reader,
            prompt_write,
        } = self.spawn_command(system, messages, &model_config.model_name)?;
        let conversation_id_lock = Arc::clone(&self.conversation_id);
        let model_name = model_config.model_name.clone();
        let message_id = uuid::Uuid::new_v4().to_string();

        let stderr = child.stderr.take();
        let stderr_drain = tokio::spawn(async move {
            let mut buf = String::new();
            if let Some(mut stderr) = stderr {
                let _ = AsyncReadExt::read_to_string(&mut stderr, &mut buf).await;
            }
            buf
        });

        Ok(Box::pin(try_stream! {
            let mut line = String::new();
            let mut accumulated_usage = Usage::default();
            let stream_timestamp = chrono::Utc::now().timestamp();

            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                            match parsed.get("event").and_then(|t| t.as_str()) {
                                Some("init") => {
                                    if let Some(id) =
                                        parsed.get("conversation_id").and_then(|s| s.as_str())
                                    {
                                        let _ = conversation_id_lock.set(id.to_string());
                                    }
                                }
                                Some("step_update") => {
                                    let step = parsed.get("step_update");
                                    // `result.usage` is cumulative over the whole
                                    // conversation on resume; per-step usage is
                                    // the turn's own spend.
                                    if let Some(usage) = step.and_then(|s| s.get("usage")) {
                                        accumulated_usage += extract_usage_tokens(usage);
                                    }
                                    let is_response = step
                                        .and_then(|s| s.get("step_type"))
                                        .and_then(|t| t.as_str())
                                        == Some("agent_response");
                                    let delta = step
                                        .and_then(|s| s.get("text_delta"))
                                        .and_then(|d| d.as_str())
                                        .unwrap_or("");
                                    if is_response && !delta.is_empty() {
                                        let mut partial = Message::new(
                                            Role::Assistant,
                                            stream_timestamp,
                                            vec![MessageContent::text(delta)],
                                        );
                                        partial.id = Some(message_id.clone());
                                        yield (Some(partial), None);
                                    }
                                }
                                Some("result") => {
                                    let result = parsed.get("result").cloned().unwrap_or(Value::Null);
                                    if result.get("status").and_then(|s| s.as_str()) != Some("SUCCESS") {
                                        let _ = child.wait().await;
                                        Err(error_from_event("agy", &result))?;
                                    }
                                    break;
                                }
                                _ => {}
                            }
                        } else {
                            tracing::warn!(line = trimmed, "Non-JSON line in stream-json output");
                        }
                    }
                    Err(e) => {
                        let _ = child.wait().await;
                        Err(ProviderError::RequestFailed(format!(
                            "Failed to read streaming output: {e}"
                        )))?;
                    }
                }
            }

            let prompt_write_result = prompt_write.await;
            let stderr_text = stderr_drain.await.unwrap_or_default();
            let exit_status = child.wait().await.map_err(|e| {
                ProviderError::RequestFailed(format!("Failed to wait for command: {e}"))
            })?;

            if !exit_status.success() {
                let stderr_snippet = stderr_text.trim();
                let detail = if stderr_snippet.is_empty() {
                    format!("exit code {:?}", exit_status.code())
                } else {
                    format!("exit code {:?}: {stderr_snippet}", exit_status.code())
                };
                Err(ProviderError::RequestFailed(format!(
                    "agy command failed ({detail})"
                )))?;
            }

            prompt_write_result
                .map_err(|e| ProviderError::RequestFailed(format!(
                    "Failed to write prompt to stdin: {e}"
                )))?
                .map_err(|e| ProviderError::RequestFailed(format!(
                    "Failed to write prompt to stdin: {e}"
                )))?;

            let provider_usage = ProviderUsage::new(model_name, accumulated_usage);
            yield (None, Some(provider_usage));
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use futures::StreamExt;
    use goose_providers::base::ProviderDescriptor;
    #[cfg(unix)]
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    #[cfg(unix)]
    use std::path::Path;

    #[cfg(unix)]
    const SENTINEL: &str = "loupe-sensitive-agy-prompt";

    fn make_provider() -> AgyProvider {
        AgyProvider {
            command: PathBuf::from("agy"),
            name: "agy".to_string(),
            conversation_id: Arc::new(OnceLock::new()),
        }
    }

    #[test]
    fn agy_metadata_names_binary_and_args() {
        let metadata = AgyProvider::metadata();
        assert_eq!(metadata.name, "agy");
        assert_eq!(metadata.default_model, AGY_DEFAULT_MODEL);
        let command_key = metadata
            .config_keys
            .iter()
            .find(|key| key.name == "AGY_COMMAND")
            .unwrap();
        assert_eq!(command_key.default.as_deref(), Some("agy"));

        let provider = make_provider();
        let args: Vec<String> = provider
            .build_command("gemini-3.8-flash-low")
            .as_std()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            [
                "--model",
                "gemini-3.8-flash-low",
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--dangerously-skip-permissions",
            ]
        );

        provider
            .conversation_id
            .set("existing-conversation".to_string())
            .unwrap();
        let args: Vec<String> = provider
            .build_command("gemini-3.8-flash-low")
            .as_std()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args[2..4], ["--conversation", "existing-conversation"]);
    }

    #[test]
    fn test_build_prompt_first_and_resume() {
        let provider = make_provider();
        let messages = vec![Message::new(
            Role::User,
            0,
            vec![MessageContent::text("Hello")],
        )];

        let prompt = provider.build_prompt("You are helpful.", &messages);
        assert!(prompt.contains("You are helpful."));
        assert!(prompt.contains("Hello"));

        let _ = provider.conversation_id.set("conversation-123".to_string());
        let messages = vec![
            Message::new(Role::User, 0, vec![MessageContent::text("Hello")]),
            Message::new(Role::Assistant, 0, vec![MessageContent::text("Hi!")]),
            Message::new(
                Role::User,
                0,
                vec![MessageContent::text("Follow up question")],
            ),
        ];
        let prompt = provider.build_prompt("You are helpful.", &messages);
        assert_eq!(prompt, "Follow up question");
    }

    #[test]
    fn stream_input_line_is_a_user_event() {
        let line = AgyProvider::stream_input_line("say \"hi\"\nnow");
        let parsed: Value = serde_json::from_str(line.trim_end()).unwrap();
        assert!(line.ends_with('\n'));
        assert_eq!(parsed["event"], "user");
        assert_eq!(parsed["message"]["role"], "user");
        assert_eq!(parsed["message"]["content"], "say \"hi\"\nnow");
    }

    // Lines recorded from `agy 1.2.3 --model gemini-3.8-flash-low --input-format
    // stream-json --output-format stream-json` on 2026-09-16 (u3 probe): the
    // reply arrives as two deltas plus a trailing newline carrying the usage.
    #[cfg(unix)]
    fn recording_cli(directory: &Path) -> PathBuf {
        let command = directory.join("agy-recording-shim");
        fs::write(
            &command,
            r#"#!/bin/sh
record_dir=${0%/*}
printf '%s\n' "$@" > "$record_dir/args"
cat > "$record_dir/stdin"
printf '%s\n' '{"event":"init","conversation_id":"d4645554-a3be-4dd8-aff7-ac3f15cd0fa9","init":{"model":"gemini-3.8-flash-low","cwd":"/tmp","tools":["run_command"],"permission_mode":"always-proceed"}}'
printf '%s\n' '{"event":"step_update","step_update":{"conversation_id":"d4645554-a3be-4dd8-aff7-ac3f15cd0fa9","step_index":0,"state":"DONE","step_type":"user_input"}}'
printf '%s\n' '{"event":"step_update","step_update":{"conversation_id":"d4645554-a3be-4dd8-aff7-ac3f15cd0fa9","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"agy-content-"}}'
printf '%s\n' '{"event":"step_update","step_update":{"conversation_id":"d4645554-a3be-4dd8-aff7-ac3f15cd0fa9","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"blocks-ok"}}'
printf '%s\n' '{"event":"step_update","step_update":{"conversation_id":"d4645554-a3be-4dd8-aff7-ac3f15cd0fa9","step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"\n","duration_seconds":0.952183,"usage":{"input_tokens":14481,"output_tokens":7,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":14488}}}'
printf '%s\n' '{"event":"result","result":{"conversation_id":"d4645554-a3be-4dd8-aff7-ac3f15cd0fa9","status":"SUCCESS","response":"agy-content-blocks-ok\n","duration_seconds":1.245084,"num_turns":1,"usage":{"input_tokens":99999,"output_tokens":99999,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":99999}}}'
"#,
        )
        .unwrap();
        fs::set_permissions(&command, fs::Permissions::from_mode(0o755)).unwrap();
        command
    }

    #[cfg(unix)]
    async fn run_recorded(resumed: bool) -> (String, String, String, Usage) {
        let directory = tempfile::tempdir().unwrap();
        let mut provider = make_provider();
        provider.command = recording_cli(directory.path());
        if resumed {
            provider
                .conversation_id
                .set("existing-conversation".to_string())
                .unwrap();
        }

        let messages = if resumed {
            vec![
                Message::user().with_text("first turn"),
                Message::assistant().with_text("first response"),
                Message::user().with_text(SENTINEL),
            ]
        } else {
            vec![Message::user().with_text(SENTINEL)]
        };
        let mut stream = provider
            .stream(
                &ModelConfig::new(AGY_DEFAULT_MODEL),
                "system instructions",
                &messages,
                &[],
            )
            .await
            .unwrap();
        let mut text = String::new();
        let mut usage = Usage::default();
        while let Some(item) = stream.next().await {
            let (message, provider_usage) = item.unwrap();
            if let Some(message) = message {
                text.push_str(&message.as_concat_text());
            }
            if let Some(provider_usage) = provider_usage {
                usage = provider_usage.usage;
            }
        }

        let args = fs::read_to_string(directory.path().join("args")).unwrap();
        let stdin = fs::read_to_string(directory.path().join("stdin")).unwrap();
        (args, stdin, text, usage)
    }

    #[cfg(unix)]
    async fn assert_prompt_uses_stdin(resumed: bool) {
        let (args, stdin, text, usage) = run_recorded(resumed).await;

        assert!(!args.contains(SENTINEL));
        assert!(stdin.contains(SENTINEL));
        assert!(stdin.contains(r#""event":"user""#));
        assert!(!args.lines().any(|arg| arg == "-p" || arg == "--print"));
        assert!(args.contains("--model\ngemini-3.8-flash-high"));
        assert!(args.contains("--input-format\nstream-json"));
        assert!(args.contains("--output-format\nstream-json"));
        assert!(args.contains("--dangerously-skip-permissions"));
        if resumed {
            assert!(args.contains("--conversation\nexisting-conversation"));
        } else {
            assert!(!args.lines().any(|arg| arg == "--conversation"));
        }

        assert_eq!(text, "agy-content-blocks-ok\n");
        assert_eq!(usage.input_tokens, Some(14481));
        assert_eq!(usage.output_tokens, Some(7));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn initial_prompt_is_sent_on_stdin() {
        assert_prompt_uses_stdin(false).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn resumed_prompt_is_sent_on_stdin() {
        assert_prompt_uses_stdin(true).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn init_event_records_conversation_id() {
        let directory = tempfile::tempdir().unwrap();
        let mut provider = make_provider();
        provider.command = recording_cli(directory.path());

        let mut stream = provider
            .stream(
                &ModelConfig::new(AGY_DEFAULT_MODEL),
                "answer in four words or less",
                &[Message::user().with_text("ordinary request")],
                &[],
            )
            .await
            .unwrap();
        while let Some(item) = stream.next().await {
            item.unwrap();
        }

        assert_eq!(
            provider.conversation_id(),
            Some("d4645554-a3be-4dd8-aff7-ac3f15cd0fa9")
        );
        assert!(fs::read_to_string(directory.path().join("stdin"))
            .unwrap()
            .contains("answer in four words or less"));
    }
}
