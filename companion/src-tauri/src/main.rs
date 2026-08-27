use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::oneshot;
use whisdom_server::helper;
use whisdom_server::helper::auth::HelperAuth;
use whisdom_server::helper::cache::HelperCache;
use whisdom_server::helper::config::HelperConfig;
use whisdom_server::helper::logging::{self, HelperLogGuard};
use whisdom_server::helper::selection::SelectionStore;
use whisdom_server::helper::state::{
    HelperQueue, HelperState, HelperUpdateInfo, NativeFilePicker, UpdateCheck, UpdateInstall,
};
use whisdom_server::helper::transcribe::SharedModel;

fn update_check(handle: &tauri::AppHandle<Wry>) -> UpdateCheck {
    let handle = handle.clone();
    Arc::new(move || {
        let handle = handle.clone();
        Box::pin(async move {
            let update = handle
                .updater()
                .map_err(|error| helper::protocol::HelperError::Update(error.to_string()))?
                .check()
                .await
                .map_err(|error| helper::protocol::HelperError::Update(error.to_string()))?;
            Ok(update.map(|update| HelperUpdateInfo {
                version: update.version,
                body: update.body,
            }))
        })
    })
}

fn update_install(handle: &tauri::AppHandle<Wry>) -> UpdateInstall {
    let handle = handle.clone();
    Arc::new(move || {
        let handle = handle.clone();
        Box::pin(async move {
            let update = handle
                .updater()
                .map_err(|error| helper::protocol::HelperError::Update(error.to_string()))?
                .check()
                .await
                .map_err(|error| helper::protocol::HelperError::Update(error.to_string()))?;
            if let Some(update) = update {
                update
                    .download_and_install(|_, _| {}, || {})
                    .await
                    .map_err(|error| helper::protocol::HelperError::Update(error.to_string()))?;
            }
            Ok(())
        })
    })
}

fn ensure_companion_root() {
    if std::env::var_os("WHISDOM_HELPER_ROOT").is_some() {
        return;
    }
    let root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Whisdom")
        .join("Companion");
    std::env::set_var("WHISDOM_HELPER_ROOT", root);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(setup)
        .run(tauri::generate_context!())
        .expect("error while running Whisdom Companion");
}

fn setup(app: &mut tauri::App<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let status = MenuItem::with_id(
        app,
        "status",
        "Whisdom Companion is running",
        false,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start with Windows",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&status, &autostart, &quit])?;

    TrayIconBuilder::new()
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
                    tracing::error!(error = %error, "failed to update Windows startup setting");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    ensure_companion_root();
    HelperConfig::from_env()?;
    let picker_handle = handle.clone();
    let native_file_picker: NativeFilePicker = Arc::new(move || {
        let app_handle = picker_handle.clone();
        Box::pin(async move {
            let (sender, receiver) = oneshot::channel::<Vec<PathBuf>>();
            if let Some(window) = app_handle.get_webview_window("main") {
                if let Err(error) = window
                    .show()
                    .and_then(|_| window.unminimize())
                    .and_then(|_| window.set_focus())
                {
                    tracing::warn!(error = %error, "failed to activate Companion before opening native picker");
                }
            }
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
        let state = Arc::new(HelperState {
            config,
            auth,
            cache,
            queue: HelperQueue::default(),
            model: SharedModel::default(),
            selections: SelectionStore::default(),
            native_file_picker: Some(native_file_picker),
            update_check: Some(update_check(&handle)),
            update_install: Some(update_install(&handle)),
        });
        let log_guard: HelperLogGuard = match logging::init(&state.config) {
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
