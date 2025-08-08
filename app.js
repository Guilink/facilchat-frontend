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
    //const API_BASE_URL = 'http://localhost:3000';


    
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
    let wizardBotId = null; // <-- NOVA VARIÁVEL DE CONTROLE
    let wizardFilesToUpload = []; // <-- NOVA VARIÁVEL


    
    // === ELEMENTOS ===
    const views = {
        login: document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        wizard: document.getElementById('wizard-view'),
        success: document.getElementById('success-view'),
        edit: document.getElementById('edit-view'),
        plans: document.getElementById('plans-view')
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

    // Adicione esta nova função auxiliar
    function updateUploadButtonState(listElementId, buttonElementId) {
        const list = document.getElementById(listElementId);
        const button = document.getElementById(buttonElementId).parentElement; // Pega a div .upload-area
        const fileCount = list.querySelectorAll('.file-item').length;

        if (fileCount >= 3) {
            button.style.display = 'none'; // Esconde o botão
        } else {
            button.style.display = 'block'; // Mostra o botão
        }
    }    
    //DUAS NOVAS FUNÇÕES GLOBAIS
    function showQrModal(contentHTML) {
        const modal = document.getElementById('qr-modal');
        const contentArea = document.getElementById('qr-modal-content');
        contentArea.innerHTML = contentHTML;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function hideQrModal() {
        const modal = document.getElementById('qr-modal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    //FUNÇÃO GLOBAL PARA CANCELAR A CONEXÃO
    window.cancelConnection = function() {
        if (editingBotId) {
            console.log(`[Frontend] Cancelando conexão para o bot ${editingBotId}`);
            // A função handleConnectionToggle já faz a chamada de disconnect correta
            handleConnectionToggle(editingBotId, 'connecting');
        }
        hideQrModal();
        editingBotId = null; // Limpa o ID do bot em conexão
    }    
    // === GERENCIAMENTO DE VIEWS ===
    let lastViewChange = null;
    
    // EM: app.js

    function showView(viewName) {
        // A lógica de log e validação permanece, pois é ótima!
        const timestamp = new Date().toISOString();
        const stack = new Error().stack.split('\n')[2].trim();
        console.log(`🔄 [${timestamp}] MUDANÇA DE VIEW: ${lastViewChange || 'nenhuma'} → ${viewName}`);
        console.log(`📍 Chamado por:`, stack);
        
        if (viewName === 'login' && auth.currentUser) {
            console.log('🚫 BLOQUEADO: Tentativa de mostrar login com usuário autenticado!');
            return;
        }
        
        // ATENÇÃO: A linha que escondia o "appLoading" foi REMOVIDA daqui.
        
        // Atualiza views
        Object.values(views).forEach(view => view.classList.remove('active'));
        
        if (views[viewName]) {
            views[viewName].classList.add('active');
            lastViewChange = viewName;
            
            // Controla header
            if (viewName === 'login') {
                elements.header.style.display = 'none';
            } else {
                elements.header.style.display = 'block';
            }
        } else {
            console.error('❌ View não encontrada:', viewName);
        }
        
        console.log('✅ View ativa:', viewName);
    }

        // === AUTENTICAÇÃO ===
    async function handleAuthStateChange(user) {
        if (user) {
            // --- USUÁRIO ESTÁ LOGADO ---
            console.log('✅ Usuário autenticado:', user.email);

            // ETAPA 1: PREPARAÇÃO VISUAL (Loading Ativo)
            // Garante que o loading está visível e nenhuma outra tela esteja ativa.
            appLoading.classList.remove('hidden'); // MOSTRA o loading
            Object.values(views).forEach(view => view.classList.remove('active')); // LIMPA todas as views ativas
            elements.header.style.display = 'none'; // GARANTE que o header comece escondido

            try {
                // ETAPA 2: OPERAÇÕES DE BACKEND (enquanto o loading está na tela)
                const syncedUser = await syncUserWithBackend();
                if (!syncedUser) {
                    throw new Error("Sincronização do usuário não retornou dados.");
                }
                
                await fetchBots();
                initializeSocket();
                
                // ETAPA 3: TRANSIÇÃO VISUAL FINAL (Após tudo carregar)
                elements.header.style.display = 'block'; // AGORA sim, mostra o header
                showView('dashboard');                   // MOSTRA o dashboard

            } catch (error) {
                console.error('ERRO CRÍTICO DURANTE A INICIALIZAÇÃO:', error);
                showToast("Erro ao carregar sua conta. Deslogando.", "error");
                auth.signOut();
            } finally {
                // ETAPA 4: SEMPRE esconde o loading no final, seja sucesso ou falha.
                appLoading.classList.add('hidden');
            }
            
        } else {
            // --- O USUÁRIO NÃO ESTÁ LOGADO ---
            console.log('❌ Usuário não autenticado.');
            elements.header.style.display = 'none';
            if (socket) socket.disconnect();
            
            // Garante que o loading seja escondido antes de mostrar o login
            appLoading.classList.add('hidden'); 
            showView('login');
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

    // SUBSTITUA A FUNÇÃO createBotAndConnect INTEIRA
    async function createBotAndConnect() {
        try {
            // Passo 1: Mostra a mensagem de criação do bot
            elements.qrDisplay.innerHTML = `
                <div class="qr-loading">
                    <div class="loading-spinner"></div>
                    <h3>Criando assistente...</h3>
                    <p>Aguarde um momento.</p>
                </div>
            `;
            
            const newBot = await createBot(); 
            wizardBotId = newBot.id;

            // Passo 2: Faz o upload dos arquivos, se houver
            if (wizardFilesToUpload.length > 0) {
                elements.qrDisplay.innerHTML = `
                    <div class="qr-loading">
                        <div class="loading-spinner"></div>
                        <h3>2/3: Processando documentos...</h3>
                        <p>${wizardFilesToUpload.length} arquivo(s) sendo analisado(s) pela IA.</p>
                    </div>
                `;
                await Promise.all(
                    wizardFilesToUpload.map(fileData => 
                        uploadFileToBot(newBot.id, fileData.file, fileData.base64Content)
                    )
                );
            }

            // Passo 3: INICIA a conexão com o WhatsApp e pede o QR Code
            await startWhatsAppConnection(newBot.id);

        } catch (error) {
            console.error('Erro durante createBotAndConnect:', error);
            elements.qrDisplay.innerHTML = `
                <div class="qr-error">
                    <h3>❌ Erro na Criação</h3>
                    <p>${error.message || 'Não foi possível concluir a criação do bot.'}</p>
                </div>
            `;
        }
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
            const response = await fetch(`${API_BASE_URL}/api/users/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                // Se a resposta não for OK, tentamos ler a mensagem de erro do backend
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.message || "Falha ao sincronizar usuário com o servidor.");
            }
            
            const user = await response.json(); // Pega os dados do usuário do backend
            updateHeaderPlanInfo(user); // Atualiza o header com as informações do plano
            
            return user; // Retorna os dados do usuário para a função que a chamou

        } catch (error) {
            console.error("Erro em syncUserWithBackend:", error.message);
            // Propaga o erro para que a função `handleAuthStateChange` possa tratá-lo
            throw error; 
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

    // COLE ESTA NOVA FUNÇÃO NO SEU app.js

    async function fetchBotStats(botId) {
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) return; // Se falhar, simplesmente não atualiza os stats

            const stats = await response.json();

            // Agora, atualiza a interface (o card específico do bot)
            const card = document.querySelector(`.bot-card[data-bot-id="${botId}"]`);
            if (card) {
                const conversationsEl = card.querySelector('.stat-item:nth-child(1) .stat-number');
                const sentEl = card.querySelector('.volume-item:nth-child(1) span');
                const receivedEl = card.querySelector('.volume-item:nth-child(2) span');

                if (conversationsEl) conversationsEl.textContent = stats.conversations;
                if (sentEl) sentEl.textContent = stats.messagesSent;
                if (receivedEl) receivedEl.textContent = stats.messagesReceived;
            }
        } catch (error) {
            console.error(`Falha ao buscar stats para o bot ${botId}:`, error);
        }
    }    

    function renderDashboard() {
        // PASSO 1: SEMPRE limpa a lista de bots para evitar "fantasmas".
        elements.botsList.innerHTML = '';

        // PASSO 2: Decide qual container principal mostrar.
        if (userBots.length === 0) {
            // Se NÃO há bots: mostra o container de boas-vindas e esconde o de bots.
            elements.welcomeState.style.display = 'contents'; // 'contents' para funcionar com o novo grid
            elements.botsState.style.display = 'none';
        } else {
            // Se HÁ bots: esconde o de boas-vindas e mostra o container de bots.
            elements.welcomeState.style.display = 'none';
            elements.botsState.style.display = 'contents'; // 'contents' para funcionar com o novo grid
            
            // PASSO 3: Apenas se houver bots, renderiza os cards.
            renderBots();
        }
    }

    let isInitialLoad = true;
    
    function renderBots() {
        elements.botsList.innerHTML = '';
        
        userBots.forEach(bot => {
            const botCard = createBotCard(bot);
            // Aplica animação apenas no carregamento inicial
            if (isInitialLoad) {
                botCard.classList.add('initial-load');
            }
            elements.botsList.appendChild(botCard);
            fetchBotStats(bot.id); //
        });
        
        // Após o primeiro carregamento, desabilita as animações
        if (isInitialLoad) {
            isInitialLoad = false;
        }
    }

    function createBotCard(bot) {
        const card = document.createElement('div');
        card.className = 'bot-card';
        card.setAttribute('data-bot-id', bot.id);

        // --- NOVA LÓGICA DE STATUS ---
        const isConnected = bot.status === 'online' || bot.status === 'paused';
        const isActive = bot.status === 'online';
        const phoneDisplay = bot.connected_phone || '';

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
                </div>
                <div class="bot-toggle-area">
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
            
            <div class="bot-stats">
                <div class="stat-item">
                    <div class="stat-number">0</div>
                    <div class="stat-label">Conversas</div>
                </div>
                
                <!-- Novo Bloco de Volume -->
                <div class="stat-item volume-stats" title="Mensagens enviadas e recebidas">
                    <div class="volume-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                        <span>0</span>
                    </div>
                    <div class="volume-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                        <span>0</span>
                    </div>
                    <div class="stat-label">Volume</div>
                </div>
                
                <div class="stat-item">
                    <div class="stat-number">0</div>
                    <div class="stat-label">Leads</div>
                </div>
            </div>
            
            <div class="bot-actions">
                <div class="bot-actions-left">
                    ${connectionButtonHTML}
                </div>
                <div class="bot-actions-right">
                    <button class="bot-config" onclick="openBotSettings('${bot.id}')" title="Configurações">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="bot-delete" onclick="handleDeleteBot('${bot.id}')" title="Deletar bot">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        return card;
    }


    window.handleConnectionToggle = async function(botId, currentStatus) {
        const button = document.querySelector(`[data-connect-btn-for="${botId}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner"></span> Processando...';
        }

        try {
            const token = await getAuthToken();
            let response;
            
            // Ação de DESCONECTAR (se estiver online/pausado) ou CANCELAR (se estiver conectando)
            if (currentStatus === 'online' || currentStatus === 'paused' || currentStatus === 'connecting') {
                console.log(`[Bot ${botId}] Solicitando desconexão/cancelamento...`);
                response = await fetch(`${API_BASE_URL}/api/bots/${botId}/disconnect`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
            } 
            // Ação de CONECTAR (se estiver offline)
            else if (currentStatus === 'offline') {
                console.log(`[Bot ${botId}] Iniciando conexão...`);
                // Guarda o ID do bot que está tentando conectar para que os eventos do socket saibam qual modal atualizar
                editingBotId = botId; 

                // 1. Abre o novo modal com um estado de "loading"
                showQrModal(`
                    <div class="qr-loading">
                        <div class="loading-spinner"></div>
                        <h3>Gerando QR Code...</h3>
                        <p>Aguarde enquanto preparamos a conexão com o WhatsApp.</p>
                    </div>
                `);
                
                // 2. Chama a API para iniciar o processo de conexão no backend.
                // A resposta aqui apenas confirma que o processo começou.
                // O QR code e o status de sucesso virão pelos eventos do WebSocket.
                response = await fetch(`${API_BASE_URL}/api/bots/${botId}/connect`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                // A antiga lógica de "showView('wizard')" foi removida daqui.
            }

            // Se a resposta da API (não a conexão do whats) der erro, lança uma exceção
            if (response && !response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Falha na operação.');
            }

        } catch (error) {
            console.error(`Erro na operação de conexão:`, error);
            alert(`Erro: ${error.message}`);
            
            // Em caso de erro, garante que o modal de QR code seja fechado
            hideQrModal(); 
            
            // Força a recarga dos bots para sincronizar o estado visual no dashboard
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

        isEditMode = true; // <-- CORREÇÃO: Define o modo de edição como ativo
        editingBotId = botId;
        populateEditFormWithBotData(bot);
        showView('edit');
    };

    let botToDelete = null;

    function openDeleteModal(botId, botName) {
        botToDelete = botId;
        const modal = document.getElementById('delete-modal');
        // Agora busca o novo elemento SPAN
        const botNameEl = document.getElementById('delete-bot-name-modal');
        const confirmBtn = document.getElementById('confirm-delete-btn');
        
        botNameEl.textContent = `"${botName}"`; // Coloca o nome entre aspas para destaque
        modal.classList.add('active');
        
        // Reseta o estado do botão ao abrir o modal
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Deletar Permanentemente';

        confirmBtn.onclick = null;
        confirmBtn.onclick = confirmDeleteBot;
        
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
        confirmBtn.innerHTML = 'Deletando...';
        
        try {
            const token = await getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao deletar o bot');
            }
            
            closeDeleteModal();
            await fetchBots();
            console.log('✅ Bot deletado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao deletar bot:', error);
            alert('Erro ao deletar o bot: ' + error.message);
        } finally {
            // Este bloco SEMPRE será executado, resetando o botão.
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Deletar Permanentemente';
            // Se a deleção foi bem-sucedida, o modal já vai estar fechado,
            // mas o reset não causa nenhum problema. Se falhou, o modal continua
            // aberto e o botão volta ao normal para uma nova tentativa.
        }
    }

    window.handleDeleteBot = async function(botId) {
        // A única mudança é aqui: usamos '==' em vez de '===' para comparar
        // o botId (string do HTML) com b.id (número do array).
        const bot = userBots.find(b => b.id == botId); 
        
        // Se o bot for encontrado, usa o nome dele. Senão, usa um nome genérico como segurança.
        const botName = bot ? bot.name : 'este assistente'; 
        
        // Abre o modal de deleção com o ID e o nome correto.
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
        
        // --- LÓGICA DE BOTÕES E AÇÕES DA ETAPA 4 ---
        if (step === 4) {
            // Altera o texto do botão principal para refletir a nova ação
            elements.wizardContinue.textContent = 'Fazer isso depois';
            
            // Se estivermos criando um novo bot (não editando), iniciamos a criação E conexão
            if (!isEditMode && wizardBotId === null) { 
                console.log('🤖 Chegou na Etapa 4 pela primeira vez. Iniciando criação e conexão do bot...');
                createBotAndConnect(); 
            } else {
                console.log('↩️ Retornando para a Etapa 4. O bot já foi criado ou está em modo de edição.');
            }
        } else {
            elements.wizardContinue.textContent = 'Continuar';
        }

        if (elements.wizardSkip) {
            elements.wizardSkip.style.display = 'none';
        }
        
        // CORRIGE BUG WIZARD: Valida o passo atual após mudança
        validateWizardStep(step);
    }

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
        validateWizardStep(currentWizardStep);
        if (elements.wizardContinue.disabled && currentWizardStep !== 4) {
            return;
        }

        // Se não estamos na última etapa, apenas avança
        if (currentWizardStep < 4) {
            setWizardStep(currentWizardStep + 1);
        } 
        // Se estamos na última etapa (botão "Fazer isso depois")
        else {
            // Apenas fecha o wizard e vai para o dashboard
            console.log('Usuário clicou em "Fazer isso depois". Indo para o dashboard.');
            
            // É importante chamar a função para cancelar a tentativa de conexão atual
            if (editingBotId) {
                handleConnectionToggle(editingBotId, 'connecting');
            }

            resetWizard();
            showView('dashboard');
            fetchBots(); // Garante que a lista de bots (com o novo bot) seja carregada
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
            const token = await getAuthToken();
            
            // A lógica de coleta de dados permanece a mesma
            const selectedFunctionCard = document.querySelector('#function-option-grid .option-card.selected');
            const selectedToneCard = document.querySelector('#tone-option-grid .option-card.selected');
            let functionType = selectedFunctionCard ? selectedFunctionCard.dataset.value : 'Suporte ao Cliente';
            let toneType = selectedToneCard ? selectedToneCard.dataset.value : 'Amigável';
            let toneCustomDescription = '';
            if (functionType === 'Personalizado') {
                functionType = document.getElementById('bot-function-custom').value.trim() || 'Função Personalizada';
            }
            if (toneType === 'Personalizado') {
                toneCustomDescription = document.getElementById('bot-tone-custom').value.trim();
            }
            const scheduleData = collectScheduleData();
            const faqData = collectFaqData();
            const contactsData = collectContactsData();
            
            const botData = {
                name: document.getElementById('bot-name').value || 'Novo Bot',
                function_type: functionType,
                tone_type: toneType,
                tone_custom_description: toneCustomDescription,
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
            
            // Apenas definimos os IDs aqui. A conexão será iniciada em outro lugar.
            editingBotId = newBot.id; 
            
            return newBot; // Retorna o bot recém-criado
            
        } catch (error) {
            console.error('Erro em createBot:', error);
            throw error; 
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

    window.handleDeleteFile = async function(button, botId, fileId) {
        // A LINHA DO "if (!confirm(...))" FOI REMOVIDA DAQUI.

        try {
            button.disabled = true;
            // Mostra um spinner dentro do botão para dar feedback visual
            button.innerHTML = '<span class="spinner" style="width:16px; height:16px; border-width:2px;"></span>';

            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/files/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Falha ao deletar arquivo.');
            }

            const fileItem = button.closest('.file-item');
            fileItem.remove();

            const bot = userBots.find(b => b.id == botId);
            if (bot && bot.knowledge_files) {
                const fileIndex = bot.knowledge_files.findIndex(f => f.id == fileId);
                if (fileIndex > -1) {
                    bot.knowledge_files.splice(fileIndex, 1);
                    console.log('✅ Arquivo removido do estado local (userBots).');
                }
            }
            
            updateUploadButtonState('edit-files-list', 'edit-upload-btn');

        } catch (error) {
            alert(`Erro: ${error.message}`);
            // Restaura o botão para o ícone de lixeira em caso de erro
            button.disabled = false;
            button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
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
            
            // O `editingBotId` é crucial para que o socket.io saiba qual QR Code exibir
            editingBotId = botId;

            // Atualiza a UI para mostrar que está gerando o QR Code
            elements.qrDisplay.innerHTML = `
                    <div class="qr-loading">
                        <div class="loading-spinner"></div>
                        <h3>Gerando QR Code...</h3>
                        <p>Aguarde enquanto preparamos a conexão com o WhatsApp.</p>
                    </div>
                `;
            
            // Faz a chamada à API para o backend iniciar o processo
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/connect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "O backend falhou em iniciar a conexão.");
            }
            
        } catch (error) {
            console.error('Erro ao iniciar conexão:', error);
            elements.qrDisplay.innerHTML = `
                <div class="qr-error">
                    <h3>❌ Erro ao iniciar conexão</h3>
                    <p>${error.message}</p>
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
        
        wizardFilesToUpload = [];
        isEditMode = false;
        editingBotId = null;
        wizardBotId = null;
        wizardBotData = {};
        currentWizardStep = 1;
        
        document.getElementById('bot-name').value = '';
        document.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
        document.querySelectorAll('textarea').forEach(textarea => {
            textarea.style.display = 'none';
            textarea.value = '';
        });
        
        const faqList = document.getElementById('faq-list');
        const contactsList = document.getElementById('contacts-list');
        const filesList = document.getElementById('files-list');
        
        if (faqList) faqList.innerHTML = '';
        if (contactsList) contactsList.innerHTML = '';
        if (filesList) filesList.innerHTML = '';
        
        resetScheduleToDefault();
        setDefaultSelections();
        
        elements.qrDisplay.innerHTML = `
            <div class="qr-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                <p>QR Code aparecerá aqui</p>
            </div>
        `;
        
        updateUploadButtonState('files-list', 'file-upload');
        
        setWizardStep(1);
        
        setTimeout(() => validateWizardStep(1), 100);
        
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
            // Se o QR Code não for para o bot que estamos conectando, ignora.
            if (data.botId != editingBotId) return;

            console.log("📱 QR Code recebido para o bot:", data.botId);
            
            // Verifica qual view está ativa para saber onde renderizar o QR Code
            const wizardViewIsActive = views.wizard.classList.contains('active');
            const qrModalIsActive = document.getElementById('qr-modal').classList.contains('active');

            let targetDisplayElement;

            if (wizardViewIsActive) {
                targetDisplayElement = elements.qrDisplay; // O display dentro do wizard
            } else if (qrModalIsActive) {
                targetDisplayElement = document.getElementById('qr-modal-content'); // O display dentro do modal
            } else {
                return; // Se nenhuma view de QR estiver ativa, não faz nada.
            }

            // Limpa o conteúdo e renderiza o QR Code
            targetDisplayElement.innerHTML = ""; // Limpa a área
            const qrWrapper = document.createElement('div');
            qrWrapper.className = 'qr-code-wrapper'; // Nova classe para o fundo branco
            targetDisplayElement.appendChild(qrWrapper);

            new QRCode(qrWrapper, { // Gera o QR code dentro do wrapper branco
                text: data.qrString,
                width: 240, // Ligeiramente menor para caber no padding
                height: 240,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H // Nível de correção mais alto, melhora a leitura
            });
        });

        socket.on("request_new_qr", (data) => {
            // Apenas reage se o pedido for para o bot que estamos conectando no momento
            if (data.botId != editingBotId) return;

            console.log(`[Smart Refresh] Recebido pedido do backend para gerar novo QR para o bot ${data.botId}`);

            // A VERIFICAÇÃO CRUCIAL: Onde o usuário está agora?
            const isUserInWizard = views.wizard.classList.contains('active');

            if (isUserInWizard) {
                // CONTEXTO: Usuário está no WIZARD.
                // Ação: Chame a função que atualiza a UI dentro do wizard.
                console.log("--> Atualizando QR Code DENTRO do Wizard.");
                startWhatsAppConnection(data.botId); // Esta função já atualiza o qrDisplay do wizard
            } else {
                // CONTEXTO: Usuário está no PAINEL (e o modal está aberto).
                // Ação: Chame a função que lida com o fluxo do modal.
                console.log("--> Atualizando QR Code DENTRO do Modal.");
                handleConnectionToggle(data.botId, 'offline');
            }
        });                
        
        socket.on("client_ready", async (data) => {
            if (data.botId != editingBotId) return;

            console.log("✅ Cliente WhatsApp conectado!", data.botId);
            
            // ATUALIZA O BOT LOCALMENTE
            const bot = userBots.find(b => b.id == data.botId);
            if(bot) {
                bot.status = 'online';
                bot.connected_phone = data.connected_phone;
            }

            const wizardViewIsActive = views.wizard.classList.contains('active');
            const qrModalIsActive = document.getElementById('qr-modal').classList.contains('active');

            // Mostra a mensagem de sucesso
            const successHTML = `
                <div class="qr-success">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22,4 12,14.01 9,11.01"/>
                    </svg>
                    <h3 style="margin-top: 1.5rem;">Conexão Bem-Sucedida!</h3>
                    <p>Seu assistente foi conectado.</p>
                </div>
            `;

            if (wizardViewIsActive) {
                elements.qrDisplay.innerHTML = successHTML;
                setTimeout(() => {
                    resetWizard();
                    showView('success'); // Mostra a tela de sucesso final do wizard
                }, 2000);

            } else if (qrModalIsActive) {
                showQrModal(successHTML);
                setTimeout(() => {
                    hideQrModal();
                    renderBots(); // Apenas atualiza o dashboard
                }, 2000);
            }
            
            editingBotId = null; // Limpa o ID do bot em conexão
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

        socket.on("connection_failure", (data) => {
            if (data.botId != editingBotId) return; // Mantém a verificação

            console.error("❌ Falha na conexão recebida do backend:", data.message);

            const errorHTML = `
                <div class="qr-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <h3 style="margin-top: 1rem;">Falha na Conexão</h3>
                    <p style="max-width: 90%; margin: 0 auto;">${data.message || 'Não foi possível conectar. Tente novamente.'}</p>
                </div>
            `;
            
            const wizardViewIsActive = views.wizard.classList.contains('active');
            if (wizardViewIsActive) {
                elements.qrDisplay.innerHTML = errorHTML;
            } else {
                showQrModal(errorHTML);
            }
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
        
        elements.startWizardBtn.addEventListener('click', () => { // Removido o 'async' daqui
            // 1. Mostra a nova tela IMEDIATAMENTE.
            resetWizard();
            showView('wizard');

            // 2. Faz a verificação no servidor em segundo plano.
            syncUserWithBackend().catch(error => {
                console.error("Falha na sincronização em segundo plano:", error);
                // 3. Se der erro, avisa o usuário e volta para a tela de login/painel.
                showToast("Ocorreu um erro de conexão. Tente novamente.", "error");
                showView('dashboard'); // Ou 'login', dependendo do erro. Dashboard é mais seguro.
            });
        });
        
        elements.createBotBtn.addEventListener('click', () => { // Removido o 'async' daqui
            // 1. Mostra a nova tela IMEDIATAMENTE.
            resetWizard();
            showView('wizard');

            // 2. Faz a verificação no servidor em segundo plano.
            syncUserWithBackend().catch(error => {
                console.error("Falha na sincronização em segundo plano:", error);
                // 3. Se der erro, avisa o usuário e volta para o painel.
                showToast("Ocorreu um erro de conexão. Tente novamente.", "error");
                showView('dashboard'); 
            });
        });

        
        elements.closeWizard.addEventListener('click', () => {
            console.log('Wizard fechado pelo botão "X".');

            // Se um bot foi criado ou está em processo de conexão (identificado por wizardBotId ou editingBotId),
            // é preciso cancelar a tentativa de conexão.
            const botIdToCancel = wizardBotId || editingBotId;
            if (botIdToCancel) {
                console.log(`[Frontend] Cancelando conexão pendente para o bot ${botIdToCancel}.`);
                handleConnectionToggle(botIdToCancel, 'connecting');
            }

            // Reseta o estado do wizard.
            resetWizard();
            // Mostra o dashboard.
            showView('dashboard');
            // ATUALIZA o dashboard para garantir que o novo bot (se criado) apareça.
            fetchBots(); 
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
                <input type="text" placeholder="Pergunta" value="${question}" maxlength="150">
                <input type="text" placeholder="Resposta" value="${answer}" maxlength="500">
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        faqList.appendChild(item);
    }

    function addContactItem(sector = '', contact = '') {
        const contactsList = document.getElementById('contacts-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        // ESTRUTURA HORIZONTAL E COM LIMITES DE CARACTERES
        item.innerHTML = `
            <input type="text" placeholder="Para quem encaminhar?" value="${sector}" maxlength="50" style="flex-basis: 200px; flex-shrink: 0;">
            <input type="text" placeholder="Telefone, e-mail ou link de contato" value="${contact}" maxlength="150" style="flex-grow: 1;">
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        contactsList.appendChild(item);
    }
    function handleFileUpload(event) {
        const files = event.target.files;
        if (!files.length) return;

        // Identifica qual lista e botão estamos usando (wizard ou edição)
        const listId = isEditMode ? 'edit-files-list' : 'files-list';
        const buttonId = isEditMode ? 'edit-upload-btn' : 'file-upload';
        
        // Verifica o limite ANTES de processar
        const filesList = document.getElementById(listId);
        if (filesList.children.length >= 3) {
            alert("Você pode enviar no máximo 3 arquivos.");
            return;
        }

        Array.from(files).forEach(async (file) => {
            if (filesList.children.length + 1 > 3) {
                alert("Limite de 3 arquivos atingido. Alguns arquivos não foram adicionados.");
                updateUploadButtonState(listId, buttonId);
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                alert(`O arquivo "${file.name}" é muito grande. O limite é de 10MB.`);
                return;
            }
            
            const fileItem = addFileToList(file, 'processing', listId);
            
            try {
                const base64Content = await toBase64(file);
                
                if (isEditMode) {
                    // Modo Edição: Faz upload imediatamente
                    await uploadFileToBot(editingBotId, file, base64Content, fileItem);
                } else {
                    // Modo Wizard: Armazena para upload futuro
                    wizardFilesToUpload.push({ file, base64Content });
                    updateFileItemStatus(fileItem, 'ready');
                }
            } catch (error) {
                console.error('Erro ao processar arquivo:', error);
                updateFileItemStatus(fileItem, 'error', 'Falha no processamento');
            }
        });

        // Atualiza o estado do botão de upload
        setTimeout(() => updateUploadButtonState(listId, buttonId), 100);
        event.target.value = ''; // Limpa o input
    }

    function addFileToList(file, status = 'ready', listId) {
        const filesList = document.getElementById(listId);
        if (!filesList) return;

        const item = document.createElement('div');
        item.className = `file-item file-${status}`;
        item.dataset.status = status;

        const fileName = file.name || file.file_name;
        const isSaved = status === 'saved';

        // Define o ícone da lixeira uma vez para reutilizar
        const trashIconSVG = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"/>
                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
        `;

        let removeButtonHTML = '';
        // Adiciona o atributo 'title' para melhor experiência do usuário
        const title = 'title="Deletar permanentemente"';

        if (isSaved) {
            item.dataset.fileId = file.id;
            removeButtonHTML = `<button type="button" class="remove-btn" ${title} onclick="handleDeleteFile(this, ${editingBotId}, ${file.id})">${trashIconSVG}</button>`;
        } else if (isEditMode) {
            removeButtonHTML = `<button type="button" class="remove-btn" ${title} onclick="this.parentElement.remove(); updateUploadButtonState('edit-files-list', 'edit-upload-btn');">${trashIconSVG}</button>`;
        } else {
            removeButtonHTML = `<button type="button" class="remove-btn" ${title} onclick="removeWizardFile(this)">${trashIconSVG}</button>`;
        }

        item.innerHTML = `
            <div class="file-info">
                <span class="file-icon">📄</span>
                <span class="file-name">${fileName}</span>
                <span class="file-status">${getStatusText(status)}</span>
            </div>
            ${removeButtonHTML}
        `;
        
        filesList.appendChild(item);
        const buttonId = listId === 'edit-files-list' ? 'edit-upload-btn' : 'file-upload';
        updateUploadButtonState(listId, buttonId);

        return item;
    }

    function updateFileItemStatus(fileItem, status, statusText = '') {
        fileItem.dataset.status = status;
        const statusEl = fileItem.querySelector('.file-status');
        if (statusEl) {
            statusEl.textContent = statusText || getStatusText(status);
        }
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

    function updateEditSaveButtonState() {
        // Seleciona o botão de salvar do formulário de edição
        const saveButton = document.querySelector('#edit-bot-form button[type="submit"]');
        // Seleciona a lista de arquivos da tela de edição
        const filesList = document.getElementById('edit-files-list');

        // Se os elementos não existirem na tela, não faz nada
        if (!saveButton || !filesList) return;

        // Procura por QUALQUER item na lista que tenha o status 'uploading'
        const isUploading = filesList.querySelector('.file-item[data-status="uploading"]');

        if (isUploading) {
            // Se encontrou um arquivo sendo enviado, desabilita o botão
            saveButton.disabled = true;
            saveButton.innerHTML = '<span class="spinner"></span> Aguarde o upload...';
        } else {
            // Se não encontrou nenhum, habilita o botão
            saveButton.disabled = false;
            saveButton.textContent = 'Salvar Alterações';
        }
    }    

    async function uploadFileToBot(botId, file, base64Content, fileItem = null) {
        // Adiciona o bloco try...finally para garantir que o estado do botão seja sempre atualizado
        try {
            if (fileItem) {
                updateFileItemStatus(fileItem, 'uploading', 'Enviando...');
                // ATUALIZAÇÃO 1: Chama a fiscalização logo após iniciar o upload
                if (isEditMode) {
                    updateEditSaveButtonState();
                }
            }
            
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    fileContent: base64Content,
                    fileType: file.type,
                    fileName: file.name
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Falha no upload do arquivo');
            }

            if (fileItem) {
                updateFileItemStatus(fileItem, 'saved');
                fileItem.dataset.fileId = result.id;
                const removeBtn = fileItem.querySelector('.remove-btn');
                removeBtn.setAttribute('onclick', `handleDeleteFile(this, ${botId}, ${result.id})`);
            }
            
        } catch (error) {
            console.error('Erro no upload:', error);
            if (fileItem) {
                updateFileItemStatus(fileItem, 'error', error.message);
            } else {
                alert(`Erro ao processar o arquivo "${file.name}": ${error.message}`);
            }
        } finally {
            // ATUALIZAÇÃO 2: A fiscalização é chamada no final, garantindo que o botão
            // seja reabilitado após o sucesso ou a falha do upload.
            if (isEditMode) {
                updateEditSaveButtonState();
            }
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
        setupEditOptionCards();

        // Lógica para o novo toggle de Soneca Inteligente
        const snoozeEnabledCheckbox = document.getElementById('edit-smart-snooze-enabled');
        const snoozeDetails = document.getElementById('edit-smart-snooze-details');
        if (snoozeEnabledCheckbox && snoozeDetails) {
            snoozeEnabledCheckbox.addEventListener('change', () => {
                snoozeDetails.style.display = snoozeEnabledCheckbox.checked ? 'block' : 'none';
            });
        }        

        const leadEnabledCheckbox = document.getElementById('edit-lead-collection-enabled');
        const leadDetails = document.getElementById('edit-lead-collection-details');
        if (leadEnabledCheckbox && leadDetails) {
            leadEnabledCheckbox.addEventListener('change', () => {
                leadDetails.style.display = leadEnabledCheckbox.checked ? 'block' : 'none';
            });
        }   
        
        // Lógica para o botão de download de leads
        const downloadBtn = document.getElementById('download-leads-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                // 'editingBotId' é a nossa variável global que guarda o ID do bot em edição
                if(editingBotId) {
                    handleDownloadLeads(editingBotId);
                }
            });
        }
    }

    async function handleDownloadLeads(botId) {
        const button = document.getElementById('download-leads-btn');
        if (!button) return;

        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Baixando...';

        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/leads`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Não foi possível baixar os leads.");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Pega o nome do arquivo do header da resposta
            const contentDisposition = response.headers.get('content-disposition');
            let fileName = `leads_bot_${botId}.csv`;
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch.length === 2) fileName = fileNameMatch[1];
            }
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showToast("Lista de leads baixada com sucesso!", "success");

        } catch (error) {
            console.error("Erro ao baixar leads:", error);
            showToast(error.message, "error");
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }    

    function setupEditEventListeners() {
        const closeEditBtn = document.getElementById('close-edit');
        const cancelEditBtn = document.getElementById('cancel-edit');
        const editForm = document.getElementById('edit-bot-form');

        if (closeEditBtn) {
            closeEditBtn.addEventListener('click', () => {
                isEditMode = false; // <-- CORREÇÃO: Reseta o modo de edição
                editingBotId = null;
                showView('dashboard');
            });
        }

        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                isEditMode = false;
                editingBotId = null;
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
            addFaqBtn.addEventListener('click', () => addEditFaqItem());
        }

        // Contacts
        const addContactBtn = document.getElementById('edit-add-contact');
        if (addContactBtn) {
            addContactBtn.addEventListener('click', () => addEditContactItem());
        }

        // File upload
        const uploadBtn = document.getElementById('edit-upload-btn');
        const fileInput = document.getElementById('edit-file-upload');
        
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            
            // CORREÇÃO: Aponta para a função unificada 'handleFileUpload'
            fileInput.addEventListener('change', handleFileUpload); 
        }
    }

    function setupEditOptionCards() {
        // Delegação de evento para os cards de opção na tela de edição
        const editContent = document.getElementById('edit-content');
        if (!editContent) return;

        editContent.addEventListener('click', (e) => {
            if (!e.target.closest('.option-card')) return;

            const card = e.target.closest('.option-card');
            const container = card.closest('.form-group');
            if (!container) return;

            // Desseleciona outros cards no mesmo grupo
            container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
            // Seleciona o card clicado
            card.classList.add('selected');

            // Lógica para mostrar/esconder o textarea "Personalizado"
            const customTextarea = container.querySelector('textarea');
            if (customTextarea) {
                if (card.dataset.value === 'Personalizado') {
                    customTextarea.style.display = 'block';
                    customTextarea.focus();
                } else {
                    customTextarea.style.display = 'none';
                }
            }
        });
    }    

    // ADICIONE ESTA NOVA FUNÇÃO junto com as outras funções do Wizard
    window.removeWizardFile = function(button) {
        const fileItem = button.closest('.file-item');
        const fileName = fileItem.querySelector('.file-name').textContent;
        
        // Remove o arquivo da nossa lista de staging
        wizardFilesToUpload = wizardFilesToUpload.filter(f => f.file.name !== fileName);
        
        // Remove o item da tela
        fileItem.remove();
        
        // ATUALIZA O ESTADO DO BOTÃO DE UPLOAD
        updateUploadButtonState('files-list', 'file-upload');
    }    
    
    function populateEditFormWithBotData(bot) {
        // --- Dados básicos ---
        document.getElementById('edit-bot-id').value = bot.id;
        document.getElementById('edit-bot-name').value = bot.name || '';
        
        // --- Função Principal ---
        const functionOptionsContainer = document.getElementById('edit-function-options');
        const functionCustomTextarea = document.getElementById('edit-bot-function-custom');
        
        // Limpa seleções anteriores
        functionOptionsContainer.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        
        // Encontra o card correspondente ao valor do bot, ou o card "Personalizado"
        let functionCard = functionOptionsContainer.querySelector(`.option-card[data-value="${bot.function_type}"]`);
        if (functionCard) {
            functionCard.classList.add('selected');
            functionCustomTextarea.style.display = 'none';
        } else {
            // Se não encontrou, assume que é um valor personalizado
            functionCard = functionOptionsContainer.querySelector('.option-card[data-value="Personalizado"]');
            if (functionCard) {
                functionCard.classList.add('selected');
                functionCustomTextarea.style.display = 'block';
                functionCustomTextarea.value = bot.function_type || '';
            }
        }
        
        // --- Tom de Atendimento ---
        const toneOptionsContainer = document.getElementById('edit-tone-options');
        const toneCustomTextarea = document.getElementById('edit-bot-tone-custom');

        toneOptionsContainer.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        
        let toneCard = toneOptionsContainer.querySelector(`.option-card[data-value="${bot.tone_type}"]`);
        if (toneCard) {
            toneCard.classList.add('selected');
            toneCustomTextarea.style.display = bot.tone_type === 'Personalizado' ? 'block' : 'none';
            toneCustomTextarea.value = bot.tone_custom_description || '';
        }

        // --- Horário ---
        const scheduleEnabledCheckbox = document.getElementById('edit-schedule-enabled');
        const scheduleDetails = document.getElementById('edit-schedule-details');
        
        scheduleEnabledCheckbox.checked = bot.schedule_enabled || false;
        scheduleDetails.style.display = bot.schedule_enabled ? 'block' : 'none';

        let scheduleData = [];
        if (bot.schedule_data) {
            try {
                scheduleData = Array.isArray(bot.schedule_data) ? bot.schedule_data : JSON.parse(bot.schedule_data);
            } catch (e) { console.error('Erro ao fazer parse do schedule_data:', e); }
        }

        if (scheduleData.length > 0) {
            const dayMap = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            scheduleData.forEach((dayData, index) => {
                const dayName = dayMap[index];
                const dayElement = scheduleDetails.querySelector(`.schedule-day[data-day="${dayName}"]`);
                if(!dayElement) return;

                const toggle = dayElement.querySelector('input[type="checkbox"]');
                const openTimeInput = dayElement.querySelector('input[type="time"]:first-of-type');
                const closeTimeInput = dayElement.querySelector('input[type="time"]:last-of-type');
                
                if (toggle) toggle.checked = dayData.active;
                if (openTimeInput) openTimeInput.value = dayData.open;
                if (closeTimeInput) closeTimeInput.value = dayData.close;
                
                updateDayScheduleState(dayElement);
            });
        }

        // Preenche os dados da Soneca Inteligente
        const snoozeEnabledCheckbox = document.getElementById('edit-smart-snooze-enabled');
        const snoozeMinutesInput = document.getElementById('edit-smart-snooze-minutes');
        const snoozeDetails = document.getElementById('edit-smart-snooze-details');

        if (snoozeEnabledCheckbox && snoozeMinutesInput && snoozeDetails) {
            snoozeEnabledCheckbox.checked = bot.smart_snooze_enabled || false;
            snoozeMinutesInput.value = bot.smart_snooze_minutes || 30;
            snoozeDetails.style.display = snoozeEnabledCheckbox.checked ? 'block' : 'none';
        }        

        // Preenche os dados da Captura de Leads
        const leadEnabledCheckbox = document.getElementById('edit-lead-collection-enabled');
        const leadPromptTextarea = document.getElementById('edit-lead-collection-prompt');
        const leadDetails = document.getElementById('edit-lead-collection-details');

        if (leadEnabledCheckbox && leadPromptTextarea && leadDetails) {
            leadEnabledCheckbox.checked = bot.lead_collection_enabled || false;
            leadPromptTextarea.value = bot.lead_collection_prompt || 'Olá! Para podermos iniciar, poderia me dizer como você nos encontrou? (Ex: Instagram, Google, Indicação)';
            leadDetails.style.display = leadEnabledCheckbox.checked ? 'block' : 'none';
        }        

        // --- Base de Conhecimento ---
        populateEditFAQ(bot.knowledge_faq || []);
        populateEditContacts(bot.knowledge_contacts || []);
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

    function populateEditFiles(files = []) {
        const filesList = document.getElementById('edit-files-list');
        filesList.innerHTML = ''; // Limpa a lista antes de popular

        if (files && files.length > 0) {
            files.forEach(file => {
                addFileToList(file, 'saved', 'edit-files-list');
            });
        }

        // Atualiza o estado do botão de upload
        updateUploadButtonState('edit-files-list', 'edit-upload-btn');
    }

    function addEditFaqItem(question = '', answer = '') {
        const faqList = document.getElementById('edit-faq-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        item.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Pergunta" value="${question}" maxlength="150">
                <input type="text" placeholder="Resposta" value="${answer}" maxlength="500">
            </div>
            <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        faqList.appendChild(item);
    }

    function addEditContactItem(sector = '', contact = '') {
        const contactsList = document.getElementById('edit-contacts-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        // ESTRUTURA HORIZONTAL E COM LIMITES DE CARACTERES
        item.innerHTML = `
            <input type="text" placeholder="Para quem encaminhar?" value="${sector}" maxlength="50" style="flex-basis: 200px; flex-shrink: 0;">
            <input type="text" placeholder="Telefone, e-mail ou link de contato" value="${contact}" maxlength="150" style="flex-grow: 1;">
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

    function updateHeaderPlanInfo(user) {
        const planInfoEl = document.querySelector('.plan-info');
        if (!planInfoEl) return;

        let text = '';
        planInfoEl.classList.remove('trial-ending', 'trial-expired');

        if (user.plan === 'trial') {
            const now = new Date();
            const trialEndDate = new Date(user.trial_ends_at);
            const diffTime = trialEndDate - now;

            if (diffTime <= 0) {
                text = 'Seu teste gratuito expirou!';
                planInfoEl.classList.add('trial-expired');
            } else {
                let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                // --- AQUI ESTÁ A CORREÇÃO ---
                // Se o cálculo resultar em mais de 3 dias, nós o limitamos a 3 para exibição.
                if (diffDays > 3) {
                    diffDays = 3;
                }
                
                text = `Plano Trial (restam ${diffDays} dia${diffDays > 1 ? 's' : ''})`;
                if (diffDays <= 2) {
                    planInfoEl.classList.add('trial-ending');
                }
            }
        } else {
            // Lógica para planos pagos (ex: 'Básico', 'Premium')
            text = `Plano atual: ${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}`;
        }
        
        planInfoEl.textContent = text;
    }

    async function handleEditFormSubmit(event) {
        event.preventDefault();
        
        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner"></span> Salvando...';
        
        try {
            const token = await getAuthToken();
            const botId = document.getElementById('edit-bot-id').value;
            
            // --- Coleta dados dos componentes ---
            let functionValue = document.querySelector('#edit-function-options .option-card.selected')?.dataset.value || 'Suporte ao Cliente';
            if (functionValue === 'Personalizado') {
                functionValue = document.getElementById('edit-bot-function-custom').value.trim();
            }
            
            let toneValue = document.querySelector('#edit-tone-options .option-card.selected')?.dataset.value || 'Amigável';
            let toneCustom = '';
            if (toneValue === 'Personalizado') {
                toneCustom = document.getElementById('edit-bot-tone-custom').value.trim();
            }

            const scheduleEnabled = document.getElementById('edit-schedule-enabled').checked;
            const scheduleData = [];
            const dayNames = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
            
            document.querySelectorAll('#edit-schedule-details .schedule-day').forEach((dayElement, index) => {
                const toggle = dayElement.querySelector('input[type="checkbox"]');
                const openTime = dayElement.querySelector('input[type="time"]:first-of-type');
                const closeTime = dayElement.querySelector('input[type="time"]:last-of-type');
                
                scheduleData.push({
                    day: dayNames[index],
                    active: toggle ? toggle.checked : false,
                    open: openTime ? openTime.value : '09:00',
                    close: closeTime ? closeTime.value : '18:00'
                });
            });

            const faqItems = collectFaqDataFromEdit();
            const contactItems = collectContactsDataFromEdit();

            const smartSnoozeEnabled = document.getElementById('edit-smart-snooze-enabled').checked;
            const smartSnoozeMinutes = document.getElementById('edit-smart-snooze-minutes').value || 30;
            // Coleta os novos dados da Captura de Leads
            const leadCollectionEnabled = document.getElementById('edit-lead-collection-enabled').checked;
            const leadCollectionPrompt = document.getElementById('edit-lead-collection-prompt').value.trim();
            

            const botData = {
                name: document.getElementById('edit-bot-name').value,
                function_type: functionValue,
                tone_type: toneValue,
                tone_custom_description: toneCustom,
                schedule_enabled: scheduleEnabled,
                schedule_data: JSON.stringify(scheduleData),
                knowledge_faq: JSON.stringify(faqItems),
                knowledge_contacts: JSON.stringify(contactItems),
                // Agora as variáveis existem e podem ser usadas aqui
                smart_snooze_enabled: smartSnoozeEnabled,
                smart_snooze_minutes: parseInt(smartSnoozeMinutes, 10),
                lead_collection_enabled: leadCollectionEnabled,
                lead_collection_prompt: leadCollectionPrompt                
            };
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
            isEditMode = false;
            editingBotId = null;
        }
    }
    
    function collectFaqDataFromEdit() {
        const faqItems = [];
        document.querySelectorAll('#edit-faq-list .knowledge-item').forEach(item => {
            const inputs = item.querySelectorAll('input');
            if (inputs[0]?.value.trim() && inputs[1]?.value.trim()) {
                faqItems.push({ question: inputs[0].value.trim(), answer: inputs[1].value.trim() });
            }
        });
        return faqItems;
    }

    function collectContactsDataFromEdit() {
        const contactItems = [];
        document.querySelectorAll('#edit-contacts-list .knowledge-item').forEach(item => {
            const inputs = item.querySelectorAll('input');
            if (inputs[0]?.value.trim() && inputs[1]?.value.trim()) {
                contactItems.push({ sector: inputs[0].value.trim(), contact: inputs[1].value.trim() });
            }
        });
        return contactItems;
    }    

    function setupThemeToggle() {
        const themeToggleButton = document.getElementById('theme-toggle');
        const sunIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        const moonIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

        // Função para aplicar o tema no elemento <html>
        const applyTheme = (theme) => {
            const htmlElement = document.documentElement; // Usamos o elemento <html>

            if (theme === 'light') {
                htmlElement.classList.add('light-theme');
                themeToggleButton.innerHTML = moonIcon; // Se está claro, mostra o ícone para ir para o escuro
                themeToggleButton.title = "Ativar modo escuro";
            } else {
                htmlElement.classList.remove('light-theme');
                themeToggleButton.innerHTML = sunIcon; // Se está escuro, mostra o ícone para ir para o claro
                themeToggleButton.title = "Ativar modo claro";
            }
        };

        // Padrão agora é 'dark' se nada estiver salvo, como era originalmente
        const savedTheme = localStorage.getItem('theme') || 'dark'; 
        applyTheme(savedTheme);

        // Evento de clique para alternar
        themeToggleButton.addEventListener('click', () => {
            const isLight = document.documentElement.classList.contains('light-theme');
            const newTheme = isLight ? 'dark' : 'light';
            
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }

    function initializeApp() {
        console.log('🚀 Inicializando FacilChat...');
        console.log('🔧 Versão: Anti-Race-Condition v3.0');
        
        // Mostra a tela de loading. Ela FICARÁ visível até o Firebase responder.
        appLoading.classList.remove('hidden');
        console.log('⏳ Aguardando estado de autenticação...');
        
        // Garante que nenhuma view está ativa inicialmente
        Object.values(views).forEach(view => view.classList.remove('active'));
        
        // Esconde o header inicialmente
        elements.header.style.display = 'none';
        
        setupEventListeners();
        initializeWizard();
        initializeEditView();
        setupThemeToggle();
        setupPricingToggle();
        setupNavigation();
        setupPlanButtons();
        
        // O Firebase Auth State agora é a ÚNICA fonte de verdade para o que é exibido.
        auth.onAuthStateChanged((user) => {
            console.log('🔐 Estado de autenticação DEFINIDO:', user ? `Logado: ${user.email}` : 'Não logado');
            handleAuthStateChange(user);
        });
        
        console.log('✅ Inicialização configurada. App aguardando autenticação...');      
    }

    // COLE ESTA NOVA FUNÇÃO INTEIRA NO SEU app.js

    function setupNavigation() {
        const navContainer = document.querySelector('.header-nav');
        if (!navContainer) return;

        // Usamos delegação de evento, que é mais eficiente.
        navContainer.addEventListener('click', (e) => {
            // Impede a ação padrão do link
            e.preventDefault();
            
            // Verifica se o clique foi realmente em um link (<a>)
            const targetLink = e.target.closest('a.nav-link');
            if (!targetLink) return;

            // Pega o texto do link para decidir qual view mostrar
            const linkText = targetLink.textContent.trim();
            let viewToShow = 'dashboard'; // Padrão

            if (linkText === 'Planos') {
                viewToShow = 'plans';
            } else if (linkText === 'Painel') {
                viewToShow = 'dashboard';
            }
            // Você pode adicionar mais 'else if' aqui no futuro para outras páginas

            // Remove a classe 'active' de todos os links e a adiciona apenas no clicado
            navContainer.querySelectorAll('a.nav-link').forEach(link => link.classList.remove('active'));
            targetLink.classList.add('active');

            // Mostra a view correspondente
            showView(viewToShow);
        });
    }    

    function setupPricingToggle() {
        const toggleContainer = document.querySelector('.plan-toggle');
        if (!toggleContainer) return;

        const monthlyBtn = toggleContainer.querySelector('[data-period="monthly"]');
        const annualBtn = toggleContainer.querySelector('[data-period="annual"]');
        const glider = toggleContainer.querySelector('.glider');

        toggleContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.toggle-btn');
            if (!clickedButton) return;

            const isAnnual = clickedButton.dataset.period === 'annual';

            // Atualiza a aparência do toggle
            monthlyBtn.classList.toggle('active', !isAnnual);
            annualBtn.classList.toggle('active', isAnnual);
            glider.style.transform = isAnnual ? 'translateX(100%)' : 'translateX(0)';
            
            // Atualiza os cards de preço
            updatePricingCards(isAnnual);
        });        
    }

    function setupPlanButtons() {
        const pricingGrid = document.querySelector('.pricing-grid');
        if (!pricingGrid) return;

        pricingGrid.addEventListener('click', async (e) => {
            const button = e.target.closest('.plan-cta[data-plan]');
            if (!button) return;

            button.disabled = true;
            button.innerHTML = '<span class="spinner"></span> Gerando...';

            try {
                const plan = button.dataset.plan;
                const periodToggle = document.querySelector('.plan-toggle .toggle-btn.active');
                const period = periodToggle.dataset.period; // 'monthly' ou 'annual'

                const token = await getAuthToken();
                const response = await fetch(`${API_BASE_URL}/api/payments/generate-link`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ plan, period })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Falha ao gerar o link.');
                }

                // Redireciona o usuário para a página de pagamento do Asaas
                window.location.href = data.paymentLink;

            } catch (error) {
                console.error("Erro ao gerar link:", error);
                showToast(error.message, 'error');
                button.disabled = false;
                button.textContent = 'Escolher Plano';
            }
        });
    }
    

    function updatePricingCards(isAnnual) {
        const pricingGrid = document.querySelector('.pricing-grid');
        if (!pricingGrid) return;
        
        pricingGrid.querySelectorAll('.plan-card').forEach(card => {
            const priceEl = card.querySelector('.price-amount');
            const annualDetailsEl = card.querySelector('.annual-price-details');
            const discountTagEl = card.querySelector('.discount-tag');
            const ctaButton = card.querySelector('.plan-cta');

            // Se o elemento não existir no card (ex: card Empresarial), pula
            if (!priceEl || !priceEl.dataset.monthly) return;

            if (isAnnual) {
                priceEl.textContent = priceEl.dataset.annual;
                if (annualDetailsEl) annualDetailsEl.style.display = 'block';
                if (discountTagEl) discountTagEl.style.display = 'block';
                // Aqui você mudaria o link de checkout para o anual
                // Ex: ctaButton.href = "LINK_CHECKOUT_ANUAL";
            } else {
                priceEl.textContent = priceEl.dataset.monthly;
                if (annualDetailsEl) annualDetailsEl.style.display = 'none';
                if (discountTagEl) discountTagEl.style.display = 'none';
                // Aqui você mudaria o link de checkout para o mensal
                // Ex: ctaButton.href = "LINK_CHECKOUT_MENSAL";
            }
        });
    }    
    
    // === NOVAS FUNCIONALIDADES VISUAIS ===
    
    // Toast Notifications
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 4000);
    }
    
    // Skeleton Loader
    function showSkeletonLoader(containerId, count = 3) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        for (let i = 0; i < count; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-loader';
            skeleton.innerHTML = `
                <div class="skeleton-card">
                    <div class="skeleton-header"></div>
                    <div class="skeleton-content"></div>
                    <div class="skeleton-footer"></div>
                </div>
            `;
            container.appendChild(skeleton);
        }
    }
    
    // Improved Loading States
    function setLoadingState(element, isLoading) {
        if (isLoading) {
            element.classList.add('loading');
            element.style.pointerEvents = 'none';
        } else {
            element.classList.remove('loading');
            element.style.pointerEvents = 'auto';
        }
    }
    
    // Enhanced Animation Utilities
    function animateElement(element, animationName, duration = '0.6s') {
        element.style.animation = `${animationName} ${duration} ease-out`;
        element.addEventListener('animationend', () => {
            element.style.animation = '';
        }, { once: true });
    }
    
    // Staggered Animation for Lists
    function animateList(containerSelector, itemSelector, delay = 100) {
        const container = document.querySelector(containerSelector);
        if (!container) return;
        
        const items = container.querySelectorAll(itemSelector);
        items.forEach((item, index) => {
            item.style.animationDelay = `${index * delay}ms`;
        });
    }
    
    // Removed enhanced fetchBots to fix loading issues
    
    // Enhanced success messages
    const originalCreateBot = createBot;
    createBot = async function() {
        try {
            const result = await originalCreateBot();
            showToast('Bot criado com sucesso!', 'success');
            return result;
        } catch (error) {
            showToast('Erro ao criar bot', 'error');
            throw error;
        }
    };
    
    // Make functions globally available
    window.showToast = showToast;
    window.showSkeletonLoader = showSkeletonLoader;
    window.setLoadingState = setLoadingState;
    window.animateElement = animateElement;
    
    initializeApp();
});