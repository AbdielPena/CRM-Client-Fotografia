// StudioFlow — Desktop entry point con auto-update via GitHub Releases
//
// El plugin updater chequea contra el endpoint definido en tauri.conf.json:
//   https://github.com/AbdielPena/CRM-Client-Fotografia/releases/latest/download/latest.json
//
// Si hay una versión nueva, muestra un dialog al usuario para descargarla
// e instalarla automáticamente. Las firmas se verifican con la pubkey
// que también está en tauri.conf.json (la priv key vive en GitHub Secrets).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running StudioFlow desktop app");
}
