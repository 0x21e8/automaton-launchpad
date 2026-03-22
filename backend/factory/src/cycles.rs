use crate::state::{current_canister_balance, read_state};
use crate::types::FactoryError;

use ic_cdk::management_canister::{HttpRequestArgs, SignWithEcdsaArgs};

fn min_pool_balance_cycles() -> u128 {
    read_state(|state| u128::from(state.min_pool_balance))
}

fn ensure_follow_up_cycles(
    operation: impl Into<String>,
    operation_cycles: u128,
) -> Result<(), FactoryError> {
    let available = current_canister_balance();
    let required = operation_cycles;
    if available < required {
        return Err(FactoryError::InsufficientCyclesForOperation {
            operation: operation.into(),
            available,
            required,
        });
    }

    Ok(())
}

pub(crate) fn ensure_spawn_creation_cycles(
    required_create_cycles: u128,
) -> Result<(), FactoryError> {
    let available = current_canister_balance();
    let required = required_create_cycles.saturating_add(min_pool_balance_cycles());
    if available < required {
        return Err(FactoryError::InsufficientCyclesPool {
            available,
            required,
        });
    }

    Ok(())
}

pub(crate) fn ensure_http_request_cycles(
    operation: &str,
    request: &HttpRequestArgs,
) -> Result<(), FactoryError> {
    ensure_follow_up_cycles(
        format!("http_request:{operation}"),
        http_request_cycle_cost(request),
    )
}

pub(crate) fn ensure_sign_with_ecdsa_cycles(
    operation: &str,
    request: &SignWithEcdsaArgs,
) -> Result<(), FactoryError> {
    ensure_follow_up_cycles(operation.to_string(), sign_with_ecdsa_cycle_cost(request)?)
}

#[cfg(target_arch = "wasm32")]
fn http_request_cycle_cost(request: &HttpRequestArgs) -> u128 {
    ic_cdk::management_canister::cost_http_request(request)
}

#[cfg(not(target_arch = "wasm32"))]
fn http_request_cycle_cost(request: &HttpRequestArgs) -> u128 {
    let request_size = (request.url.len()
        + request
            .headers
            .iter()
            .map(|header| header.name.len() + header.value.len())
            .sum::<usize>()
        + request.body.as_ref().map_or(0, Vec::len)
        + request.transform.as_ref().map_or(0, |transform| {
            transform.context.len() + transform.function.0.method.len()
        })) as u128;
    let max_response_bytes = u128::from(request.max_response_bytes.unwrap_or(2_000_000));

    // Tests cannot ask the replica for real cycle pricing, so use a deterministic
    // structural estimate that still exercises admission control paths.
    request_size.saturating_add(max_response_bytes)
}

#[cfg(target_arch = "wasm32")]
fn sign_with_ecdsa_cycle_cost(request: &SignWithEcdsaArgs) -> Result<u128, FactoryError> {
    ic_cdk::management_canister::cost_sign_with_ecdsa(request).map_err(|error| {
        FactoryError::ManagementCallFailed {
            method: "sign_with_ecdsa".to_string(),
            message: format!("unable to estimate signing cycle cost: {error}"),
        }
    })
}

#[cfg(not(target_arch = "wasm32"))]
fn sign_with_ecdsa_cycle_cost(request: &SignWithEcdsaArgs) -> Result<u128, FactoryError> {
    Ok(50_000_u128
        .saturating_add((request.message_hash.len() as u128).saturating_mul(512))
        .saturating_add((request.key_id.name.len() as u128).saturating_mul(128)))
}
