// electron-main.js - Processo principal do Electron (v3.1 - Caminhos de Produção Corrigidos)

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const isDev = !app.isPackaged;

let mainWindow;
let assinadorWindow;

// --- FUNÇÕES DE JANELA ---

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 950,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'public', 'logo_inea.jpg')
    });
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

function createAssinadorWindow() {
    if (assinadorWindow) {
        assinadorWindow.focus();
        return;
    }
    assinadorWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        minWidth: 1100,
        minHeight: 700,
        title: 'Ferramenta de Assinatura de PDF',
        webPreferences: {
            // CORREÇÃO: Caminho do preload do assinador também precisa ser ajustado
            preload: path.join(__dirname, 'assinador', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assinador', 'public', 'assets', 'icon.png')
    });
    assinadorWindow.loadFile(path.join(__dirname, 'assinador', 'public', 'index.html'));
    assinadorWindow.on('closed', () => {
        assinadorWindow = null;
    });
}

// --- LÓGICA DE EXECUÇÃO PYTHON ---

function getPythonExecutablePath() {
    const execPath = isDev
      ? path.join(__dirname, 'vendor', 'python-portable', 'python.exe')
      // O caminho para o executável já estava correto.
      : path.join(process.resourcesPath, 'app.asar.unpacked', 'vendor', 'python-portable', 'python.exe');

    if (!fs.existsSync(execPath)) {
        dialog.showErrorBox('Erro Crítico', `Executável do Python não encontrado em: ${execPath}`);
        return null;
    }
    return execPath;
}

// --- IPC HANDLERS DA JANELA PRINCIPAL (MTR) ---

ipcMain.on('start-automation', (event, config) => {
    const pythonExecutable = getPythonExecutablePath();
    if (!pythonExecutable) return;

    // CORREÇÃO CRÍTICA: O caminho para o script principal precisa diferenciar
    // o ambiente de desenvolvimento (isDev) do ambiente de produção (empacotado).
    const scriptPath = isDev
        ? path.join(__dirname, 'src', 'main.py')
        : path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'main.py');
    
    // Adiciona uma verificação para garantir que o script existe antes de tentar executá-lo
    if (!fs.existsSync(scriptPath)) {
        const errorMessage = `[Electron Error]: Script Python principal não encontrado em: ${scriptPath}`;
        dialog.showErrorBox('Erro Crítico de Arquivo', errorMessage);
        event.sender.send('log-message', { message: errorMessage, level: 'error' });
        event.sender.send('automation-finished');
        return;
    }

    const pythonProcess = spawn(pythonExecutable, [scriptPath]);
    
    pythonProcess.stdin.write(JSON.stringify(config));
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (data) => {
        data.toString().split('\n').forEach(line => {
            if (line) {
                try {
                    const jsonData = JSON.parse(line);
                    if (jsonData.type === 'log') event.sender.send('log-message', jsonData.payload);
                    if (jsonData.type === 'progress') event.sender.send('progress-update', jsonData.payload);
                } catch (e) { /* Ignora erros de parse de stream */ }
            }
        });
    });
    pythonProcess.stderr.on('data', (data) => event.sender.send('log-message', { message: `[Python MTR Error]: ${data.toString()}`, level: 'error' }));
    pythonProcess.on('close', (code) => {
        event.sender.send('log-message', { message: `Script MTR finalizado com código ${code}.`, level: 'info' });
        event.sender.send('automation-finished');
    });
});

ipcMain.on('open-assinador-window', createAssinadorWindow);

ipcMain.handle('dialog:selectExcel', () => dialog.showOpenDialogSync(mainWindow, { properties: ['openFile'], filters: [{ name: 'Planilhas Excel', extensions: ['xlsx', 'xls'] }] })?.[0] || null);
ipcMain.handle('dialog:selectFolder', () => dialog.showOpenDialogSync(mainWindow, { properties: ['openDirectory'] })?.[0] || null);
ipcMain.handle('dialog:showAbout', () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Sobre a Automação MTR', message: 'Automação MTR INEA v2.2.0', detail: 'Desenvolvido por: Clebson de Oliveira Correia\nEmail: oliveiraclebson007@gmail.com' }));


// --- IPC HANDLERS DA JANELA DO ASSINADOR ---

// CORREÇÃO: O caminho base do assinador também precisa ser dinâmico.
const assinadorBasePath = isDev 
    ? path.join(__dirname, 'assinador')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'assinador');


