// preload.js - Expõe APIs do Node.js/Electron para o renderer de forma segura

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Funções que o renderer pode invocar (Renderer -> Main)
    startAutomation: (config) => ipcRenderer.send('start-automation', config),
    openAssinadorWindow: () => ipcRenderer.send('open-assinador-window'), // <-- NOVO
    selectExcelFile: () => ipcRenderer.invoke('dialog:selectExcel'),
    selectRootFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    showAboutDialog: () => ipcRenderer.invoke('dialog:showAbout'),

    // Funções para o renderer ouvir eventos do processo principal (Main -> Renderer)
    onLogMessage: (callback) => {
        ipcRenderer.removeAllListeners('log-message');
        ipcRenderer.on('log-message', (event, ...args) => callback(...args));
    },
    onProgressUpdate: (callback) => {
        ipcRenderer.removeAllListeners('progress-update');
        ipcRenderer.on('progress-update', (event, ...args) => callback(...args));
    },
    onAutomationFinished: (callback) => {
        ipcRenderer.removeAllListeners('automation-finished');
        ipcRenderer.on('automation-finished', (event, ...args) => callback(...args));
    },
});
