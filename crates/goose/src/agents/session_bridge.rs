//! A loopback MCP-over-HTTP endpoint that hands one session's `summon` tools
//! (`delegate`, `load`, …) to an external runtime. ACP adapters and CLI
//! wrappers drop Goose's own tool list, so this is the only way an
//! orchestrator running on a subscription runtime can delegate through Goose.
//! Callers register top-level sessions only; a delegated child never sees it.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use rand::{distr::Alphanumeric, RngExt};
use rmcp::model::{
    CallToolRequestParams, CallToolResult, ContentBlock, Implementation, InitializeResult,
    ListToolsResult, ServerCapabilities,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tokio::sync::OnceCell;
use tokio_util::sync::CancellationToken;

use super::Agent;
use crate::config::ExtensionConfig;

pub const BRIDGE_EXTENSION_NAME: &str = "goose";
pub const SECRET_HEADER: &str = "X-Secret-Key";
const SUMMON_EXTENSION: &str = "summon";

type Registry = Arc<Mutex<HashMap<String, Weak<Agent>>>>;

#[derive(Clone)]
struct BridgeState {
    secret: String,
    registry: Registry,
}

pub struct SessionBridge {
    base_url: String,
    state: BridgeState,
}

static BRIDGE: OnceCell<SessionBridge> = OnceCell::const_new();

impl SessionBridge {
    /// Process-wide bridge; binds 127.0.0.1:0 on first use. Loopback only.
    pub async fn global() -> &'static SessionBridge {
        BRIDGE
            .get_or_init(|| async {
                let listener = TcpListener::bind("127.0.0.1:0")
                    .await
                    .expect("bind session bridge on loopback");
                let addr = listener.local_addr().expect("session bridge local addr");
                let secret: String = rand::rng()
                    .sample_iter(&Alphanumeric)
                    .take(64)
                    .map(char::from)
                    .collect();
                let bridge = SessionBridge {
                    base_url: format!("http://{addr}"),
                    state: BridgeState {
                        secret,
                        registry: Arc::new(Mutex::new(HashMap::new())),
                    },
                };
                let router = bridge.router();
                tokio::spawn(async move {
                    if let Err(error) = axum::serve(listener, router).await {
                        tracing::error!(error = %error, "session bridge listener exited");
                    }
                });
                bridge
            })
            .await
    }

    pub fn register(&self, session_id: &str, agent: Weak<Agent>) {
        self.state
            .registry
            .lock()
            .unwrap()
            .insert(session_id.to_string(), agent);
    }

    pub fn unregister(&self, session_id: &str) {
        self.state.registry.lock().unwrap().remove(session_id);
    }

    /// The extension an external runtime receives so it can call this session's tools.
    pub fn extension_config(&self, session_id: &str) -> ExtensionConfig {
        ExtensionConfig::StreamableHttp {
            name: BRIDGE_EXTENSION_NAME.to_string(),
            uri: format!("{}/mcp/{session_id}", self.base_url),
            description: "Goose session tools".to_string(),
            envs: Default::default(),
            env_keys: Vec::new(),
            headers: HashMap::from([(SECRET_HEADER.to_string(), self.state.secret.clone())]),
            timeout: None,
            socket: None,
            client_id: None,
            client_secret_key: None,
            scopes: Vec::new(),
            bundled: None,
            available_tools: Vec::new(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// No CORS layer, on purpose: a browser cannot send the secret header
    /// without a preflight this listener never answers.
    pub fn router(&self) -> Router {
        Router::new()
            .route("/mcp/{session_id}", post(handle))
            .with_state(self.state.clone())
    }
}

async fn handle(
    State(state): State<BridgeState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    body: String,
) -> Response {
    let agent = state
        .registry
        .lock()
        .unwrap()
        .get(&session_id)
        .and_then(Weak::upgrade);
    let Some(agent) = agent else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let presented = headers
        .get(SECRET_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if !bool::from(presented.as_bytes().ct_eq(state.secret.as_bytes())) {
        return StatusCode::UNAUTHORIZED.into_response();
    }

    let request: Value = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(_) => return rpc_error(StatusCode::BAD_REQUEST, None, -32700, "parse error"),
    };
    let id = request.get("id").cloned();
    let Some(method) = request.get("method").and_then(Value::as_str) else {
        return rpc_error(StatusCode::BAD_REQUEST, id, -32600, "invalid request");
    };
    let params = request.get("params").cloned();

    match method {
        "initialize" => {
            let mut result = json!(InitializeResult::new(
                ServerCapabilities::builder().enable_tools().build()
            )
            .with_server_info(Implementation::new(
                "goose-session-bridge",
                env!("CARGO_PKG_VERSION"),
            )));
            // A stateless server agrees to whatever revision the client speaks.
            if let Some(version) = params
                .as_ref()
                .and_then(|p| p.get("protocolVersion"))
                .and_then(Value::as_str)
            {
                result["protocolVersion"] = Value::String(version.to_string());
            }
            rpc_ok(id, result)
        }
        method if method.starts_with("notifications/") => StatusCode::ACCEPTED.into_response(),
        "ping" => rpc_ok(id, json!({})),
        "tools/list" => {
            let tools = agent
                .list_tools(&session_id, Some(SUMMON_EXTENSION.to_string()))
                .await;
            rpc_ok(id, json!(ListToolsResult::with_all_items(tools)))
        }
        "tools/call" => {
            let call = match params.map(serde_json::from_value::<CallToolRequestParams>) {
                Some(Ok(call)) => call,
                _ => return rpc_error(StatusCode::OK, id, -32602, "invalid params"),
            };
            let session = match agent
                .config
                .session_manager
                .get_session(&session_id, false)
                .await
            {
                Ok(session) => session,
                Err(error) => {
                    return rpc_error(StatusCode::OK, id, -32603, &error.to_string());
                }
            };
            let token = CancellationToken::new();
            // Cancels the dispatch if the client drops the request mid-call.
            let _guard = token.clone().drop_guard();
            let (_, dispatched) = agent
                .dispatch_tool_call(
                    call,
                    uuid::Uuid::now_v7().to_string(),
                    Some(token),
                    &session,
                )
                .await;
            match dispatched {
                Ok(result) => match result.result.await {
                    Ok(call_result) => rpc_ok(id, json!(call_result)),
                    Err(error) => rpc_ok(
                        id,
                        json!(CallToolResult::error(vec![ContentBlock::text(
                            error.message
                        )])),
                    ),
                },
                Err(error) => rpc_error(StatusCode::OK, id, error.code.0, &error.message),
            }
        }
        _ => rpc_error(StatusCode::OK, id, -32601, "method not found"),
    }
}

fn rpc_ok(id: Option<Value>, result: Value) -> Response {
    Json(json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(Value::Null),
        "result": result,
    }))
    .into_response()
}

fn rpc_error(status: StatusCode, id: Option<Value>, code: i32, message: &str) -> Response {
    (
        status,
        Json(json!({
            "jsonrpc": "2.0",
            "id": id.unwrap_or(Value::Null),
            "error": { "code": code, "message": message },
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use tower::ServiceExt;

    fn post(session_id: &str, secret: Option<&str>, body: &str) -> Request<Body> {
        let mut builder = Request::builder()
            .method("POST")
            .uri(format!("/mcp/{session_id}"))
            .header("content-type", "application/json");
        if let Some(secret) = secret {
            builder = builder.header(SECRET_HEADER, secret);
        }
        builder.body(Body::from(body.to_string())).unwrap()
    }

    async fn json_body(response: Response) -> Value {
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    const LIST: &str = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#;

    #[tokio::test]
    async fn session_bridge_rejects_unknown_session_and_bad_secret() {
        let bridge = SessionBridge::global().await;
        let secret = bridge.state.secret.as_str();

        let response = bridge
            .router()
            .oneshot(post("nope", Some(secret), LIST))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let agent = Arc::new(Agent::new());
        bridge.register("s1", Arc::downgrade(&agent));

        let response = bridge
            .router()
            .oneshot(post("s1", None, LIST))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let response = bridge
            .router()
            .oneshot(post("s1", Some("wrong"), LIST))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        bridge.unregister("s1");
        assert!(bridge.base_url().starts_with("http://127.0.0.1:"));
    }

    #[tokio::test]
    async fn session_bridge_lists_delegate_for_registered_session() {
        let bridge = SessionBridge::global().await;
        let secret = bridge.state.secret.as_str();

        let agent = Arc::new(Agent::new());
        agent
            .extension_manager
            .add_extension(
                ExtensionConfig::Platform {
                    name: crate::agents::platform_extensions::summon::EXTENSION_NAME.to_string(),
                    description: "Load knowledge and delegate tasks to subagents".to_string(),
                    display_name: Some("Summon".to_string()),
                    bundled: Some(true),
                    available_tools: vec![],
                },
                None,
                None,
                None,
            )
            .await
            .unwrap();
        bridge.register("s2", Arc::downgrade(&agent));

        let response = bridge
            .router()
            .oneshot(post("s2", Some(secret), LIST))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let listed = json_body(response).await;
        let names: Vec<&str> = listed["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect();
        assert!(names.contains(&"delegate"), "tools: {names:?}");

        let init = r#"{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}"#;
        let response = bridge
            .router()
            .oneshot(post("s2", Some(secret), init))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let initialized = json_body(response).await;
        assert_eq!(initialized["result"]["protocolVersion"], "2025-06-18");
        assert!(initialized["result"]["capabilities"]["tools"].is_object());

        let config = bridge.extension_config("s2");
        let ExtensionConfig::StreamableHttp { uri, headers, .. } = config else {
            panic!("expected a StreamableHttp extension");
        };
        assert_eq!(uri, format!("{}/mcp/s2", bridge.base_url()));
        assert_eq!(headers.get(SECRET_HEADER).map(String::as_str), Some(secret));

        bridge.unregister("s2");
    }
}
