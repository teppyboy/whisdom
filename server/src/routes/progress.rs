use axum::extract::{Path, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::Stream;
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;

use crate::auth::{extract_bearer, verify_token};
use crate::error::AppError;
use crate::job::JobId;
use crate::AppState;

pub async fn progress(
    State(state): State<AppState>,
    Path(id): Path<JobId>,
    headers: axum::http::HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(extract_bearer)
        .unwrap_or("");
    let email = verify_token(&state.config, token).await?;

    let job = state.queue.get(&id).await.ok_or(AppError::NotFound)?;
    {
        let j = job.lock().await;
        if j.email != email {
            return Err(AppError::Unauthorized);
        }
    }

    let rx = state.queue.subscribe(&id).await?;
    let current_status = {
        let j = job.lock().await;
        j.status()
    };

    let (tx, rx_events) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(256);

    let _ = tx.send(Ok(Event::default().json_data(current_status).unwrap())).await;

    let tx2 = tx.clone();
    tokio::spawn(async move {
        let mut status_stream = BroadcastStream::new(rx);
        while let Some(msg) = tokio_stream::StreamExt::next(&mut status_stream).await {
            match msg {
                Ok(status) => {
                    if let Ok(event) = Event::default().json_data(status) {
                        if tx2.send(Ok(event)).await.is_err() {
                            break;
                        }
                    }
                }
                Err(_) => {}
            }
        }
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx_events);

    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}
