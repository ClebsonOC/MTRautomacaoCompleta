// preload.js - Expõe APIs do Node.js/Electron para o renderer de forma segura (Versão Final Corrigida)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Funções que o renderer pode invocar (Renderer -> Main)
    startAutomation: (config) => ipcRenderer.send('start-automation', config),
    openAssinadorWindow: () => ipcRenderer.send('open-assinador-window'),
    selectExcelFile: () => ipcRenderer.invoke('dialog:selectExcel'),
    selectRootFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    showAboutDialog: () => ipcRenderer.invoke('dialog:showAbout'),

    // Funções para o renderer ouvir eventos do processo principal (Main -> Renderer)
    // Forma simplificada e mais robusta de definir os listeners, que garante o funcionamento.
    onLogMessage: (callback) => ipcRenderer.on('log-message', callback),
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', callback),
    onAutomationFinished: (callback) => ipcRenderer.on('automation-finished', callback),
});
