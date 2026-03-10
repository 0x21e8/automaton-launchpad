use crate::types::{AutomatonRuntimeState, FactoryError, CONTROLLER_FIELD};

pub fn add_controller(runtime: &mut AutomatonRuntimeState, controller: &str) {
    if runtime.controllers.iter().all(|entry| entry != controller) {
        runtime.controllers.push(controller.to_string());
    }
}

pub fn remove_controller(runtime: &mut AutomatonRuntimeState, controller: &str) {
    runtime.controllers.retain(|entry| entry != controller);
}

pub fn complete_controller_handoff(
    runtime: &mut AutomatonRuntimeState,
    factory_controller: &str,
) -> Result<String, FactoryError> {
    let self_controller = runtime.canister_id.clone();
    add_controller(runtime, &self_controller);
    remove_controller(runtime, factory_controller);

    if runtime.controllers != vec![self_controller.clone()] {
        return Err(FactoryError::ControllerInvariantViolation {
            canister_id: runtime.canister_id.clone(),
        });
    }

    let controller = format!("{CONTROLLER_FIELD}:{self_controller}");
    Ok(controller)
}
