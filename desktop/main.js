/**
 * StudioFlow — Electron main process (Fase 6).
 *
 * Thin shell: carga la URL del SaaS (hosted) en una BrowserWindow.
 * En modo dev lanza/espera un Next local antes de abrir la ventana.
 *
 * Auto-update: via electron-updater + GitHub Releases. La config del feed
 * vive en `electron-builder.yml` (publish:). En dev (sin ASAR) el updater
 * no corre — solo en builds empaquetados.
 */

const { app, BrowserWindow, Menu, shell, ipcMain, dialog, Notification } =
  require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IS_DEV = !app.isPackaged
const DEFAULT_URL = process.env.STUDIOFLOW_URL || 'https://app.studioflow.do'
const DEV_URL = 'http://localhost:3000'
const TARGET_URL = IS_DEV ? DEV_URL : DEFAULT_URL

// ---------------------------------------------------------------------------
// Single-instance lock (evita dos ventanas al hacer doble-click)
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ---------------------------------------------------------------------------
// Window factory
// ---------------------------------------------------------------------------

/** @type {BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'StudioFlow',
    backgroundColor: '#0B0B10',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Links externos (mailto:, http externos) se abren en el navegador
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const targetHost = safeHost(url)
    const appHost = safeHost(TARGET_URL)
    if (targetHost && appHost && targetHost !== appHost) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Redirects fuera del dominio de la app también al browser
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const targetHost = safeHost(url)
    const appHost = safeHost(TARGET_URL)
    if (targetHost && appHost && targetHost !== appHost) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(TARGET_URL).catch((err) => {
    console.error('[main] loadURL failed:', err)
    dialog.showErrorBox(
      'No se pudo conectar',
      `No se pudo cargar ${TARGET_URL}.\n\nRevisa tu conexión a internet e intenta de nuevo.`,
    )
  })
}

function safeHost(u) {
  try {
    return new URL(u).host
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Menu (minimal, sin File/Edit dev stuff)
// ---------------------------------------------------------------------------

function buildMenu() {
  const template = [
    {
      label: 'StudioFlow',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Buscar actualizaciones',
          click: () => {
            if (!IS_DEV) autoUpdater.checkForUpdates().catch(console.error)
            else
              dialog.showMessageBox({
                message: 'Las actualizaciones solo se revisan en builds empaquetados.',
              })
          },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'minimize' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function setupAutoUpdater() {
  if (IS_DEV) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err)
  })

  autoUpdater.on('update-available', (info) => {
    new Notification({
      title: 'Actualización disponible',
      body: `StudioFlow ${info.version} se está descargando…`,
    }).show()
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Reiniciar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
        title: 'Actualización lista',
        message: `StudioFlow ${info.version} está lista para instalarse.`,
        detail: 'Se reiniciará la app para aplicar la actualización.',
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall()
      })
  })

  // Chequeo inicial tras 5s, luego cada 4h
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 5_000)
  setInterval(
    () => autoUpdater.checkForUpdatesAndNotify().catch(() => {}),
    4 * 60 * 60 * 1000,
  )
}

// ---------------------------------------------------------------------------
// IPC (para que el preload pueda preguntar versión / forzar check)
// ---------------------------------------------------------------------------

ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:check-updates', async () => {
  if (IS_DEV) return { ok: false, reason: 'dev' }
  try {
    const res = await autoUpdater.checkForUpdates()
    return { ok: true, version: res?.updateInfo.version }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
