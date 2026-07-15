#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
use serde::{Deserialize, Serialize};

mod sidecar;
use sidecar::{SidecarManager, SidecarError};

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SidecarResponse {
    success: bool,
    port: Option<u32>,
    error: Option<String>,
}

#[tauri::command]
async fn start_sidecar(
    dir: String,
    app_handle: tauri::AppHandle,
) -> Result<SidecarResponse, String> {
    let manager = app_handle.state::<SidecarManager>();

    match manager.start(&dir).await {
        Ok(port) => Ok(SidecarResponse {
            success: true,
            port: Some(port),
            error: None,
        }),
        Err(e) => {
            let msg = match e {
                SidecarError::PythonNotFound { found_version } => {
                    format!(
                        "python_not_found|Python {} found, but Python 3.13+ is required.\n\
                         Please install Python 3.13 or later from https://www.python.org/downloads/",
                        found_version.as_deref().unwrap_or("not installed")
                    )
                }
                SidecarError::DependencyMissing { package, python_path } => {
                    format!(
                        "dependency_missing|Package '{}' is not installed.\n\
                         Run: {} -m pip install {}",
                        package, python_path, package
                    )
                }
                SidecarError::SpawnFailed { reason } => {
                    format!("spawn_failed|{}", reason)
                }
                SidecarError::HealthCheckFailed { port } => {
                    format!(
                        "health_check_failed|Sidecar on port {} did not respond.",
                        port
                    )
                }
            };
            Ok(SidecarResponse {
                success: false,
                port: None,
                error: Some(msg),
            })
        }
    }
}

#[tauri::command]
async fn stop_sidecar(app_handle: tauri::AppHandle) -> Result<SidecarResponse, String> {
    let manager = app_handle.state::<SidecarManager>();
    manager.stop().await;
    Ok(SidecarResponse {
        success: true,
        port: None,
        error: None,
    })
}

#[tauri::command]
fn get_sidecar_port(app_handle: tauri::AppHandle) -> u32 {
    let manager = app_handle.state::<SidecarManager>();
    manager.get_port()
}

#[tauri::command]
fn get_sidecar_auth_token(app_handle: tauri::AppHandle) -> String {
    let manager = app_handle.state::<SidecarManager>();
    manager.get_auth_token()
}

#[tauri::command]
async fn get_health(port: u32) -> Result<String, String> {
    let url = format!("http://127.0.0.1:{}/api/health", port);
    reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(SidecarManager::new())
        .setup(|app| {
            let sidecar_manager = app.state::<SidecarManager>();

            sidecar_manager.on_stdout(move |line| {
                println!("[sidecar] {}", line);
            });

            sidecar_manager.on_stderr(move |line| {
                eprintln!("[sidecar err] {}", line);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let manager = window.app_handle().state::<SidecarManager>();
                tauri::async_runtime::block_on(manager.stop());
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_sidecar,
            stop_sidecar,
            get_sidecar_port,
            get_sidecar_auth_token,
            get_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
