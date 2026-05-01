/**
 * Preload script — context bridge.
 *
 * Expone una API mínima al renderer (el SaaS cargado en la BrowserWindow).
 * Desde el código web podrás usar:
 *   window.studioflow?.getVersion()
 *   window.studioflow?.checkUpdates()
 *
 * Ojo: el `?` es importante. En el navegador normal (usuarios sin la app
 * desktop) `window.studioflow` no existe, así que hay que feature-detectar.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('studioflow', {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
})