function runAssinadorScript(args) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = getPythonExecutablePath();
        if (!pythonExecutable) return reject('Executável do Python não encontrado');

        // CORREÇÃO CRÍTICA: O caminho para o script do assinador também foi corrigido.
        const scriptPath = path.join(assinadorBasePath, 'src', 'python_script.py');

        if (!fs.existsSync(scriptPath)) {
            return reject(`Script Python do assinador não encontrado em: ${scriptPath}`);
        }

        const pythonProcess = spawn(pythonExecutable, [scriptPath, ...args]);
        
        let stdout = '';
        let stderr = '';
        pythonProcess.stdout.on('data', (data) => stdout += data.toString('utf8'));
        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString('utf8');
            if (assinadorWindow) assinadorWindow.webContents.send('process-status', data.toString('utf8').trim());
        });
        
        pythonProcess.on('close', (code) => {
            if (code === 0) resolve(stdout.trim().split('\n').pop() || 'Processo concluído.');
            else reject(stderr || `Processo Python falhou com o código ${code}`);
        });
         pythonProcess.on('error', (err) => reject(err));
    });
}

const setupAssinadorFolders = () => {
    // Esta função agora usa o 'assinadorBasePath' corrigido.
    const paths = {
        inputFolder: path.join(assinadorBasePath, 'pdfs_entrada'),
        outputFolder: path.join(assinadorBasePath, 'pdfs_saida'),
        subscriptionsFolder: path.join(assinadorBasePath, 'assinaturas'),
    };
    fs.mkdirSync(paths.inputFolder, { recursive: true });
    fs.mkdirSync(paths.outputFolder, { recursive: true });
    fs.mkdirSync(path.join(paths.subscriptionsFolder, '0 - RESPONSÁVEIS'), { recursive: true });
    fs.mkdirSync(path.join(paths.subscriptionsFolder, 'MOTORISTAS'), { recursive: true });
    return paths;
};

ipcMain.handle('get-initial-data', async () => {
    const paths = setupAssinadorFolders();
    const dataFolder = path.join(assinadorBasePath, 'data');
    fs.mkdirSync(dataFolder, { recursive: true });
    const driverPosFile = path.join(dataFolder, 'posicoes.txt');
    const respPosFile = path.join(dataFolder, 'responsaveis_posicoes.json');
    if (!fs.existsSync(driverPosFile)) fs.writeFileSync(driverPosFile, '');
    if (!fs.existsSync(respPosFile)) fs.writeFileSync(respPosFile, '{}');
    
    const result = await runAssinadorScript(['get_signature_config', paths.subscriptionsFolder, driverPosFile, respPosFile]);
    return JSON.parse(result);
});

ipcMain.handle('get-signature-preview', async (e, args) => {
    const paths = setupAssinadorFolders();
    const dataFolder = path.join(assinadorBasePath, 'data');
    const driverPosFile = path.join(dataFolder, 'posicoes.txt');
    const respPosFile = path.join(dataFolder, 'responsaveis_posicoes.json');
    const result = await runAssinadorScript(['get_preview', args.signatureName, args.signatureType, paths.inputFolder, paths.subscriptionsFolder, driverPosFile, respPosFile]);
    return JSON.parse(result);
});

ipcMain.handle('save-signature-position', async (e, args) => {
    const dataFolder = path.join(assinadorBasePath, 'data');
    const positionFile = args.signatureType === 'driver' ? path.join(dataFolder, 'posicoes.txt') : path.join(dataFolder, 'responsaveis_posicoes.json');
    return await runAssinadorScript(['save_position', args.signatureName, args.signatureType, String(args.position.x), String(args.position.y), String(args.position.w), String(args.position.h), positionFile]);
});

ipcMain.handle('process-pdfs', async (e, args) => {
    const paths = setupAssinadorFolders();
    const dataFolder = path.join(assinadorBasePath, 'data');
    const driverPosFile = path.join(dataFolder, 'posicoes.txt');
    const respPosFile = path.join(dataFolder, 'responsaveis_posicoes.json');
    return await runAssinadorScript(['process_pdfs', paths.inputFolder, paths.outputFolder, paths.subscriptionsFolder, driverPosFile, respPosFile, args.emissorFile, args.receptorFile]);
});

// --- CICLO DE VIDA DA APLICAÇÃO ---
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
