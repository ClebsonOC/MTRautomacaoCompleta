// assinador/preload.js - Script de pré-carregamento (Versão Final Corrigida)

const { contextBridge, ipcRenderer } = require('electron');

// Expõe um objeto 'electronAPI' para a janela do assinador de forma segura
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Funções que o Renderer pode invocar no Main ---
    getInitialData: () => ipcRenderer.invoke('get-initial-data'),
    getSignaturePreview: (args) => ipcRenderer.invoke('get-signature-preview', args),
    saveSignaturePosition: (args) => ipcRenderer.invoke('save-signature-position', args),
    processPdfs: (args) => ipcRenderer.invoke('process-pdfs', args),

    // --- Funções para o Renderer ouvir eventos do Main ---
    // CORREÇÃO: Simplificado para garantir robustez.
    onProcessStatus: (callback) => ipcRenderer.on('process-status', (event, message) => callback(message)),
    onProcessError: (callback) => ipcRenderer.on('process-error', (event, message) => callback(message)),
});
