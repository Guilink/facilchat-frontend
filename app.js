// FacilChat - Frontend JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // === CONFIGURAÇÕES ===
    const firebaseConfig = {
        apiKey: "AIzaSyD6KF1OxewXN1gI81Lsm9i82bkps1UxwJ8",
        authDomain: "facilchat-auth.firebaseapp.com",
        projectId: "facilchat-auth",
        storageBucket: "facilchat-auth.appspot.com",
        messagingSenderId: "473078468134",
        appId: "1:473078468134:web:b74df1f1461093bab920e7"
    };
    
    const API_BASE_URL = 'https://facilchat-backend-production.up.railway.app';
    
    // === INICIALIZAÇÃO ===
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();
    
    // === VARIÁVEIS GLOBAIS ===
    let socket;
    let userBots = [];
    let wizardBotData = {};
    let currentWizardStep = 1;
    let isEditMode = false;
    let editingBotId = null;
    
    // === ELEMENTOS ===
    const views = {
        login: document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        wizard: document.getElementById('wizard-view'),
        success: document.getElementById('success-view'),
        edit: document.getElementById('edit-view')
    };
    
    const appLoading = document.getElementById('app-loading');
    
    const elements = {
        header: document.getElementById('main-header'),
        loginBtn: document.getElementById('login-google'),
        logoutBtn: document.getElementById('logout'),
        startWizardBtn: document.getElementById('start-wizard-btn'),
        createBotBtn: document.getElementById('create-bot-btn'),
        closeWizard: document.getElementById('close-wizard'),
        backToDashboard: document.getElementById('back-to-dashboard'),
        wizardBack: document.getElementById('wizard-back'),
        wizardContinue: document.getElementById('wizard-continue'),
        wizardSkip: document.getElementById('wizard-skip'),
        welcomeState: document.getElementById('welcome-state'),
        botsState: document.getElementById('bots-state'),
        botsList: document.getElementById('bots-list'),
        qrDisplay: document.getElementById('qr-display')
    };

    // === GERENCIAMENTO DE VIEWS ===
    let lastViewChange = null;
    
    function showView(viewName) {
        const timestamp = new Date().toISOString();
        const stack = new Error().stack.split('\n')[2].trim(); // Captura quem chamou
        
        console.log(`🔄 [${timestamp}] MUDANÇA DE VIEW: ${lastViewChange || 'nenhuma'} → ${viewName}`);
        console.log(`📍 Chamado por:`, stack);
        
        // VALIDAÇÃO: Não permite mostrar login se usuário está autenticado
        if (viewName === 'login' && auth.currentUser) {
            console.log('🚫 BLOQUEADO: Tentativa de mostrar login com usuário autenticado!');
            console.log('👤 Usuário atual:', auth.currentUser.email);
            return; // BLOQUEIA a mudança
        }
        
        // Remove loading state
        if (appLoading) {
            appLoading.classList.add('hidden');
        }
        
        // Atualiza views
        Object.values(views).forEach(view => view.classList.remove('active'));
        
        if (views[viewName]) {
            views[viewName].classList.add('active');
            lastViewChange = viewName;
            
            // Controla header
            if (viewName === 'login') {
                elements.header.style.display = 'none';
                console.log('🔒 Header escondido (view: login)');
            } else {
                elements.header.style.display = 'block';
                console.log('🔓 Header exibido (view: ' + viewName + ')');
            }
        } else {
            console.error('❌ View não encontrada:', viewName);
        }
        
        console.log('✅ View ativa:', viewName);
    }

    // === AUTENTICAÇÃO ===
    function handleAuthStateChange(user) {
        if (user) {
            console.log('✅ Usuário autenticado:', user.email);
            
            // Verifica qual view está ativa atualmente
            const currentView = Object.keys(views).find(key => views[key].classList.contains('active'));
            console.log('📱 View atual:', currentView || 'nenhuma');
            
            // Views onde o usuário pode estar trabalhando
            const operationalViews = ['wizard', 'edit', 'success'];
            
            // Só redireciona para dashboard se não estiver em uma view operacional
            if (!currentView || currentView === 'login' || !operationalViews.includes(currentView)) {
                console.log('🏠 Redirecionando para dashboard');
                showView('dashboard');
            } else {
                console.log('🔄 Mantendo view atual:', currentView);
                // Remove loading mesmo sem trocar de view
                if (appLoading) {
                    appLoading.classList.add('hidden');
                }
            }
            
            syncUserWithBackend();
            fetchBots();
            initializeSocket();
        } else {
            console.log('❌ Usuário não autenticado - mostrando login');
            showView('login');
            if (socket) socket.disconnect();
        }
    }

    function hasActiveView() {
        return Object.values(views).some(view => view.classList.contains('active'));
    }

    // === FUNÇÃO DE DEBUG ===
    function debugViewState() {
        console.log('🔍 DEBUG - Estado das Views:');
        Object.keys(views).forEach(viewName => {
            const view = views[viewName];
            const isActive = view.classList.contains('active');
            const isVisible = window.getComputedStyle(view).display !== 'none';
            console.log(`  ${viewName}: ${isActive ? '✅ ATIVA' : '❌ inativa'} | ${isVisible ? '👁️ visível' : '🙈 escondida'}`);
        });
        console.log('📱 Header visível:', elements.header.style.display !== 'none');
        console.log('👤 Usuário logado:', auth.currentUser ? auth.currentUser.email : 'NÃO');
        console.log('⏳ Loading visível:', appLoading && !appLoading.classList.contains('hidden'));
    }

    // Adiciona função debug globalmente para teste manual
    window.debugViewState = debugViewState;

    async function getAuthToken() {
        const user = auth.currentUser;
        if (!user) {
            auth.signOut();
            throw new Error("Usuário não autenticado.");
        }
        return await user.getIdToken();
    }

    async function syncUserWithBackend() {
        try {
            const token = await getAuthToken();
            await fetch(`${API_BASE_URL}/api/users/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error("Erro em syncUserWithBackend:", error);
        }
    }

    // === BOTS ===
    async function fetchBots() {
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) throw new Error('Falha ao buscar os bots.');
            
            userBots = await response.json();
            renderDashboard();
        } catch (error) {
            console.error("Erro em fetchBots:", error);
        }
    }

    function renderDashboard() {
        if (userBots.length === 0) {
            elements.welcomeState.style.display = ''; // Remove o estilo inline para que o CSS assuma.
            elements.botsState.style.display = 'none';
        } else {
            elements.welcomeState.style.display = 'none';
            elements.botsState.style.display = ''; // Remove o estilo inline para que o CSS assuma.
            renderBots();
        }
    }

    function renderBots() {
        elements.botsList.innerHTML = '';
        
        userBots.forEach(bot => {
            const botCard = createBotCard(bot);
            elements.botsList.appendChild(botCard);
        });
    }

    function createBotCard(bot) {
        const card = document.createElement('div');
        card.className = 'bot-card';
        card.setAttribute('data-bot-id', bot.id);

        // --- NOVA LÓGICA DE STATUS ---
        const isConnected = bot.status === 'online' || bot.status === 'paused';
        const isActive = bot.status === 'online';
        const phoneDisplay = bot.connected_phone || '(XX) X XXXX-XXXX';

        // --- LÓGICA DO TOGGLE ATIVO/INATIVO ---
        const toggleDisabled = !isConnected; // Desabilita se não estiver 'online' ou 'paused'
        const statusText = isActive ? 'Ativo' : 'Inativo';
        const statusClass = isActive ? 'active' : 'inactive';
        const toggleChecked = isActive ? 'checked' : '';
        const onchangeAction = toggleDisabled ? '' : `onchange="handleStatusToggle('${bot.id}', this.checked)"`;
        
        // --- LÓGICA DO BOTÃO DE CONEXÃO (Já implementada) ---
        let connectionButtonHTML = '';
        switch (bot.status) {
            case 'online':
                connectionButtonHTML = `
                    <button class="btn-connect disconnect-action" 
                            data-connect-btn-for="${bot.id}" 
                            onclick="handleConnectionToggle('${bot.id}', 'online')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Desconectar
                    </button>`;
                break;
            case 'paused':
                connectionButtonHTML = `
                    <button class="btn-connect disconnect-action" 
                            data-connect-btn-for="${bot.id}"
                            onclick="handleConnectionToggle('${bot.id}', 'paused')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Desconectar
                    </button>`;
                break;
            case 'connecting':
                connectionButtonHTML = `
                    <button class="btn-connect" data-connect-btn-for="${bot.id}" disabled>
                        <span class="spinner"></span>
                        Conectando...
                    </button>`;
                break;
            case 'offline':
            default:
                connectionButtonHTML = `
                    <button class="btn-connect connect-action"
                            data-connect-btn-for="${bot.id}"
                            onclick="handleConnectionToggle('${bot.id}', 'offline')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        Conectar
                    </button>`;
                break;
        }

        card.innerHTML = `
            <div class="bot-header">
                <div class="bot-info">
                    <div class="bot-name">${bot.name}</div>
                    <div class="bot-phone">${phoneDisplay}</div>
                    <div class="bot-status">
                        <label class="status-toggle ${toggleDisabled ? 'disabled' : ''}" 
                            title="${toggleDisabled ? 'Conecte o bot para ativar' : 'Alternar status Ativo/Inativo'}">
                            <input type="checkbox" ${toggleChecked} ${onchangeAction} ${toggleDisabled ? 'disabled' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <span class="status-text ${statusClass}">
                            ${toggleDisabled ? 'Desconectado' : statusText}
                        </span>
                    </div>
                </div>
                <div class="bot-main-action">
                    ${connectionButtonHTML}
                </div>
            </div>
            
            <div class="bot-stats">
                <div class="stat-item">
                    <div class="stat-number">0</div>
                    <div class="stat-label">Conversas</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">0</div>
                    <div class="stat-label">Volume</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">0</div>
                    <div class="stat-label">Leads</div>
                </div>
            </div>
            
            <div class="bot-actions">
                <a href="#" class="bot-config" onclick="openBotSettings('${bot.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Configurações
                </a>
                <button class="bot-delete" onclick="handleDeleteBot('${bot.id}')" title="Deletar bot">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        `;

        return card;
    }

    // EM: app.js
    // ADICIONE ESTA NOVA FUNÇÃO
    // EM: app.js (Frontend)

    window.handleConnectionToggle = async function(botId, currentStatus) {
        const button = document.querySelector(`[data-connect-btn-for="${botId}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner"></span> Processando...';
        }

        try {
            const token = await getAuthToken();
            let response;
            
            // Ação de DESCONECTAR/CANCELAR é a mesma
            if (currentStatus === 'online' || currentStatus === 'paused' || currentStatus === 'connecting') {
                console.log(`[Bot ${botId}] Solicitando desconexão/cancelamento...`);
                response = await fetch(`${API_BASE_URL}/api/bots/${botId}/disconnect`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
            } else if (currentStatus === 'offline') {
                // AÇÃO: CONECTAR
                console.log(`[Bot ${botId}] Iniciando conexão...`);
                editingBotId = botId; // Guarda o ID do bot que está tentando conectar
                response = await fetch(`${API_BASE_URL}/api/bots/${botId}/connect`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    showView('wizard');
                    setWizardStep(4);
                }
            }

            if (response && !response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Falha na operação.');
            }

        } catch (error) {
            console.error(`Erro na operação de conexão:`, error);
            alert(`Erro: ${error.message}`);
            // Força a recarga dos bots para sincronizar o estado em caso de erro
            await fetchBots();
        }
    }

    // === AÇÕES DOS BOTS ===
    window.handleStatusToggle = async function(botId, isActive) {
        try {
            const status = isActive ? 'online' : 'paused';
            const token = await getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });

            if (!response.ok) throw new Error('Falha ao alterar status');

            const bot = userBots.find(b => b.id == botId);
            if (bot) {
                bot.status = status;
                const card = document.querySelector(`[data-bot-id="${botId}"]`);
                const statusText = card.querySelector('.status-text');
                statusText.textContent = isActive ? 'Ativo' : 'Inativo';
                statusText.className = `status-text ${isActive ? 'active' : 'inactive'}`;
            }

        } catch (error) {
            console.error('Erro ao alterar status:', error);
            const card = document.querySelector(`[data-bot-id="${botId}"]`);
            const toggle = card.querySelector('input[type="checkbox"]');
            toggle.checked = !isActive;
        }
    };

    window.openBotSettings = function(botId) {
        const bot = userBots.find(b => b.id == botId);
        if (!bot) return;

        editingBotId = botId;
        populateEditFormWithBotData(bot);
        showView('edit');
    };

    let botToDelete = null;

    function openDeleteModal(botId, botName) {
        botToDelete = botId;
        const modal = document.getElementById('delete-modal');
        const botNameEl = document.getElementById('delete-bot-name');
        const confirmBtn = document.getElementById('confirm-delete-btn');
        
        botNameEl.textContent = botName;
        modal.classList.add('active');
        
        // Remove event listeners antigos e adiciona novo
        confirmBtn.onclick = null;
        confirmBtn.onclick = confirmDeleteBot;
        
        // Evita scroll no body
        document.body.style.overflow = 'hidden';
    }

    function closeDeleteModal() {
        const modal = document.getElementById('delete-modal');
        modal.classList.remove('active');
        botToDelete = null;
        
        // Restaura scroll do body
        document.body.style.overflow = 'auto';
    }

    async function confirmDeleteBot() {
        if (!botToDelete) return;
        
        const confirmBtn = document.getElementById('confirm-delete-btn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner"></span> Deletando...';
        
        try {
            const token = await getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Falha ao deletar o bot');
            
            closeDeleteModal();
            await fetchBots();
            console.log('✅ Bot deletado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao deletar bot:', error);
            alert('Erro ao deletar o bot: ' + error.message);
            
            // Restaura botão
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Deletar Permanentemente';
        }
    }

    window.handleDeleteBot = async function(botId) {
        // Encontra o bot para pegar o nome
        const bot = userBots.find(b => b.id === botId);
        const botName = bot ? bot.name : 'Bot';
        
        // Abre modal estilizado em vez de confirm()
        openDeleteModal(botId, botName);
    };

    // Adiciona funções globais para o modal
    window.closeDeleteModal = closeDeleteModal;

    // === WIZARD ===
    function initializeWizard() {
        setupWizardEventListeners();
        setupOptionCards();
        setupScheduleControls();
        setupKnowledgeBase();
        setupWizardValidation(); // NOVA FUNÇÃO para validação em tempo real
    }

    function setupWizardEventListeners() {
        elements.wizardContinue.addEventListener('click', handleWizardContinue);
        elements.wizardBack.addEventListener('click', handleWizardBack);
        elements.wizardSkip.addEventListener('click', handleWizardSkip);

        document.querySelectorAll('.step').forEach(step => {
            step.addEventListener('click', () => {
                const stepNumber = parseInt(step.dataset.step);
                if (stepNumber <= currentWizardStep || isEditMode) {
                    setWizardStep(stepNumber);
                }
            });
        });
    }

    function setupScheduleControls() {
        // Setup dos presets de horário
        document.querySelectorAll('.schedule-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                // Remove ativo de outros presets
                document.querySelectorAll('.schedule-preset').forEach(p => 
                    p.classList.remove('active'));
                
                // Ativa o preset clicado
                preset.classList.add('active');
                
                applySchedulePreset(preset.dataset.preset);
            });
        });

        // Setup dos toggles de dia
        document.querySelectorAll('.schedule-day').forEach(dayElement => {
            const toggle = dayElement.querySelector('input[type="checkbox"]');
            
            toggle.addEventListener('change', () => {
                updateDayScheduleState(dayElement);
            });
            
            // Inicializa o estado
            updateDayScheduleState(dayElement);
        });
    }

    function setupKnowledgeBase() {
        // FAQ
        const addFaqBtn = document.getElementById('add-faq');
        if (addFaqBtn) {
            addFaqBtn.addEventListener('click', () => {
                addFaqItem();
            });
        }

        // Contacts
        const addContactBtn = document.getElementById('add-contact');
        if (addContactBtn) {
            addContactBtn.addEventListener('click', () => {
                addContactItem();
            });
        }

        // File upload
        const uploadBtn = document.querySelector('.btn-upload');
        const fileInput = document.getElementById('file-upload');
        
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', handleFileUpload);
        }
    }

    // NOVA FUNÇÃO: Configura validação em tempo real do wizard
    function setupWizardValidation() {
        // Event listener para o campo nome do bot (passo 1)
        const botNameInput = document.getElementById('bot-name');
        if (botNameInput) {
            // Valida quando o usuário digita
            botNameInput.addEventListener('input', () => {
                validateWizardStep(currentWizardStep);
            });
            
            // Valida quando o usuário sai do campo
            botNameInput.addEventListener('blur', () => {
                validateWizardStep(currentWizardStep);
            });
        }
    }

    // EM: app.js

    function setupOptionCards() {
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                const container = card.closest('.form-group');
                const cards = container.querySelectorAll('.option-card');
                
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                
                const customTextarea = container.querySelector('textarea');
                if (customTextarea) {
                    if (card.dataset.value === 'Personalizado') {
                        customTextarea.style.display = 'block';
                        customTextarea.focus();
                    } else {
                        customTextarea.style.display = 'none';
                        customTextarea.value = '';
                    }
                }

                // --- ADICIONE ESTA LINHA AQUI ---
                // Após um card ser clicado, precisamos rodar a validação novamente.
                validateWizardStep(currentWizardStep);
            });
        });
    }

    function setWizardStep(step) {
        currentWizardStep = step;
        
        document.querySelectorAll('.step').forEach((stepEl, index) => {
            stepEl.classList.remove('active', 'completed');
            if (index + 1 === step) {
                stepEl.classList.add('active');
            } else if (index + 1 < step) {
                stepEl.classList.add('completed');
            }
        });
        
        document.querySelectorAll('.wizard-step').forEach((stepContent, index) => {
            stepContent.classList.remove('active');
            if (index + 1 === step) {
                stepContent.classList.add('active');
            }
        });
        
        elements.wizardBack.style.display = step > 1 ? 'block' : 'none';
        
        if (step === 4) {
            elements.wizardContinue.textContent = isEditMode ? 'Salvar Alterações' : 'Finalizar e Criar Bot';
            
            // AUTO QR CODE: Cria bot automaticamente ao chegar na etapa 4
            if (!isEditMode) {
                console.log('🤖 Etapa 4 alcançada - Criando bot automaticamente');
                createBot();
            }
        } else {
            elements.wizardContinue.textContent = 'Continuar';
        }
        
        // Remove botão pular - etapas são obrigatórias
        if (elements.wizardSkip) {
            elements.wizardSkip.style.display = 'none';
        }
        
        // CORRIGE BUG WIZARD: Valida o passo atual após mudança
        validateWizardStep(step);
    }

    // NOVA FUNÇÃO: Valida se o passo atual está completo para habilitar botão

    function validateWizardStep(step) {
        let isValid = false;
        let errorMessage = '';

        switch (step) {
            case 1:
                // Passo 1: Nome, função e tom são obrigatórios
                const botName = document.getElementById('bot-name');
                const hasName = botName && botName.value.trim().length > 0;

                const hasFunction = document.querySelector('#function-option-grid .option-card.selected');
                const hasTone = document.querySelector('#tone-option-grid .option-card.selected');

                isValid = hasName && hasFunction && hasTone;

                if (!hasName) errorMessage = 'Nome do bot é obrigatório';
                else if (!hasFunction) errorMessage = 'Selecione uma função principal';
                else if (!hasTone) errorMessage = 'Selecione um tom de atendimento';

                break;
            case 2:
            case 3:
            case 4:
                // Outros passos não têm validação obrigatória
                isValid = true;
                break;
        }

        elements.wizardContinue.disabled = !isValid;

        // Visual feedback para o botão
        if (isValid) {
            elements.wizardContinue.classList.remove('disabled');
        } else {
            elements.wizardContinue.classList.add('disabled');
        }

        // Mostra mensagem de erro se houver
        const errorEl = document.getElementById('wizard-error');
        if (errorEl) {
            errorEl.textContent = errorMessage;
            errorEl.style.display = errorMessage ? 'block' : 'none';
        }
    }

    function handleWizardContinue() {
        if (currentWizardStep < 4) {
            setWizardStep(currentWizardStep + 1);
        } else {
            if (isEditMode) {
                updateBot();
            } else {
                createBot();
            }
        }
    }

    function handleWizardBack() {
        if (currentWizardStep > 1) {
            setWizardStep(currentWizardStep - 1);
        }
    }

    function handleWizardSkip() {
        if (currentWizardStep < 4) {
            setWizardStep(currentWizardStep + 1);
        }
    }

    async function createBot() {
        try {
            elements.wizardContinue.disabled = true;
            elements.wizardContinue.innerHTML = '<span class="spinner"></span> Criando...';
            
            const token = await getAuthToken();
            
            // Coleta TODOS os dados do wizard conforme o backend espera
            const selectedFunction = getSelectedFunction();
            const selectedTone = getSelectedTone();
            
            // Coleta dados de horário
            const scheduleData = collectScheduleData();
            
            // Coleta dados de conhecimento
            const faqData = collectFaqData();
            const contactsData = collectContactsData();
            
            const botData = {
                name: document.getElementById('bot-name').value || 'Novo Bot',
                function_type: selectedFunction,
                tone_type: selectedTone.type,
                tone_custom_description: selectedTone.custom || '',
                schedule_enabled: scheduleData.enabled,
                schedule_data: JSON.stringify(scheduleData.data),
                knowledge_faq: JSON.stringify(faqData),
                knowledge_contacts: JSON.stringify(contactsData)
            };
            
            const response = await fetch(`${API_BASE_URL}/api/bots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(botData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao criar o bot.');
            }

            const newBot = await response.json();
            startWhatsAppConnection(newBot.id);
            
        } catch (error) {
            console.error('Erro ao criar bot:', error);
            alert(`Erro: ${error.message}`);
            elements.wizardContinue.disabled = false;
            elements.wizardContinue.textContent = 'Finalizar e Criar Bot';
        }
    }

    async function updateBot() {
        try {
            elements.wizardContinue.disabled = true;
            elements.wizardContinue.innerHTML = '<span class="spinner"></span> Salvando...';
            
            const token = await getAuthToken();
            
            // Coleta dados usando as mesmas funções do wizard
            const selectedFunction = getSelectedFunction();
            const selectedTone = getSelectedTone();
            const scheduleData = collectScheduleData();
            const faqData = collectFaqData();
            const contactsData = collectContactsData();
            
            const botData = {
                name: document.getElementById('bot-name').value || 'Bot Editado',
                function_type: selectedFunction,
                tone_type: selectedTone.type,
                tone_custom_description: selectedTone.custom || '',
                schedule_enabled: scheduleData.enabled,
                schedule_data: JSON.stringify(scheduleData.data),
                knowledge_faq: JSON.stringify(faqData),
                knowledge_contacts: JSON.stringify(contactsData)
            };
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${editingBotId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(botData)
            });

            if (!response.ok) throw new Error('Falha ao atualizar o bot.');
            
            resetWizard();
            await fetchBots();
            showView('dashboard');
            
        } catch (error) {
            console.error('Erro ao atualizar bot:', error);
            alert('Não foi possível salvar as alterações.');
        } finally {
            elements.wizardContinue.disabled = false;
            elements.wizardContinue.textContent = 'Salvar Alterações';
        }
    }

    function getSelectedFunction() {
        // Busca especificamente nos cards de função (primeiro .option-grid)
        const functionCards = document.querySelectorAll('[data-step="1"] .option-grid:first-child .option-card');
        const selected = Array.from(functionCards).find(card => card.classList.contains('selected'));
        
        if (selected) {
            const value = selected.dataset.value;
            if (value === 'Personalizado') {
                const customValue = document.getElementById('bot-function-custom').value.trim();
                return customValue || 'Função Personalizada';
            }
            return value;
        }
        return 'Suporte ao Cliente'; // Padrão
    }

    function getSelectedTone() {
        const toneCards = document.querySelectorAll('[data-step="1"] .option-grid:last-child .option-card');
        const selected = Array.from(toneCards).find(card => card.classList.contains('selected'));
        if (selected) {
            const value = selected.dataset.value;
            if (value === 'Personalizado') {
                return {
                    type: 'Personalizado',
                    custom: document.getElementById('bot-tone-custom').value || ''
                };
            }
            return {
                type: value,
                custom: ''
            };
        }
        return {
            type: 'Amigável',
            custom: ''
        };
    }

    // Função para coletar dados de horário no formato que o backend espera
    function collectScheduleData() {
        // Verifica se algum dia está habilitado
        const days = document.querySelectorAll('.schedule-day');
        const dayNames = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        
        let enabled = false;
        const data = [];
        
        days.forEach((dayElement, index) => {
            const toggle = dayElement.querySelector('input[type="checkbox"]');
            const openTime = dayElement.querySelector('input[type="time"]:first-of-type');
            const closeTime = dayElement.querySelector('input[type="time"]:last-of-type');
            
            const isActive = toggle ? toggle.checked : false;
            if (isActive) enabled = true;
            
            data.push({
                day: dayNames[index],
                active: isActive,
                open: openTime ? openTime.value : '09:00',
                close: closeTime ? closeTime.value : '18:00'
            });
        });
        
        return { enabled, data };
    }

    // Função para coletar dados de FAQ
    function collectFaqData() {
        const faqItems = [];
        document.querySelectorAll('#faq-list .knowledge-item').forEach(item => {
            const inputs = item.querySelectorAll('input');
            if (inputs[0] && inputs[1] && inputs[0].value.trim() && inputs[1].value.trim()) {
                faqItems.push({
                    question: inputs[0].value.trim(),
                    answer: inputs[1].value.trim()
                });
            }
        });
        return faqItems;
    }

    // Função para coletar dados de contatos
    function collectContactsData() {
        const contactItems = [];
        document.querySelectorAll('#contacts-list .knowledge-item').forEach(item => {
            const inputs = item.querySelectorAll('input');
            if (inputs[0] && inputs[1] && inputs[0].value.trim() && inputs[1].value.trim()) {
                contactItems.push({
                    sector: inputs[0].value.trim(),
                    contact: inputs[1].value.trim()
                });
            }
        });
        return contactItems;
    }

    async function startWhatsAppConnection(botId) {
        try {
            const token = await getAuthToken();
            
            elements.qrDisplay.innerHTML = `
                <div class="qr-loading">
                    <div class="loading-animation">
                        <div class="loading-spinner"></div>
                    </div>
                    <h3>Gerando QR Code...</h3>
                    <p>Aguarde enquanto preparamos a conexão com o WhatsApp</p>
                </div>
            `;
            
            await fetch(`${API_BASE_URL}/api/bots/${botId}/connect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
        } catch (error) {
            console.error('Erro ao iniciar conexão:', error);
            elements.qrDisplay.innerHTML = `
                <div class="qr-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <p>Erro ao gerar QR Code</p>
                </div>
            `;
        }
    }

    function populateWizardWithBotData(bot) {
        document.getElementById('bot-name').value = bot.name || '';
        
        // Função
        const functionCards = document.querySelectorAll('[data-step="1"] .option-grid:first-child .option-card');
        functionCards.forEach(card => card.classList.remove('selected'));
        
        const knownFunctions = ['Produtos e Serviços', 'Suporte ao Cliente', 'Agendamentos'];
        if (bot.function_type && knownFunctions.includes(bot.function_type)) {
            const targetCard = Array.from(functionCards).find(card => card.dataset.value === bot.function_type);
            if (targetCard) targetCard.classList.add('selected');
        } else {
            const customCard = Array.from(functionCards).find(card => card.dataset.value === 'Personalizado');
            if (customCard) {
                customCard.classList.add('selected');
                const customTextarea = document.getElementById('bot-function-custom');
                customTextarea.style.display = 'block';
                customTextarea.value = bot.function_type || '';
            }
        }
        
        // Tom
        const toneCards = document.querySelectorAll('[data-step="1"] .option-grid:last-child .option-card');
        toneCards.forEach(card => card.classList.remove('selected'));
        
        const targetToneCard = Array.from(toneCards).find(card => card.dataset.value === bot.tone_type);
        if (targetToneCard) {
            targetToneCard.classList.add('selected');
            if (bot.tone_type === 'Personalizado') {
                const customTextarea = document.getElementById('bot-tone-custom');
                customTextarea.style.display = 'block';
                customTextarea.value = bot.tone_custom_description || '';
            }
        }
    }

    function resetWizard() {
        console.log('🔄 Resetando wizard...');
        
        isEditMode = false;
        editingBotId = null;
        wizardBotData = {};
        currentWizardStep = 1;
        
        // Limpa campos básicos
        document.getElementById('bot-name').value = '';
        
        // Remove TODAS as seleções de cards
        document.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
        
        // Esconde e limpa textareas personalizados
        document.querySelectorAll('textarea').forEach(textarea => {
            textarea.style.display = 'none';
            textarea.value = '';
        });
        
        // CORRIGE BUG: Limpa completamente a base de conhecimento
        const faqList = document.getElementById('faq-list');
        const contactsList = document.getElementById('contacts-list');
        const filesList = document.getElementById('files-list');
        
        if (faqList) faqList.innerHTML = '';
        if (contactsList) contactsList.innerHTML = '';
        if (filesList) filesList.innerHTML = '';
        
        console.log('🧹 Base de conhecimento limpa');
        
        // Reseta horários para padrão
        resetScheduleToDefault();
        
        // Define seleções padrão
        setDefaultSelections();
        
        elements.qrDisplay.innerHTML = `
            <div class="qr-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="3" y="3" width="5" height="5"/>
                    <rect x="3" y="16" width="5" height="5"/>
                    <rect x="16" y="3" width="5" height="5"/>
                    <path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
                    <path d="M21 21v.01"/>
                    <path d="M12 7v3a2 2 0 0 1-2 2H7"/>
                    <path d="M3 12h.01"/>
                    <path d="M12 3h.01"/>
                    <path d="M12 16v.01"/>
                    <path d="M16 12h1"/>
                    <path d="M21 12v.01"/>
                    <path d="M12 21v-1"/>
                </svg>
                <p>QR Code aparecerá aqui</p>
            </div>
        `;
        
        setWizardStep(1);
        
        // Força validação inicial após reset
        setTimeout(() => {
            validateWizardStep(1);
        }, 100);
        
        console.log('✅ Wizard resetado completamente');
    }

    function setDefaultSelections() {
        // 1. Encontra o card de função "Produtos e Serviços" usando seu data-value
        const defaultFunctionCard = document.querySelector('#function-option-grid .option-card[data-value="Produtos e Serviços"]');
        if (defaultFunctionCard) {
            defaultFunctionCard.classList.add('selected');
        }

        // 2. Encontra o card de tom "Amigável" usando seu data-value
        const defaultToneCard = document.querySelector('#tone-option-grid .option-card[data-value="Amigável"]');
        if (defaultToneCard) {
            defaultToneCard.classList.add('selected');
        }

        console.log('✅ Seleções padrão aplicadas: Produtos e Serviços, Amigável');
    }

    // Nova função para resetar horários
    function resetScheduleToDefault() {
        // Seleciona "Sempre Ligado" como padrão
        const alwaysOnBtn = document.querySelector('[data-preset="always"]');
        if (alwaysOnBtn) {
            document.querySelectorAll('.schedule-preset').forEach(btn => btn.classList.remove('active'));
            alwaysOnBtn.classList.add('active');
            applySchedulePreset('always');
        }
    }

    // === SOCKET.IO ===
    function initializeSocket() {
        if (socket && socket.connected) return;
        
        socket = io(API_BASE_URL, { transports: ['websocket'] });
        
        socket.on("connect", () => {
            console.log("✅ Conectado ao servidor via WebSocket!");
        });
        
        socket.on("qr_code", (data) => {
            console.log("📱 QR Code recebido");
            elements.qrDisplay.innerHTML = "";
            new QRCode(elements.qrDisplay, {
                text: data.qrString,
                width: 240,
                height: 240,
                colorDark: "#000000",
                colorLight: "#ffffff"
            });
        });
        

        socket.on("client_ready", (data) => {
            console.log("✅ Cliente WhatsApp conectado!");

            // 1. Mostra uma mensagem de sucesso no lugar do QR Code.
            // Isso dá um feedback visual imediato ao usuário.
            elements.qrDisplay.innerHTML = `
                <div class="qr-placeholder" style="border: 2px solid var(--success); padding: 2rem; border-radius: 8px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22,4 12,14.01 9,11.01"/>
                    </svg>
                    <p style="color: var(--success); font-weight: 600; margin-top: 1rem;">Conectado com sucesso!</p>
                </div>
            `;
            
            // 2. Aguarda um breve momento (2 segundos) para o usuário ver a mensagem.
            setTimeout(() => {
                // 3. Reseta completamente o wizard para a próxima vez que for usado.
                resetWizard();
                // 4. Mostra a tela de sucesso final.
                showView('success');
            }, 2000);
        });
        
        socket.on("bot_status_changed", (data) => {
            console.log("🔄 Status do bot alterado:", data);
            const bot = userBots.find(b => b.id == data.botId);
            if (bot) {
                bot.status = data.status;
                renderBots();
            }
        });
        
        socket.on('connect_error', (err) => {
            console.error('❌ Falha na conexão do WebSocket:', err.message);
        });
    }

    // === EVENT LISTENERS ===
    function setupEventListeners() {
        elements.loginBtn.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch(console.error);
        });
        
        elements.logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
        
        elements.startWizardBtn.addEventListener('click', () => {
            resetWizard();
            showView('wizard');
        });
        
        elements.createBotBtn.addEventListener('click', () => {
            resetWizard();
            showView('wizard');
        });
        
        elements.closeWizard.addEventListener('click', () => {
            // --- NOVA LÓGICA DE LIMPEZA ---
            // Verifica se está na etapa 4 (QR Code) e se existe um bot sendo conectado
            const qrStepIsActive = document.querySelector('#step-4.wizard-step.active');
            const botIdBeingConnected = editingBotId; // Usamos a variável que já guarda o ID do bot

            if (qrStepIsActive && botIdBeingConnected) {
                console.log(`[Frontend] Saindo da tela de QR. Solicitando cancelamento da conexão para o bot ${botIdBeingConnected}.`);
                // Chama a API para forçar a desconexão no backend
                handleConnectionToggle(botIdBeingConnected, 'connecting'); // 'connecting' força a chamada de desconexão
            }
            // --- FIM DA NOVA LÓGICA ---

            resetWizard();
            showView('dashboard');
        });
        
        elements.backToDashboard.addEventListener('click', () => {
            fetchBots();
            showView('dashboard');
        });
    }

    // === FUNÇÕES AUXILIARES ===
    function addFaqItem(question = '', answer = '') {
        const faqList = document.getElementById('faq-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        item.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Pergunta" value="${question}">
                <input type="text" placeholder="Resposta" value="${answer}">
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        faqList.appendChild(item);
    }

    function addContactItem(sector = '', contact = '') {
        const contactsList = document.getElementById('contacts-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        item.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Para quem encaminhar?" value="${sector}">
                <input type="text" placeholder="Telefone, e-mail ou link de contato" value="${contact}">
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        contactsList.appendChild(item);
    }

    function handleFileUpload(event) {
        const files = event.target.files;
        if (!files.length) return;
        
        const filesList = document.getElementById('files-list');
        
        Array.from(files).forEach(async (file) => {
            if (file.size > 10 * 1024 * 1024) {
                alert(`O arquivo "${file.name}" é muito grande. O limite é de 10MB.`);
                return;
            }
            
            console.log('📄 Processando arquivo:', file.name);
            
            // Mostra o arquivo com status de processando
            const fileItem = addFileToList(file, 'processing');
            
            try {
                // Converte para base64
                const base64Content = await toBase64(file);
                
                // Se estamos criando um novo bot, apenas adiciona à lista
                // O upload real será feito após a criação do bot
                if (!isEditMode) {
                    updateFileItemStatus(fileItem, 'ready');
                    console.log('✅ Arquivo preparado para upload após criação do bot');
                } else {
                    // Se estamos editando, faz upload imediatamente
                    await uploadFileToBot(editingBotId, file, base64Content, fileItem);
                }
                
            } catch (error) {
                console.error('❌ Erro ao processar arquivo:', error);
                updateFileItemStatus(fileItem, 'error');
            }
        });
        
        event.target.value = '';
    }

    function addFileToList(file, status = 'ready') {
        const filesList = document.getElementById('files-list');
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.status = status;
        
        const fileName = file.name || file.file_name;
        
        item.innerHTML = `
            <div class="file-info">
                <span class="file-icon">📄</span>
                <span class="file-name">${fileName}</span>
                <span class="file-status">${getStatusText(status)}</span>
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        filesList.appendChild(item);
        return item;
    }

    function updateFileItemStatus(fileItem, status) {
        fileItem.dataset.status = status;
        const statusEl = fileItem.querySelector('.file-status');
        if (statusEl) {
            statusEl.textContent = getStatusText(status);
        }
        
        // Adiciona classe CSS para styling
        fileItem.className = `file-item file-${status}`;
    }

    function getStatusText(status) {
        switch (status) {
            case 'processing': return '🔄 Processando...';
            case 'uploading': return '⬆️ Enviando...';
            case 'ready': return '✅ Pronto';
            case 'error': return '❌ Erro';
            default: return '📄 Arquivo';
        }
    }

    async function uploadFileToBot(botId, file, base64Content, fileItem) {
        try {
            updateFileItemStatus(fileItem, 'uploading');
            
            const token = await getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/summarize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    fileContent: base64Content,
                    fileType: file.type,
                    fileName: file.name
                })
            });

            if (!response.ok) {
                throw new Error('Falha no upload do arquivo');
            }

            const result = await response.json();
            updateFileItemStatus(fileItem, 'ready');
            console.log('✅ Arquivo processado com sucesso:', result);

        } catch (error) {
            console.error('❌ Erro no upload:', error);
            updateFileItemStatus(fileItem, 'error');
            throw error;
        }
    }

    // Função toBase64 melhorada
    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove o prefixo "data:tipo/subtipo;base64,"
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    function applySchedulePreset(preset) {
        const days = document.querySelectorAll('.schedule-day');
        
        switch (preset) {
            case 'commercial':
                days.forEach((day, index) => {
                    const toggle = day.querySelector('input[type="checkbox"]');
                    const openTime = day.querySelector('input[type="time"]:first-of-type');
                    const closeTime = day.querySelector('input[type="time"]:last-of-type');
                    
                    if (index < 5) { // Segunda a sexta
                        toggle.checked = true;
                        if (openTime) openTime.value = '09:00';
                        if (closeTime) closeTime.value = '18:00';
                    } else { // Fim de semana
                        toggle.checked = false;
                    }
                    
                    updateDayScheduleState(day);
                });
                break;
                
            case 'always':
                days.forEach(day => {
                    const toggle = day.querySelector('input[type="checkbox"]');
                    const openTime = day.querySelector('input[type="time"]:first-of-type');
                    const closeTime = day.querySelector('input[type="time"]:last-of-type');
                    
                    toggle.checked = true;
                    if (openTime) openTime.value = '00:00';
                    if (closeTime) closeTime.value = '23:59';
                    
                    updateDayScheduleState(day);
                });
                break;
                
            case 'night':
                days.forEach(day => {
                    const toggle = day.querySelector('input[type="checkbox"]');
                    const openTime = day.querySelector('input[type="time"]:first-of-type');
                    const closeTime = day.querySelector('input[type="time"]:last-of-type');
                    
                    toggle.checked = true;
                    if (openTime) openTime.value = '18:00';
                    if (closeTime) closeTime.value = '06:00';
                    
                    updateDayScheduleState(day);
                });
                break;
        }
    }

    function updateDayScheduleState(dayElement) {
        const toggle = dayElement.querySelector('input[type="checkbox"]');
        const timeInputs = dayElement.querySelector('.time-inputs');
        
        if (toggle && timeInputs) {
            if (toggle.checked) {
                timeInputs.classList.remove('disabled');
                // Se não tem campos de tempo, cria eles
                if (!timeInputs.querySelector('input[type="time"]')) {
                    timeInputs.innerHTML = `
                        <label>Abre</label>
                        <input type="time" value="09:00">
                        <label>Fecha</label>
                        <input type="time" value="18:00">
                    `;
                }
            } else {
                timeInputs.classList.add('disabled');
                timeInputs.innerHTML = '<label>Fechado</label>';
            }
        }
    }

    // === EDIÇÃO DE BOT ===
    function initializeEditView() {
        setupEditEventListeners();
        setupEditScheduleControls();
        setupEditKnowledgeBase();
    }

    function setupEditEventListeners() {
        const closeEditBtn = document.getElementById('close-edit');
        const cancelEditBtn = document.getElementById('cancel-edit');
        const editForm = document.getElementById('edit-bot-form');

        if (closeEditBtn) {
            closeEditBtn.addEventListener('click', () => {
                showView('dashboard');
            });
        }

        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                showView('dashboard');
            });
        }

        if (editForm) {
            editForm.addEventListener('submit', handleEditFormSubmit);
        }

        // Event listeners para campos personalizados
        const editFunctionSelect = document.getElementById('edit-bot-function');
        const editToneSelect = document.getElementById('edit-bot-tone');

        if (editFunctionSelect) {
            editFunctionSelect.addEventListener('change', (e) => {
                const customTextarea = document.getElementById('edit-bot-function-custom');
                if (customTextarea) {
                    customTextarea.style.display = (e.target.value === 'Personalizado') ? 'block' : 'none';
                }
            });
        }

        if (editToneSelect) {
            editToneSelect.addEventListener('change', (e) => {
                const customTextarea = document.getElementById('edit-bot-tone-custom');
                if (customTextarea) {
                    customTextarea.style.display = (e.target.value === 'Personalizado') ? 'block' : 'none';
                }
            });
        }

        // Event listener para ativar/desativar horário
        const scheduleEnabledCheckbox = document.getElementById('edit-schedule-enabled');
        const scheduleDetails = document.getElementById('edit-schedule-details');

        if (scheduleEnabledCheckbox && scheduleDetails) {
            scheduleEnabledCheckbox.addEventListener('change', () => {
                scheduleDetails.style.display = scheduleEnabledCheckbox.checked ? 'block' : 'none';
            });
        }
    }

    function setupEditScheduleControls() {
        // Setup dos toggles de dia na view de edição
        const editScheduleDays = document.querySelectorAll('#edit-schedule-details .schedule-day');
        
        editScheduleDays.forEach(dayElement => {
            const toggle = dayElement.querySelector('input[type="checkbox"]');
            
            if (toggle) {
                toggle.addEventListener('change', () => {
                    updateDayScheduleState(dayElement);
                });
                
                // Inicializa o estado
                updateDayScheduleState(dayElement);
            }
        });
    }

    function setupEditKnowledgeBase() {
        // FAQ
        const addFaqBtn = document.getElementById('edit-add-faq');
        if (addFaqBtn) {
            addFaqBtn.addEventListener('click', () => {
                addEditFaqItem();
            });
        }

        // Contacts
        const addContactBtn = document.getElementById('edit-add-contact');
        if (addContactBtn) {
            addContactBtn.addEventListener('click', () => {
                addEditContactItem();
            });
        }

        // File upload
        const uploadBtn = document.getElementById('edit-upload-btn');
        const fileInput = document.getElementById('edit-file-upload');
        
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', handleEditFileUpload);
        }
    }

    function populateEditFormWithBotData(bot) {
        // Dados básicos
        document.getElementById('edit-bot-id').value = bot.id;
        document.getElementById('edit-bot-name').value = bot.name || '';
        
        // Função
        const functionSelect = document.getElementById('edit-bot-function');
        const functionCustomTextarea = document.getElementById('edit-bot-function-custom');
        const knownFunctions = ['Suporte ao Cliente', 'Produtos e Serviços', 'Agendamentos'];

        if (bot.function_type && knownFunctions.includes(bot.function_type)) {
            functionSelect.value = bot.function_type;
            functionCustomTextarea.style.display = 'none';
            functionCustomTextarea.value = '';
        } else {
            functionSelect.value = 'Personalizado';
            functionCustomTextarea.style.display = 'block';
            functionCustomTextarea.value = bot.function_type || '';
        }

        // Tom
        const toneSelect = document.getElementById('edit-bot-tone');
        const toneCustomTextarea = document.getElementById('edit-bot-tone-custom');
        
        toneSelect.value = bot.tone_type || 'Amigável';
        toneCustomTextarea.value = bot.tone_custom_description || '';
        toneCustomTextarea.style.display = (bot.tone_type === 'Personalizado') ? 'block' : 'none';

        // Horário - parse dos dados JSON do backend
        const scheduleEnabledCheckbox = document.getElementById('edit-schedule-enabled');
        const scheduleDetails = document.getElementById('edit-schedule-details');
        
        scheduleEnabledCheckbox.checked = bot.schedule_enabled || false;
        scheduleDetails.style.display = bot.schedule_enabled ? 'block' : 'none';

        // Parse dos dados de horário que vêm como string JSON do backend
        let scheduleData = [];
        if (bot.schedule_data) {
            try {
                scheduleData = typeof bot.schedule_data === 'string' ? 
                              JSON.parse(bot.schedule_data) : 
                              bot.schedule_data;
            } catch (e) {
                console.error('Erro ao fazer parse do schedule_data:', e);
                scheduleData = [];
            }
        }

        if (scheduleData.length > 0) {
            const editScheduleDays = document.querySelectorAll('#edit-schedule-details .schedule-day');
            editScheduleDays.forEach((dayElement, index) => {
                const dayData = scheduleData[index] || { active: false, open: '09:00', close: '18:00' };
                const toggle = dayElement.querySelector('input[type="checkbox"]');
                const openTime = dayElement.querySelector('input[type="time"]:first-of-type');
                const closeTime = dayElement.querySelector('input[type="time"]:last-of-type');
                
                if (toggle) toggle.checked = dayData.active;
                if (openTime) openTime.value = dayData.open;
                if (closeTime) closeTime.value = dayData.close;
                
                updateDayScheduleState(dayElement);
            });
        }

        // Base de conhecimento - parse dos dados JSON do backend
        let faqData = [];
        let contactsData = [];
        
        if (bot.knowledge_faq) {
            try {
                faqData = typeof bot.knowledge_faq === 'string' ? 
                         JSON.parse(bot.knowledge_faq) : 
                         bot.knowledge_faq;
            } catch (e) {
                console.error('Erro ao fazer parse do knowledge_faq:', e);
                faqData = [];
            }
        }
        
        if (bot.knowledge_contacts) {
            try {
                contactsData = typeof bot.knowledge_contacts === 'string' ? 
                              JSON.parse(bot.knowledge_contacts) : 
                              bot.knowledge_contacts;
            } catch (e) {
                console.error('Erro ao fazer parse do knowledge_contacts:', e);
                contactsData = [];
            }
        }

        populateEditFAQ(faqData);
        populateEditContacts(contactsData);
        populateEditFiles(bot.knowledge_files || []);
    }

    function populateEditFAQ(faqs) {
        const faqList = document.getElementById('edit-faq-list');
        faqList.innerHTML = '';
        
        faqs.forEach(faq => {
            addEditFaqItem(faq.question, faq.answer);
        });
    }

    function populateEditContacts(contacts) {
        const contactsList = document.getElementById('edit-contacts-list');
        contactsList.innerHTML = '';
        
        contacts.forEach(contact => {
            addEditContactItem(contact.sector, contact.contact);
        });
    }

    function populateEditFiles(files) {
        const filesList = document.getElementById('edit-files-list');
        filesList.innerHTML = '';
        
        files.forEach(file => {
            addEditFileToList(file);
        });
    }

    function addEditFaqItem(question = '', answer = '') {
        const faqList = document.getElementById('edit-faq-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        item.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Pergunta" value="${question}">
                <input type="text" placeholder="Resposta" value="${answer}">
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        faqList.appendChild(item);
    }

    function addEditContactItem(sector = '', contact = '') {
        const contactsList = document.getElementById('edit-contacts-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        item.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Para quem encaminhar?" value="${sector}">
                <input type="text" placeholder="Telefone, e-mail ou link de contato" value="${contact}">
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        contactsList.appendChild(item);
    }

    function addEditFileToList(file) {
        const filesList = document.getElementById('edit-files-list');
        const item = document.createElement('div');
        item.className = 'file-item';
        
        const fileName = file.file_name || file.name;
        
        item.innerHTML = `
            <div class="file-info">
                <span>📄</span>
                <span>${fileName}</span>
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        filesList.appendChild(item);
    }

    function handleEditFileUpload(event) {
        const files = event.target.files;
        if (!files.length) return;
        
        Array.from(files).forEach(file => {
            if (file.size > 10 * 1024 * 1024) {
                alert(`O arquivo "${file.name}" é muito grande. O limite é de 10MB.`);
                return;
            }
            
            addEditFileToList(file);
        });
        
        event.target.value = '';
    }

    async function handleEditFormSubmit(event) {
        event.preventDefault();
        
        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner"></span> Salvando...';
        
        try {
            const token = await getAuthToken();
            const botId = document.getElementById('edit-bot-id').value;
            
            // Coleta dados do formulário de edição
            let functionValue = document.getElementById('edit-bot-function').value;
            if (functionValue === 'Personalizado') {
                functionValue = document.getElementById('edit-bot-function-custom').value;
            }
            
            let toneValue = document.getElementById('edit-bot-tone').value;
            let toneCustom = '';
            if (toneValue === 'Personalizado') {
                toneCustom = document.getElementById('edit-bot-tone-custom').value;
            }

            // Coleta dados de horário usando nomes corretos que o backend espera
            const scheduleEnabled = document.getElementById('edit-schedule-enabled').checked;
            const scheduleData = [];
            
            // Backend espera estes nomes específicos de dias
            const dayNames = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
            
            const editDays = document.querySelectorAll('#edit-schedule-details .schedule-day');
            
            editDays.forEach((dayElement, index) => {
                const toggle = dayElement.querySelector('input[type="checkbox"]');
                const openTime = dayElement.querySelector('input[type="time"]:first-of-type');
                const closeTime = dayElement.querySelector('input[type="time"]:last-of-type');
                
                scheduleData.push({
                    day: dayNames[index], // Usa os nomes corretos que o backend espera
                    active: toggle ? toggle.checked : false,
                    open: openTime ? openTime.value : '09:00',
                    close: closeTime ? closeTime.value : '18:00'
                });
            });

            // Coleta FAQs
            const faqItems = [];
            document.querySelectorAll('#edit-faq-list .knowledge-item').forEach(item => {
                const inputs = item.querySelectorAll('input');
                if (inputs[0] && inputs[1] && inputs[0].value.trim() && inputs[1].value.trim()) {
                    faqItems.push({
                        question: inputs[0].value.trim(),
                        answer: inputs[1].value.trim()
                    });
                }
            });

            // Coleta contatos
            const contactItems = [];
            document.querySelectorAll('#edit-contacts-list .knowledge-item').forEach(item => {
                const inputs = item.querySelectorAll('input');
                if (inputs[0] && inputs[1] && inputs[0].value.trim() && inputs[1].value.trim()) {
                    contactItems.push({
                        sector: inputs[0].value.trim(),
                        contact: inputs[1].value.trim()
                    });
                }
            });

            const botData = {
                name: document.getElementById('edit-bot-name').value,
                function_type: functionValue,
                tone_type: toneValue,
                tone_custom_description: toneCustom,
                schedule_enabled: scheduleEnabled,
                schedule_data: JSON.stringify(scheduleData),
                knowledge_faq: JSON.stringify(faqItems),
                knowledge_contacts: JSON.stringify(contactItems)
            };
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(botData)
            });

            if (!response.ok) throw new Error('Falha ao atualizar o bot.');
            
            await fetchBots();
            showView('dashboard');
            
        } catch (error) {
            console.error('Erro ao atualizar bot:', error);
            alert('Não foi possível salvar as alterações.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Alterações';
        }
    }

    // === INICIALIZAÇÃO ===
    function initializeApp() {
        console.log('🚀 Inicializando FacilChat...');
        console.log('🔧 Versão: Anti-Login-Bug v2.0');
        
        // Mostra loading enquanto verifica autenticação
        if (appLoading) {
            appLoading.classList.remove('hidden');
            console.log('⏳ Loading ativado');
        }
        
        // Garante que nenhuma view está ativa inicialmente
        Object.values(views).forEach(view => view.classList.remove('active'));
        console.log('🧹 Todas as views desativadas');
        
        // Esconde header inicialmente
        if (elements.header) {
            elements.header.style.display = 'none';
            console.log('🔒 Header escondido inicialmente');
        }
        
        setupEventListeners();
        initializeWizard();
        initializeEditView();
        
        // Firebase Auth State - ÚNICA fonte de verdade para views
        auth.onAuthStateChanged((user) => {
            console.log('🔐 Estado de autenticação verificado:', user ? `Logado: ${user.email}` : 'Não logado');
            
            // DEBUG: Verifica estado atual
            const activeViews = Object.keys(views).filter(key => views[key].classList.contains('active'));
            console.log('📱 Views ativas antes do handleAuth:', activeViews);
            console.log('👁️ Header visível:', elements.header.style.display !== 'none');
            
            handleAuthStateChange(user);
        });
        
        console.log('✅ Inicialização completa');
        
        // VERIFICAÇÃO DE SEGURANÇA APÓS 3 SEGUNDOS
        setTimeout(() => {
            console.log('🔒 VERIFICAÇÃO DE SEGURANÇA - Estado após 3s:');
            debugViewState();
            
            // Se usuário está logado mas view de login está ativa, CORRIGE
            if (auth.currentUser && views.login.classList.contains('active')) {
                console.log('🚨 DETECTADO: Login ativo com usuário logado - CORRIGINDO!');
                showView('dashboard');
            }
            
            // Se header não está visível mas usuário está logado, CORRIGE
            if (auth.currentUser && elements.header.style.display === 'none') {
                console.log('🚨 DETECTADO: Header escondido com usuário logado - CORRIGINDO!');
                elements.header.style.display = 'block';
            }
        }, 3000);
    }

    initializeApp();
});