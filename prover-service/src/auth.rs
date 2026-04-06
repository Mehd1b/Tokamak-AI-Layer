use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Account tier determines rate limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Free,
    Paid,
}

impl Tier {
    /// Maximum proof requests per hour for this tier.
    pub fn hourly_limit(self) -> u32 {
        match self {
            Tier::Free => 10,
            Tier::Paid => 100,
        }
    }
}

/// Metadata associated with an API key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyInfo {
    pub name: String,
    pub tier: Tier,
    /// Number of requests in the current rate-limit window.
    pub requests_in_window: u32,
    /// Start of the current rate-limit window.
    pub window_start: DateTime<Utc>,
}

/// Thread-safe API key store.
#[derive(Clone)]
pub struct ApiKeyStore {
    keys: Arc<RwLock<HashMap<String, ApiKeyInfo>>>,
}

impl ApiKeyStore {
    /// Create a new store, optionally seeded with keys from the environment.
    ///
    /// Format of `seed_keys`: comma-separated `key:name:tier` triples.
    /// Example: `sk-abc123:alice:paid,sk-def456:bob:free`
    pub fn new(seed_keys: Option<&str>) -> Self {
        let mut map = HashMap::new();

        if let Some(raw) = seed_keys {
            for entry in raw.split(',') {
                let parts: Vec<&str> = entry.trim().split(':').collect();
                if parts.len() == 3 {
                    let key = parts[0].to_string();
                    let name = parts[1].to_string();
                    let tier = match parts[2].to_lowercase().as_str() {
                        "paid" => Tier::Paid,
                        _ => Tier::Free,
                    };
                    map.insert(
                        key,
                        ApiKeyInfo {
                            name,
                            tier,
                            requests_in_window: 0,
                            window_start: Utc::now(),
                        },
                    );
                }
            }
        }

        // Always register a default dev key when no keys are configured so the
        // service is usable out of the box in development.
        if map.is_empty() {
            map.insert(
                "dev-test-key".to_string(),
                ApiKeyInfo {
                    name: "development".to_string(),
                    tier: Tier::Paid,
                    requests_in_window: 0,
                    window_start: Utc::now(),
                },
            );
        }

        Self {
            keys: Arc::new(RwLock::new(map)),
        }
    }

    /// Validate and rate-limit a request. Returns the key info on success.
    pub async fn check(&self, api_key: &str) -> Result<ApiKeyInfo, AuthError> {
        let mut keys = self.keys.write().await;

        let info = keys.get_mut(api_key).ok_or(AuthError::InvalidKey)?;

        // Rotate window if the current one has expired (1 hour).
        let now = Utc::now();
        let elapsed = now.signed_duration_since(info.window_start).num_seconds();
        if elapsed >= 3600 {
            info.requests_in_window = 0;
            info.window_start = now;
        }

        // Check rate limit.
        if info.requests_in_window >= info.tier.hourly_limit() {
            return Err(AuthError::RateLimited {
                limit: info.tier.hourly_limit(),
                resets_in_secs: (3600 - elapsed).max(0) as u32,
            });
        }

        info.requests_in_window += 1;
        Ok(info.clone())
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum AuthError {
    MissingHeader,
    InvalidKey,
    RateLimited { limit: u32, resets_in_secs: u32 },
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingHeader => write!(f, "Missing X-API-Key header"),
            Self::InvalidKey => write!(f, "Invalid API key"),
            Self::RateLimited {
                limit,
                resets_in_secs,
            } => write!(
                f,
                "Rate limited: {limit}/hour exceeded, resets in {resets_in_secs}s"
            ),
        }
    }
}

impl AuthError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::MissingHeader | Self::InvalidKey => StatusCode::UNAUTHORIZED,
            Self::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
        }
    }
}

// ---------------------------------------------------------------------------
// Axum extractor
// ---------------------------------------------------------------------------

/// Axum extractor that validates the API key from `X-API-Key` header.
///
/// Usage in a handler:
/// ```ignore
/// async fn my_handler(auth: AuthenticatedKey, ...) -> ... { }
/// ```
#[allow(dead_code)]
pub struct AuthenticatedKey(pub ApiKeyInfo);

#[axum::async_trait]
impl FromRequestParts<crate::AppState> for AuthenticatedKey {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &crate::AppState,
    ) -> Result<Self, Self::Rejection> {
        let api_key = parts
            .headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    "Missing X-API-Key header".to_string(),
                )
            })?;

        let info = state
            .key_store
            .check(api_key)
            .await
            .map_err(|e| (e.status_code(), e.to_string()))?;

        Ok(AuthenticatedKey(info))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_default_dev_key() {
        let store = ApiKeyStore::new(None);
        let info = store.check("dev-test-key").await.unwrap();
        assert_eq!(info.name, "development");
        assert_eq!(info.tier, Tier::Paid);
    }

    #[tokio::test]
    async fn test_seed_keys_parsing() {
        let store = ApiKeyStore::new(Some("sk-aaa:alice:paid,sk-bbb:bob:free"));
        assert!(store.check("sk-aaa").await.is_ok());
        assert!(store.check("sk-bbb").await.is_ok());
        assert!(store.check("sk-nope").await.is_err());
    }

    #[tokio::test]
    async fn test_rate_limiting() {
        let store = ApiKeyStore::new(Some("sk-test:tester:free"));
        // Free tier = 10/hour.
        for _ in 0..10 {
            store.check("sk-test").await.unwrap();
        }
        let err = store.check("sk-test").await.unwrap_err();
        assert!(matches!(err, AuthError::RateLimited { .. }));
    }

    #[tokio::test]
    async fn test_invalid_key() {
        let store = ApiKeyStore::new(None);
        let err = store.check("bad-key").await.unwrap_err();
        assert!(matches!(err, AuthError::InvalidKey));
    }
}
