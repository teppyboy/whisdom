use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
#[cfg(target_os = "macos")]
use tauri::{ActivationPolicy, RunEvent};
use tauri::{Manager, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::sync::oneshot;
use whisdom_server::helper;
use whisdom_server::helper::auth::HelperAuth;
use whisdom_server::helper::cache::HelperCache;
use whisdom_server::helper::config::{default_root, HelperConfig};
use whisdom_server::helper::engine::SharedRuntime;
use whisdom_server::helper::events::EventHub;
use whisdom_server::helper::logging::{self, HelperLogGuard};
use whisdom_server::helper::selection::SelectionStore;
use whisdom_server::helper::state::{HelperQueue, HelperState, NativeFilePicker};

fn ensure_companion_root() {
    if std::env::var_os("WHISDOM_HELPER_ROOT").is_some() {
        return;
    }
    std::env::set_var("WHISDOM_HELPER_ROOT", default_root("Companion"));
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("error while building Whisdom Companion")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if matches!(event, RunEvent::Reopen { .. }) {
                show_main_window(app);
            }
        });
}

#[cfg(target_os = "macos")]
fn show_main_window(app: &tauri::AppHandle) {
    let _ = app.set_activation_policy(ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    let _ = app.set_activation_policy(ActivationPolicy::Accessory);
}

#[cfg(not(target_os = "macos"))]
fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn setup(app: &mut tauri::App<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    // Tray-only app: hide the Dock icon on macOS.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    let handle = app.handle().clone();
    let status = MenuItem::with_id(
        app,
        "status",
        "Whisdom Companion is running",
        false,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(app, "open", "Open Whisdom", true, None::<&str>)?;
    let autostart_label = "Launch at login";
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        autostart_label,
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&status, &open, &autostart, &quit])?;

    TrayIconBuilder::new()
        // macOS renders an empty menu bar item without an icon.
        .icon(tauri::include_image!("icons/128x128.png"))
        .menu(&menu)
        .tooltip("Whisdom Companion")
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "autostart" => {
                let enabled = app.autolaunch().is_enabled().unwrap_or(false);
                let result = if enabled {
                    app.autolaunch().disable()
                } else {
                    app.autolaunch().enable()
                };
                if let Err(error) = result {
                    tracing::error!(error = %error, "failed to update autostart setting");
                }
            }
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Closing the window hides it; the tray Quit item exits the app.
    if let Some(window) = app.get_webview_window("main") {
        let window_handle = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_main_window(window_handle.app_handle());
            }
        });
    }

    ensure_companion_root();
    HelperConfig::from_env()?;
    let picker_handle = handle.clone();
    let native_file_picker: NativeFilePicker = Arc::new(move || {
        let app_handle = picker_handle.clone();
        Box::pin(async move {
            let (sender, receiver) = oneshot::channel::<Vec<PathBuf>>();
            show_main_window(&app_handle);
            app_handle
                .dialog()
                .file()
                .add_filter(
                    "Media",
                    &[
                        "mp3", "m4a", "wav", "flac", "ogg", "mp4", "mkv", "mov", "webm",
                    ],
                )
                .pick_files(move |picked| {
                    let paths = picked
                        .unwrap_or_default()
                        .into_iter()
                        .filter_map(|entry| match entry {
                            FilePath::Path(path) => Some(path),
                            _ => None,
                        })
                        .collect();
                    let _ = sender.send(paths);
                });
            receiver.await.map_err(|_| {
                helper::protocol::HelperError::BadRequest(
                    "native picker closed unexpectedly".into(),
                )
            })
        })
    });

    tauri::async_runtime::spawn(async move {
        let config = match HelperConfig::from_env() {
            Ok(config) => config,
            Err(error) => {
                tracing::error!(error = %error, "companion configuration failed");
                handle.exit(1);
                return;
            }
        };
        if let Err(error) = config.create_dirs().await {
            tracing::error!(error = %error, "companion cache initialization failed");
            handle.exit(1);
            return;
        }
        let auth = match HelperAuth::load(&config).await {
            Ok(auth) => auth,
            Err(error) => {
                tracing::error!(error = %error, "companion authentication initialization failed");
                handle.exit(1);
                return;
            }
        };
        let cache = HelperCache::new(config.clone());
        let events = EventHub::new();
        let state = Arc::new(HelperState {
            config,
            auth,
            cache,
            queue: HelperQueue::default().with_events(events.clone()),
            events: events.clone(),
            runtime: SharedRuntime::default(),
            selections: SelectionStore::default(),
            native_file_picker: Some(native_file_picker),
            update_check: None,
            update_install: None,
        });
        let log_guard: HelperLogGuard = match logging::init(&state.config, &state.events) {
            Ok(guard) => guard,
            Err(error) => {
                handle
                    .dialog()
                    .message(error.to_string())
                    .title("Whisdom Companion")
                    .blocking_show();
                handle.exit(1);
                return;
            }
        };
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, state.config.port));
        let listener = match tokio::net::TcpListener::bind(address).await {
            Ok(listener) => listener,
            Err(error) => {
                tracing::error!(%address, error = %error, "companion API bind failed");
                handle
                    .dialog()
                    .message(format!("Could not start local API on {address}: {error}"))
                    .title("Whisdom Companion")
                    .blocking_show();
                handle.exit(1);
                return;
            }
        };
        tracing::info!(%address, "Whisdom Companion API listening");
        let _log_guard = log_guard;
        if let Err(error) = axum::serve(listener, helper::api::router(state)).await {
            tracing::error!(error = %error, "companion API stopped");
            handle.exit(1);
        }
    });

    Ok(())
}
