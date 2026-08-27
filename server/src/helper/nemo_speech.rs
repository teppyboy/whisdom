//! Optional NeMo-Speech.cpp Vulkan adapter boundary.
//!
//! The Companion never invokes a CLI or HTTP server. The C ABI is intentionally
//! feature-gated until a pinned SDK build and its backend diagnostics are packaged.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BackendStatus {
    pub requested: &'static str,
    pub active: &'static str,
    pub cpu_nodes: u32,
}

pub fn validate_vulkan_status(status: &BackendStatus) -> Result<(), &'static str> {
    if status.requested != "vulkan" || status.active != "vulkan" {
        return Err("Vulkan backend was not selected");
    }
    if status.cpu_nodes != 0 {
        return Err("Vulkan backend has CPU graph fallback");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parakeet_result_when_vulkan_was_requested_but_cpu_nodes_ran() {
        assert!(validate_vulkan_status(&BackendStatus {
            requested: "vulkan",
            active: "vulkan",
            cpu_nodes: 1,
        })
        .is_err());
    }

    #[test]
    fn accepts_timestamped_vulkan_result_without_cpu_nodes() {
        assert!(validate_vulkan_status(&BackendStatus {
            requested: "vulkan",
            active: "vulkan",
            cpu_nodes: 0,
        })
        .is_ok());
    }
}
