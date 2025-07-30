// public/renderer.js - Lógica da interface do usuário (Corrigido para corresponder ao HTML original)

document.addEventListener('DOMContentLoaded', () => {
    const api = window.electronAPI;

    // --- Mapeamento dos Elementos do DOM (usando os IDs do seu HTML original) ---
    const elements = {
        cnpj: document.getElementById('cnpj'),
        obra: document.getElementById('obra'),
        cpf: document.getElementById('cpf'),
        senha: document.getElementById('senha'),
        excelPath: document.getElementById('excel-path'),
        rootFolder: document.getElementById('root-folder'),
        selectExcelBtn: document.getElementById('select-excel-btn'),
        selectFolderBtn: document.getElementById('select-folder-btn'),
        startBtn: document.getElementById('start-btn'),
        aboutBtn: document.getElementById('about-btn'),
        openAssinadorBtn: document.getElementById('open-assinador-btn'), // Novo botão
        progressMessage: document.getElementById('progress-message'),
        progressBar: document.getElementById('progress-bar'),
        progressLabel: document.getElementById('progress-label'),
        logArea: document.getElementById('log-area'),
        logWrapper: document.getElementById('log-wrapper'),
        robotAnimation: document.getElementById('robot-animation'),
    };

    // --- Funções de Atualização da UI ---

    function addLog(message, level = 'info') {
        if (elements.logArea.innerHTML.includes('Logs da execução aparecerão aqui...')) {
            elements.logArea.innerHTML = '';
        }
        const levelClass = `log-${level}`;
        elements.logArea.innerHTML = `<span class="${levelClass}">${message}</span>\n` + elements.logArea.innerHTML;
    }

    function updateProgress(current, total, message) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        elements.progressBar.style.width = `${percentage}%`;
        elements.progressMessage.textContent = message;
        elements.progressLabel.textContent = `${current}/${total} (${percentage.toFixed(0)}%)`;
    }

    function setControlsEnabled(enabled) {
        elements.startBtn.disabled = !enabled;
        elements.aboutBtn.disabled = !enabled;
        elements.openAssinadorBtn.disabled = !enabled;
        elements.selectExcelBtn.disabled = !enabled;
        elements.selectFolderBtn.disabled = !enabled;
        
        elements.robotAnimation.classList.toggle('hidden', enabled);
        elements.logWrapper.style.height = enabled ? '300px' : '200px';
    }

    // --- Handlers de Eventos do Usuário ---

    elements.selectExcelBtn.addEventListener('click', async () => {
        const path = await api.selectExcelFile();
        if (path) elements.excelPath.value = path;
    });

    elements.selectFolderBtn.addEventListener('click', async () => {
        const path = await api.selectRootFolder();
        if (path) elements.rootFolder.value = path;
    });

    elements.aboutBtn.addEventListener('click', () => api.showAboutDialog());

    // NOVO: Event listener para o botão de abrir o assinador
    elements.openAssinadorBtn.addEventListener('click', () => {
        addLog('Abrindo a ferramenta de assinatura...', 'info');
        api.openAssinadorWindow();
    });

    elements.startBtn.addEventListener('click', () => {
        const config = {
            CNPJ_EMPRESA: elements.cnpj.value,
            CODIGO_OBRA: elements.obra.value,
            CPF_USUARIO: elements.cpf.value,
            SENHA_USUARIO: elements.senha.value,
            caminho_arquivo_excel: elements.excelPath.value,
            pasta_raiz_motoristas: elements.rootFolder.value,
        };

        for (const key in config) {
            if (!config[key]) {
                addLog(`ERRO: O campo "${key}" é obrigatório para o download.`, 'error');
                return;
            }
        }
        setControlsEnabled(false);
        addLog('Iniciando download de MTRs...', 'info_final');
        updateProgress(0, 0, 'Iniciando...');
        api.startAutomation(config);
    });

    // --- Handlers para Eventos Vindos do Main/Python ---

    api.onLogMessage((...args) => {
        const [event, { message, level }] = args;
        addLog(message, level);
    });

    api.onProgressUpdate((...args) => {
        const [event, { current, total, message }] = args;
        updateProgress(current, total, message);
    });

    api.onAutomationFinished(() => {
        setControlsEnabled(true);
        updateProgress(0, 0, 'Processo finalizado. Pronto para a próxima ação.');
    });
});
