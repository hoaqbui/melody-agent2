use std::sync::Arc;

use agent_client_protocol::schema::v1::{
    CreateElicitationRequest, CreateElicitationResponse, ElicitationAction as AcpElicitationAction,
    ElicitationFormMode, ElicitationSchema, ElicitationSessionScope, Meta, SessionId,
    CLIENT_METHOD_NAMES,
};
use agent_client_protocol::{
    Client, ConnectionTo, JsonRpcMessage, JsonRpcRequest, JsonRpcResponse, UntypedMessage,
};
use tracing::warn;

use crate::action_required_manager::ElicitationOutcome;
use crate::session::SessionManager;

impl super::GooseAcpAgent {
    pub(super) async fn hold_run_elicitation(
        self: &Arc<Self>,
        attachment: &Arc<super::RunAttachment>,
        id: String,
        message: String,
        requested_schema: serde_json::Value,
        meta: Meta,
    ) {
        let connection = {
            let mut state = attachment.state.lock().await;
            state.pending_elicitation = Some(super::PendingRunElicitation {
                id,
                message,
                requested_schema,
                meta,
                issued_generation: None,
            });
            state.connection.clone()
        };
        if let Some(connection) = connection {
            self.issue_run_elicitation(attachment, &connection).await;
        }
    }

    pub(super) async fn issue_run_elicitation(
        self: &Arc<Self>,
        attachment: &Arc<super::RunAttachment>,
        connection: &super::RunConnection,
    ) {
        if !self.supports_acp_elicitation() {
            return;
        }
        let pending = {
            let mut state = attachment.state.lock().await;
            let Some(pending) = state.pending_elicitation.as_mut() else {
                return;
            };
            if pending.issued_generation.is_some() {
                return;
            }
            pending.issued_generation = Some(connection.generation);
            pending.clone()
        };
        if pending
            .requested_schema
            .get("url")
            .and_then(|url| url.as_str())
            .is_some()
        {
            return;
        }
        let Ok(schema) = serde_json::from_value::<ElicitationSchema>(pending.requested_schema)
        else {
            return;
        };
        let request = CreateElicitationRequest::new(
            ElicitationFormMode::new(
                ElicitationSessionScope::new(connection_session_id(attachment).await),
                schema,
            ),
            pending.message,
        )
        .meta(pending.meta);
        let weak_attachment = Arc::downgrade(attachment);
        let generation = connection.generation;
        let session_manager = Arc::clone(&self.session_manager);
        let elicitation_id = pending.id;
        let session_id = connection_session_id(attachment).await;
        if connection
            .cx
            .send_request(CreateElicitationRequestMessage(request))
            .on_receiving_result(move |result| async move {
                let Some(attachment) = weak_attachment.upgrade() else {
                    return Ok(());
                };
                match result {
                    Ok(response) => {
                        let should_record = {
                            let mut state = attachment.state.lock().await;
                            if state.pending_elicitation.as_ref().is_some_and(|current| {
                                current.id == elicitation_id
                                    && current.issued_generation == Some(generation)
                            }) {
                                state.pending_elicitation = None;
                                true
                            } else {
                                false
                            }
                        };
                        if should_record {
                            record_acp_elicitation_response(
                                &session_manager,
                                &session_id,
                                &elicitation_id,
                                elicitation_response_from_acp(response.0),
                            )
                            .await;
                        }
                    }
                    Err(error) => {
                        tracing::debug!(?error, "ACP elicitation connection detached");
                        super::GooseAcpAgent::detach_run_connection(
                            &Arc::downgrade(&attachment),
                            generation,
                        )
                        .await;
                    }
                }
                Ok(())
            })
            .is_err()
        {
            super::GooseAcpAgent::detach_run_connection(&Arc::downgrade(attachment), generation)
                .await;
        }
    }

    pub(super) async fn handle_form_elicitation(
        &self,
        cx: &ConnectionTo<Client>,
        session_id: &SessionId,
        elicitation_id: &str,
        message: &str,
        requested_schema: &serde_json::Value,
        meta: Meta,
    ) -> Result<(), agent_client_protocol::Error> {
        if self.supports_acp_elicitation() {
            self.send_form_elicitation(
                cx,
                session_id,
                elicitation_id,
                message,
                requested_schema,
                meta,
            )
            .await?;
        } else {
            warn!(
                session_id = %session_id.0.as_ref(),
                elicitation_id = %elicitation_id,
                "ACP client does not support form elicitation"
            );
            self.cancel_form_elicitation(session_id.0.as_ref(), elicitation_id)
                .await;
        }

        Ok(())
    }

