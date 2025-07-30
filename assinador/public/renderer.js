// public/renderer.js - Lógica do Frontend

document.addEventListener('DOMContentLoaded', () => {
    const ipc = window.electronAPI;

    // --- Seletores de Elementos ---
    const processPdfsBtn = document.getElementById('processPdfsBtn');
    const fixedSignatureSelect = document.getElementById('fixedSignatureSelect');
    const driverSelect = document.getElementById('driverSelect');
    const emissorSelect = document.getElementById('emissorSelect');
    const receptorSelect = document.getElementById('receptorSelect');
    const driverWarning = document.getElementById('driver-warning');
    const posInputs = {
        x: document.getElementById('posX'),
        y: document.getElementById('posY'),
        w: document.getElementById('width'),
        h: document.getElementById('height'),
    };
    const savePositionBtn = document.getElementById('savePositionBtn');
    const previewContainer = document.getElementById('preview-container');
    const pdfPreview = document.getElementById('pdfPreview');
    const signatureOverlay = document.getElementById('signatureOverlay');
    const signaturePreviewImage = document.getElementById('signaturePreviewImage');
    const previewLoader = document.getElementById('preview-loader');
    const statusLog = document.getElementById('status-log');
    const statusIndicator = document.getElementById('status-indicator');

    // --- Estado da Aplicação ---
    let state = {
        config: { drivers: [], responsaveis: [] },
        currentSignature: null,
        currentPreviewData: null, // Armazena os dados da pré-visualização atual
        selectedEmissor: null,
        selectedReceptor: null,
        preview: {
            imageElement: null, // Referência ao elemento <img> da pré-visualização
            scaleX: 1,
            scaleY: 1,
        },
        interaction: {
            isDragging: false,
            isResizing: false,
            activeHandle: null,
            initialMouse: { x: 0, y: 0 },
            initialOverlay: { x: 0, y: 0, w: 0, h: 0 },
        }
    };

    // --- Funções de UI ---
    const log = (message, type = 'info') => {
        const p = document.createElement('p');
        const iconClass = type === 'error' ? 'fa-times-circle text-red-500' : (type === 'success' ? 'fa-check-circle text-green-500' : 'fa-info-circle text-blue-500');
        p.innerHTML = `<i class="fas ${iconClass} mr-2"></i>${message.replace(/\n/g, '<br>')}`;
        if (statusLog.firstChild?.textContent.includes('Aguardando')) {
            statusLog.innerHTML = '';
        }
        statusLog.prepend(p);
        statusLog.scrollTop = 0;
    };

    const setStatusIndicator = (status) => {
        statusIndicator.className = 'w-4 h-4 rounded-full transition-colors duration-500 ';
        switch(status) {
            case 'busy': statusIndicator.classList.add('bg-amber-500', 'animate-pulse'); break;
            case 'success': statusIndicator.classList.add('bg-green-500'); break;
            case 'error': statusIndicator.classList.add('bg-red-500'); break;
            default: statusIndicator.classList.add('bg-gray-400');
        }
    };

    const toggleLoader = (show) => previewLoader.classList.toggle('hidden', !show);

    const checkProcessButton = () => {
        processPdfsBtn.disabled = !(state.selectedEmissor && state.selectedReceptor);
    };

    const updateConfigUI = () => {
        const createOption = (item, isDriver = false) => {
            const option = document.createElement('option');
            option.value = item.name;
            const displayName = isDriver ? item.name : item.displayName;
            option.textContent = displayName + (item.has_position_defined ? '' : ' (sem posição)');
            if (!item.has_position_defined) {
                option.classList.add('text-amber-600');
            }
            return option;
        };
        const populateSelect = (selectElement, data, isDriver = false) => {
            selectElement.innerHTML = `<option value="">Selecione um ${isDriver ? 'motorista' : 'responsável'}...</option>`;
            data.forEach(item => selectElement.appendChild(createOption(item, isDriver)));
        };
        populateSelect(fixedSignatureSelect, state.config.responsaveis, false);
        populateSelect(emissorSelect, state.config.responsaveis, false);
        populateSelect(receptorSelect, state.config.responsaveis, false);
        populateSelect(driverSelect, state.config.drivers, true);
    };
    
    // --- Lógica de Posicionamento e Escala (Refatorada) ---

    // Atualiza a posição e escala da imagem de preview e do overlay
    const updatePreviewLayout = () => {
        const { imageElement } = state.preview;
        const { page_width, page_height } = state.currentPreviewData;
        if (!imageElement || !page_width || !page_height) return;

        const container = pdfPreview;
        const containerRect = container.getBoundingClientRect();
        
        const imageRatio = page_width / page_height;
        const containerRatio = containerRect.width / containerRect.height;

        let renderedWidth, renderedHeight;

        if (imageRatio > containerRatio) {
            renderedWidth = containerRect.width;
            renderedHeight = renderedWidth / imageRatio;
        } else {
            renderedHeight = containerRect.height;
            renderedWidth = renderedHeight * imageRatio;
        }

        const offsetX = (containerRect.width - renderedWidth) / 2;
        const offsetY = (containerRect.height - renderedHeight) / 2;

        Object.assign(imageElement.style, {
            width: `${renderedWidth}px`,
            height: `${renderedHeight}px`,
            left: `${offsetX}px`,
            top: `${offsetY}px`,
        });

        state.preview.scaleX = page_width / renderedWidth;
        state.preview.scaleY = page_height / renderedHeight;

        updateOverlayFromInputs();
    };
    
    const updateOverlayFromInputs = () => {
        if (!state.preview.scaleX || !state.preview.scaleY || !state.preview.imageElement) return;

        const pos = {
            x: parseFloat(posInputs.x.value) || 0,
            y: parseFloat(posInputs.y.value) || 0,
            w: parseFloat(posInputs.w.value) || 150,
            h: parseFloat(posInputs.h.value) || 75,
        };

        const imageRect = state.preview.imageElement.getBoundingClientRect();
        const containerRect = previewContainer.getBoundingClientRect();

        const screenX = (pos.x / state.preview.scaleX) + (imageRect.left - containerRect.left);
        const screenY = (pos.y / state.preview.scaleY) + (imageRect.top - containerRect.top);
        const screenW = pos.w / state.preview.scaleX;
        const screenH = pos.h / state.preview.scaleY;

        Object.assign(signatureOverlay.style, {
            left: `${screenX}px`,
            top: `${screenY}px`,
            width: `${screenW}px`,
            height: `${screenH}px`
        });
    };

    const updateInputsFromOverlay = () => {
        if (!state.preview.scaleX || !state.preview.scaleY || !state.preview.imageElement) return;
        
        const imageRect = state.preview.imageElement.getBoundingClientRect();
        const overlayRect = signatureOverlay.getBoundingClientRect();
        const containerRect = previewContainer.getBoundingClientRect();

        const pdfX = (overlayRect.left - imageRect.left) * state.preview.scaleX;
        const pdfY = (overlayRect.top - imageRect.top) * state.preview.scaleY;
        const pdfW = overlayRect.width * state.preview.scaleX;
        const pdfH = overlayRect.height * state.preview.scaleY;

        posInputs.x.value = pdfX.toFixed(2);
        posInputs.y.value = pdfY.toFixed(2);
        posInputs.w.value = pdfW.toFixed(2);
        posInputs.h.value = pdfH.toFixed(2);
    };

    // --- Funções Principais ---

    const loadInitialData = async () => {
        try {
            setStatusIndicator('busy');
            log('Carregando configuração inicial...');
            state.config = await ipc.getInitialData();
            updateConfigUI();
            setStatusIndicator('idle');
            log('Configuração carregada.');
        } catch (error) {
            log(`Erro fatal ao carregar dados: ${error.message}`, 'error');
            setStatusIndicator('error');
        }
    };

    const selectSignatureForAdjustment = async (name, type) => {
        if (!name) {
            state.currentSignature = null;
            state.currentPreviewData = null;
            state.preview.imageElement = null;
            signatureOverlay.style.display = 'none';
            pdfPreview.innerHTML = '<p class="text-slate-500">Selecione uma assinatura para ajustar a posição</p>';
            savePositionBtn.disabled = true;
            return;
        }
        
        state.currentSignature = { name, type };
        savePositionBtn.disabled = false;
        
        if (type === 'driver') {
            fixedSignatureSelect.value = '';
            const driver = state.config.drivers.find(d => d.name === name);
            driverWarning.textContent = driver && !driver.has_position_defined ? 'Aviso: Posição não definida.' : '';
        } else {
            driverSelect.value = '';
            driverWarning.textContent = '';
        }
        
        try {
            toggleLoader(true);
            pdfPreview.innerHTML = '';
            
            const data = await ipc.getSignaturePreview({
                signatureName: name,
                signatureType: type,
            });
            state.currentPreviewData = data;

            if (data.page_base64) {
                const img = document.createElement('img');
                img.src = `data:image/png;base64,${data.page_base64}`;
                img.className = "absolute object-contain"; // Posicionado de forma absoluta
                state.preview.imageElement = img;
                
                img.onload = () => {
                    if (data.position) {
                        posInputs.x.value = data.position.x.toFixed(2);
                        posInputs.y.value = data.position.y.toFixed(2);
                        posInputs.w.value = data.position.w.toFixed(2);
                        posInputs.h.value = data.position.h.toFixed(2);
                    } else {
                        posInputs.x.value = (50).toFixed(2);
                        posInputs.y.value = (50).toFixed(2);
                        posInputs.w.value = (150).toFixed(2);
                        posInputs.h.value = (75).toFixed(2);
                    }
                    updatePreviewLayout(); // Primeira atualização
                    signatureOverlay.style.display = 'block';
                    toggleLoader(false);
                };
                pdfPreview.appendChild(img);
            } else {
                pdfPreview.innerHTML = '<p class="text-slate-500">Para ajustar, coloque um PDF na pasta de entrada.</p>';
                toggleLoader(false);
            }
            
            signaturePreviewImage.src = data.signature_base64 ? `data:image/png;base64,${data.signature_base64}` : '';

        } catch (error) {
            log(`Erro na prévia: ${error.message}`, 'error');
            pdfPreview.innerHTML = `<p class="text-red-500">Erro ao carregar prévia.</p>`;
            toggleLoader(false);
        }
    };

    const savePosition = async () => {
        if (!state.currentSignature) return;
        try {
            setStatusIndicator('busy');
            updateInputsFromOverlay(); // Garante que os valores dos inputs estão atualizados
            const result = await ipc.saveSignaturePosition({
                signatureName: state.currentSignature.name,
                signatureType: state.currentSignature.type,
                position: {
                    x: posInputs.x.value, y: posInputs.y.value,
                    w: posInputs.w.value, h: posInputs.h.value,
                },
            });
            log(result, 'success');
            setStatusIndicator('success');
            await loadInitialData(); 
        } catch (error) {
            log(`Erro ao salvar: ${error.message}`, 'error');
            setStatusIndicator('error');
        }
    };

    // --- Event Listeners ---
    fixedSignatureSelect.addEventListener('change', (e) => selectSignatureForAdjustment(e.target.value, 'responsavel'));
    driverSelect.addEventListener('change', (e) => selectSignatureForAdjustment(e.target.value, 'driver'));
    
    emissorSelect.addEventListener('change', (e) => { state.selectedEmissor = e.target.value; checkProcessButton(); });
    receptorSelect.addEventListener('change', (e) => { state.selectedReceptor = e.target.value; checkProcessButton(); });
    
    Object.values(posInputs).forEach(input => input.addEventListener('change', updateOverlayFromInputs));

    processPdfsBtn.addEventListener('click', async () => {
        if (!state.selectedEmissor || !state.selectedReceptor) {
            log('Por favor, selecione um emissor e um receptor.', 'error');
            return;
        }
        try {
            setStatusIndicator('busy');
            log('Iniciando processamento...');
            processPdfsBtn.disabled = true;
            const result = await ipc.processPdfs({ emissorFile: state.selectedEmissor, receptorFile: state.selectedReceptor });
            log(result, 'success');
            setStatusIndicator('success');
        } catch (error) {
            log(`Erro no processamento: ${error.message}`, 'error');
            setStatusIndicator('error');
        } finally {
            checkProcessButton();
        }
    });
    savePositionBtn.addEventListener('click', savePosition);

    // Listeners para arrastar e redimensionar
    signatureOverlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        state.interaction.initialMouse = { x: e.clientX, y: e.clientY };
        const rect = signatureOverlay;
        state.interaction.initialOverlay = { x: rect.offsetLeft, y: rect.offsetTop, w: rect.offsetWidth, h: rect.offsetHeight };
        if (e.target.classList.contains('resize-handle')) {
            state.interaction.isResizing = true;
            state.interaction.activeHandle = e.target.dataset.handle;
        } else {
            state.interaction.isDragging = true;
            signatureOverlay.classList.add('dragging');
        }
    });

    document.addEventListener('mousemove', (e) => {
        const { isDragging, isResizing, initialMouse, initialOverlay, activeHandle } = state.interaction;
        if (!isDragging && !isResizing) return;
        e.preventDefault();
        
        const dx = e.clientX - initialMouse.x;
        const dy = e.clientY - initialMouse.y;
        let { x, y, w, h } = initialOverlay;

        if (isDragging) {
            x += dx; y += dy;
        } else if (isResizing) {
            if (activeHandle.includes('w')) { x += dx; w -= dx; }
            if (activeHandle.includes('e')) { w += dx; }
            if (activeHandle.includes('n')) { y += dy; h -= dy; }
            if (activeHandle.includes('s')) { h += dy; }
        }
        
        const imageRect = state.preview.imageElement.getBoundingClientRect();
        const containerRect = previewContainer.getBoundingClientRect();
        const minX = imageRect.left - containerRect.left;
        const minY = imageRect.top - containerRect.top;
        const maxX = minX + imageRect.width;
        const maxY = minY + imageRect.height;

        w = Math.max(10, w);
        h = Math.max(10, h);
        x = Math.max(minX, Math.min(x, maxX - w));
        y = Math.max(minY, Math.min(y, maxY - h));

        Object.assign(signatureOverlay.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
        updateInputsFromOverlay();
    });

    document.addEventListener('mouseup', () => {
        state.interaction.isDragging = false;
        state.interaction.isResizing = false;
        signatureOverlay.classList.remove('dragging');
    });
    
    // Observador para redimensionamento da janela/container
    const resizeObserver = new ResizeObserver(() => {
        if (state.preview.imageElement) {
            updatePreviewLayout();
        }
    });
    resizeObserver.observe(previewContainer);

    // Listeners de IPC
    ipc.onProcessStatus((message) => log(message));
    ipc.onProcessError((message) => log(message, 'error'));

    // Inicia a aplicação
    loadInitialData();
});