    async fn send_form_elicitation(
        &self,
        cx: &ConnectionTo<Client>,
        session_id: &SessionId,
        elicitation_id: &str,
        message: &str,
        requested_schema: &serde_json::Value,
        meta: Meta,
    ) -> Result<(), agent_client_protocol::Error> {
        let session_id = session_id.0.as_ref().to_string();
        let elicitation_id = elicitation_id.to_string();
        if requested_schema
            .get("url")
            .and_then(|url| url.as_str())
            .is_some()
        {
            warn!(
                session_id = %session_id,
                elicitation_id = %elicitation_id,
                "ACP URL elicitation is not supported"
            );
            record_acp_elicitation_response(
                &self.session_manager,
                &session_id,
                &elicitation_id,
                ElicitationOutcome::Cancel,
            )
            .await;
            return Ok(());
        }

        let requested_schema: ElicitationSchema =
            match serde_json::from_value(requested_schema.clone()) {
                Ok(schema) => schema,
                Err(error) => {
                    record_acp_elicitation_response(
                        &self.session_manager,
                        &session_id,
                        &elicitation_id,
                        ElicitationOutcome::Cancel,
                    )
                    .await;
                    return Err(agent_client_protocol::Error::internal_error()
                        .data(format!("Failed to parse ACP elicitation schema: {error}")));
                }
            };
        let request = CreateElicitationRequest::new(
            ElicitationFormMode::new(
                ElicitationSessionScope::new(session_id.clone()),
                requested_schema,
            ),
            message.to_string(),
        )
        .meta(meta);

        let callback_session_manager = Arc::clone(&self.session_manager);
        let callback_session_id = session_id.clone();
        let callback_elicitation_id = elicitation_id.clone();
        if let Err(error) = cx
            .send_request(CreateElicitationRequestMessage(request))
            .on_receiving_result(move |result| async move {
                let response = match result {
                    Ok(response) => elicitation_response_from_acp(response.0),
                    Err(error) => {
                        warn!(
                            error = %error,
                            session_id = %callback_session_id,
                            elicitation_id = %callback_elicitation_id,
                            "ACP elicitation request failed"
                        );
                        ElicitationOutcome::Cancel
                    }
                };

                record_acp_elicitation_response(
                    &callback_session_manager,
                    &callback_session_id,
                    &callback_elicitation_id,
                    response,
                )
                .await;

                Ok(())
            })
        {
            record_acp_elicitation_response(
                &self.session_manager,
                &session_id,
                &elicitation_id,
                ElicitationOutcome::Cancel,
            )
            .await;
            return Err(error);
        }

        Ok(())
    }

    async fn cancel_form_elicitation(&self, session_id: &str, elicitation_id: &str) {
        record_acp_elicitation_response(
            &self.session_manager,
            session_id,
            elicitation_id,
            ElicitationOutcome::Cancel,
        )
        .await;
    }
}

async fn connection_session_id(attachment: &super::RunAttachment) -> String {
    attachment.state.lock().await.session_id.clone()
}

#[derive(Debug, Clone)]
struct CreateElicitationRequestMessage(CreateElicitationRequest);

impl JsonRpcMessage for CreateElicitationRequestMessage {
    fn matches_method(method: &str) -> bool {
        method == CLIENT_METHOD_NAMES.elicitation_create
    }

    fn method(&self) -> &str {
        CLIENT_METHOD_NAMES.elicitation_create
    }

    fn to_untyped_message(&self) -> Result<UntypedMessage, agent_client_protocol::Error> {
        UntypedMessage::new(CLIENT_METHOD_NAMES.elicitation_create, &self.0)
    }

    fn parse_message(
        method: &str,
        params: &impl serde::Serialize,
    ) -> Result<Self, agent_client_protocol::Error> {
        if !Self::matches_method(method) {
            return Err(agent_client_protocol::Error::method_not_found());
        }

        Ok(Self(agent_client_protocol::util::json_cast_params(params)?))
    }
}

impl JsonRpcRequest for CreateElicitationRequestMessage {
    type Response = CreateElicitationResponseMessage;
}

#[derive(Debug, Clone)]
struct CreateElicitationResponseMessage(CreateElicitationResponse);

impl JsonRpcResponse for CreateElicitationResponseMessage {
    fn into_json(self, _method: &str) -> Result<serde_json::Value, agent_client_protocol::Error> {
        serde_json::to_value(self.0).map_err(agent_client_protocol::Error::into_internal_error)
    }

    fn from_value(
        _method: &str,
        value: serde_json::Value,
    ) -> Result<Self, agent_client_protocol::Error> {
        Ok(Self(agent_client_protocol::util::json_cast(&value)?))
    }
}

pub(super) fn client_supports_form_elicitation(
    args: &agent_client_protocol::schema::v1::InitializeRequest,
) -> bool {
    args.client_capabilities
        .elicitation
        .as_ref()
        .and_then(|elicitation| elicitation.form.as_ref())
        .is_some()
}

fn elicitation_response_from_acp(response: CreateElicitationResponse) -> ElicitationOutcome {
    match response.action {
        AcpElicitationAction::Accept(action) => {
            let content = serde_json::to_value(action.content.unwrap_or_default())
                .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()));
            ElicitationOutcome::Accept(content)
        }
        AcpElicitationAction::Decline => ElicitationOutcome::Decline,
        AcpElicitationAction::Cancel => ElicitationOutcome::Cancel,
        action => {
            warn!(?action, "Unsupported ACP elicitation action");
            ElicitationOutcome::Cancel
        }
    }
}

async fn record_acp_elicitation_response(
    session_manager: &SessionManager,
    session_id: &str,
    elicitation_id: &str,
    response: ElicitationOutcome,
) {
    if let Err(error) = crate::elicitation::complete_elicitation_with_generated_message(
        session_manager,
        session_id,
        elicitation_id,
        response,
    )
    .await
    {
        warn!(
            error = %error,
            session_id = %session_id,
            elicitation_id = %elicitation_id,
            "Failed to record ACP elicitation response"
        );
    }
}
