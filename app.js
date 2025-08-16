// FacilChat - Frontend JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // =========== CONFIGURAÇÃO WHITELABEL / REVENDEDORES ==============
    // =================================================================
    
    // Este é o nosso "mapa" de revendedores. 
    // Para adicionar um novo, basta adicionar uma nova linha com o domínio e o link de contato.
    const resellerMap = {
        '360agencia.adnest.com.br': {
            contactLink: 'https://wa.me/5511999899032?text=Olá!%20Gostaria%20de%20saber%20mais%20sobre%20os%20planos%20do%20assistente%20virtual.'
        },
        'dix.adnest.com.br': {
            contactLink: 'https://wa.me/5511983477906?text=Olá!%20Gostaria%20de%20saber%20mais%20sobre%20os%20planos%20do%20assistente%20virtual'
        },
        // Exemplo de como adicionar um terceiro revendedor no futuro:
        // 'nome-do-cliente.adnest.com.br': {
        //     contactLink: 'SEU_LINK_DE_WHATSAPP_AQUI'
        // },
    };
    // =================== FIM DA CONFIGURAÇÃO =========================    

// Detecta o domínio atual e verifica se está no nosso mapa de revendedores.
    const currentHostname = window.location.hostname;
    const whitelabelConfig = resellerMap[currentHostname];
    const isWhitelabelMode = !!whitelabelConfig; // Isso será 'true' se for um revendedor, e 'false' caso contrário.

    console.log(`[Whitelabel Check] Host: ${currentHostname} | Modo Whitelabel: ${isWhitelabelMode}`);    
    
    // Função que aplica todas as mudanças visuais do modo Whitelabel
    function applyWhitelabelMode() {
        if (!isWhitelabelMode) return; // Se não for whitelabel, não faz nada.

        // 1. Esconder a guia "Planos" do menu principal
        const plansLink = document.querySelector('.header-nav a.nav-link:nth-child(2)');
        if (plansLink && plansLink.textContent.trim() === 'Planos') {
            plansLink.style.display = 'none';
        }

        // 2. Esconder a view de Planos (caso o usuário tente acessar de alguma forma)
        if (views.plans) {
            views.plans.style.display = 'none';
        }

        // 3. Trocar o card de promoção do "Plano Elite" pelo card de "Contato"
        // Esta função será chamada depois que o usuário logar.
        const allPromoCards = document.querySelectorAll('.sidebar-content .promo-card');
        allPromoCards.forEach(card => {
            const cardTitle = card.querySelector('h3');
            if (cardTitle && cardTitle.textContent.includes('Plano Elite')) {
                card.innerHTML = `
                    <h3>Fale Conosco</h3>
                    <p>Quer saber mais sobre os planos ou precisa de ajuda? Entre em contato com nosso suporte.</p>
                    <a href="${whitelabelConfig.contactLink}" target="_blank" class="btn-link">Chamar no WhatsApp</a>
                `;
            }
        });
    }

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
    let userAgendas = [];
    let currentAgenda = null;     // Guarda o objeto completo da agenda ativa
    let selectedDate = new Date();  // Guarda a data que o usuário selecionou    
    let wizardBotData = {};
    let currentWizardStep = 1;
    let isEditMode = false;
    let editingBotId = null;
    let wizardBotId = null;
    let isActivelyConnecting = false;
    let wizardFilesToUpload = [];
    let isWizardInitialized = false;
    let isEditViewInitialized = false;
    let currentDayAppointments = [];
    let qrTimerInterval = null; // Timer para o QR Code

    
    // === ELEMENTOS ===
    const views = {
        login: document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        wizard: document.getElementById('wizard-view'),
        success: document.getElementById('success-view'),
        edit: document.getElementById('edit-view'),
        plans: document.getElementById('plans-view'),
        agendas: document.getElementById('agendas-view'),
        calendar: document.getElementById('calendar-view')
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
        if (qrTimerInterval) clearInterval(qrTimerInterval);
        if (editingBotId) {
            console.log(`[Frontend] Cancelando conexão para o bot ${editingBotId}`);
            // A função handleConnectionToggle já faz a chamada de disconnect correta
            handleConnectionToggle(editingBotId, 'connecting');
        }
        isActivelyConnecting = false;
        hideQrModal();
        editingBotId = null; // Limpa o ID do bot em conexão
    }    
    // === GERENCIAMENTO DE VIEWS ===
    let lastViewChange = null;
    
    // EM: app.js

    function showView(viewName) {
        const timestamp = new Date().toISOString();
        console.log(`🔄 [${timestamp}] MUDANÇA DE VIEW: ${lastViewChange || 'nenhuma'} → ${viewName}`);
        
        if (viewName === 'login' && auth.currentUser) {
            console.log('🚫 BLOQUEADO: Tentativa de mostrar login com usuário autenticado!');
            return;
        }
        
        // Esconde todas as views
        Object.values(views).forEach(view => view.classList.remove('active'));
        
        if (views[viewName]) {
            // Mostra a view correta
            views[viewName].classList.add('active');
            lastViewChange = viewName;
            
            // Controla o header
            elements.header.style.display = (viewName === 'login') ? 'none' : 'block';

            // --- LÓGICA DE INICIALIZAÇÃO SOB DEMANDA ---
            // Inicializa os scripts da view específica APENAS quando ela for exibida pela primeira vez.
            switch (viewName) {
                case 'wizard':
                    initializeWizardView();
                    break;
                case 'edit':
                    initializeEditView();
                    break;
            }
            // --- FIM DA LÓGICA DE INICIALIZAÇÃO ---

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
                await fetchAgendas();
                initializeSocket();
                
                // ETAPA 3: TRANSIÇÃO VISUAL FINAL (Após tudo carregar)
                elements.header.style.display = 'block'; // AGORA sim, mostra o header
                showView('dashboard');                   // MOSTRA o dashboard
                applyWhitelabelMode();                   // <-- ADICIONE ESTA LINHA AQUI

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
                // Seletores atualizados para o novo layout simples
                const conversationsEl = card.querySelector('.stat-item:nth-child(1) .stat-number');
                const responsesEl = card.querySelector('.stat-item:nth-child(2) .stat-number');
                const leadsEl = card.querySelector('.stat-item:nth-child(3) .stat-number');

                // Popula os elementos com os dados corretos
                if (conversationsEl) conversationsEl.textContent = stats.conversations;
                // "Respostas" agora pega o valor de "messagesSent"
                if (responsesEl) responsesEl.textContent = stats.messagesSent; 
                if (leadsEl) leadsEl.textContent = stats.leadsCollected;
            }
        } catch (error) {
            console.error(`Falha ao buscar stats para o bot ${botId}:`, error);
        }
    }

    async function fetchMonthAvailability(year, month) {
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/agendas/${currentAgenda.id}/month-availability?year=${year}&month=${month}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return {};
            return await response.json();
        } catch (error) {
            console.error("Falha ao buscar status do mês:", error);
            return {}; // Retorna um objeto vazio em caso de erro para não quebrar a interface
        }
    }    

    function renderDashboard() {
        // PASSO 1: SEMPRE limpa a lista de bots para evitar "fantasmas".
        elements.botsList.innerHTML = '';

        // --- AQUI ESTÁ A NOVA LÓGICA ---
        // Seleciona o botão de criar novo bot
        const createBotButton = document.getElementById('create-bot-btn');

        // Verifica se a quantidade de bots atingiu o limite de 3
        if (userBots.length >= 3) {
            // Se sim, esconde o botão
            if (createBotButton) {
                createBotButton.style.display = 'none';
            }
        } else {
            // Se não, garante que o botão esteja visível
            if (createBotButton) {
                createBotButton.style.display = 'block'; // Ou 'flex', dependendo do seu CSS
            }
        }
        // --- FIM DA NOVA LÓGICA ---

        // PASSO 2: Decide qual container principal mostrar.
        if (userBots.length === 0) {
            // Se NÃO há bots: mostra o container de boas-vindas e esconde o de bots.
            elements.welcomeState.style.display = 'contents'; 
            elements.botsState.style.display = 'none';
        } else {
            // Se HÁ bots: esconde o de boas-vindas e mostra o container de bots.
            elements.welcomeState.style.display = 'none';
            elements.botsState.style.display = 'contents'; 
            
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

    // =================================================================
    // =================== LÓGICA DE AGENDAS (NOVO) ====================
    // =================================================================

    async function fetchAgendas() {
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/agendas`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) throw new Error('Falha ao buscar as agendas.');
            
            userAgendas = await response.json();
            renderAgendas(); // Chama a função para desenhar na tela
        } catch (error) {
            console.error("Erro em fetchAgendas:", error);
            showToast("Não foi possível carregar suas agendas.", "error");
        }
    }

    function renderAgendas() {
        const listContainer = document.getElementById('agendas-list');
        const emptyState = document.getElementById('no-agendas-state');

        if (!listContainer || !emptyState) return;

        listContainer.innerHTML = ''; // Limpa a lista antes de renderizar

        if (userAgendas.length === 0) {
            emptyState.style.display = 'flex';
            listContainer.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            listContainer.style.display = 'grid';
            userAgendas.forEach(agenda => {
                const agendaCard = createAgendaCard(agenda);
                listContainer.appendChild(agendaCard);
            });
        }
    }

    function createAgendaCard(agenda) {
        const card = document.createElement('div');
        card.className = 'agenda-card'; // Usaremos esta classe para estilizar
        card.setAttribute('data-agenda-id', agenda.id);

        const isActive = agenda.status === 'active';
        const statusText = isActive ? 'Ativa' : 'Inativa';
        const statusClass = isActive ? 'active' : 'inactive';
        const toggleChecked = isActive ? 'checked' : '';
        const onchangeAction = `onchange="handleAgendaStatusToggle('${agenda.id}', this.checked)"`;

        // Lista de serviços para o corpo do card
        const servicesList = agenda.services
            .filter(s => !s.is_archived) // <-- ADICIONA O FILTRO AQUI
            .map(s => `<li>${s.name} (${s.duration_minutes} min)</li>`)
            .join('');

        card.innerHTML = `
            <div class="card-header"> <!-- Usando uma classe mais genérica -->
                <div class="card-info">
                    <div class="card-name">${agenda.name}</div>
                </div>
                <div class="card-toggle-area">
                    <label class="status-toggle">
                        <input type="checkbox" ${toggleChecked} ${onchangeAction}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="status-text ${statusClass}">${statusText}</span>
                </div>
            </div>
            
            <div class="card-body"> <!-- Corpo do card com os serviços -->
                <h4>Serviços Oferecidos:</h4>
                <ul>${servicesList || "<li>Nenhum serviço cadastrado.</li>"}</ul>
            </div>

            <div class="card-actions"> <!-- Usando a mesma classe de ações do bot -->
                <div class="card-actions-left">
                    <button class="btn-accent" onclick="window.openCalendarView(${agenda.id})">
                        <!-- Ícone de Calendário para consistência -->
                        <svg width="14" height="14"><use xlink:href="#icon-calendar"/></svg>
                        Calendário
                    </button>
                </div>
                <div class="card-actions-right">
                    <button class="card-action-icon" onclick="window.handleEditAgenda(${agenda.id})" title="Editar Agenda">
                        <svg width="16" height="16"><use xlink:href="#icon-edit"/></svg>
                    </button>
                    <button class="card-action-icon" onclick="window.handleDeleteAgenda(${agenda.id}, '${agenda.name.replace(/'/g, "\\'")}')" title="Excluir Agenda">
                        <svg width="16" height="16"><use xlink:href="#icon-trash"/></svg>
                    </button>
                </div>
            </div>
        `;
        return card;
    } 

    window.handleDeleteAgenda = async function(agendaId, agendaName) {
        // Sempre peça confirmação para ações destrutivas!
        if (!confirm(`Tem certeza que deseja excluir a agenda "${agendaName}"?\n\nTodos os serviços e agendamentos vinculados a ela serão perdidos permanentemente.`)) {
            return;
        }

        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/agendas/${agendaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Não foi possível excluir a agenda.");
            }

            showToast("Agenda excluída com sucesso!", 'success');
            await fetchAgendas(); // Atualiza a lista na tela, fazendo o card sumir.

        } catch (error) {
            console.error("Erro ao excluir agenda:", error);
            showToast(error.message, 'error');
        }
    }    

    window.handleEditAgenda = function(agendaId) {
        const agenda = userAgendas.find(a => a.id === agendaId);
        if (!agenda) {
            showToast("Agenda não encontrada.", "error");
            return;
        }

        const modal = document.getElementById('agenda-modal');
        const servicesList = document.getElementById('agenda-services-list');

        // Preenche os campos do formulário com os dados da agenda
        document.getElementById('agenda-modal-title').textContent = 'Editar Agenda';
        document.getElementById('agenda-edit-id').value = agenda.id;
        document.getElementById('agenda-name').value = agenda.name;
        document.getElementById('agenda-min-antecedence').value = agenda.min_antecedence_minutes;
        document.getElementById('agenda-max-days').value = agenda.max_days_ahead;
        
        // Limpa a lista antes de adicionar os itens
        servicesList.innerHTML = '';

        // Garante que o array de serviços exista e só itera sobre os NÃO arquivados
        if (agenda.services && Array.isArray(agenda.services)) {
            const activeServices = agenda.services.filter(s => !s.is_archived);
            
            // Se não houver serviços ativos, adiciona um item em branco para começar
            if (activeServices.length === 0) {
                addAgendaServiceItem('', 30, null);
            } else {
                // Itera sobre os serviços e os adiciona à lista
                activeServices.forEach(service => {
                    addAgendaServiceItem(service.name, service.duration_minutes, service.id);
                });
            }
        } else {
            // Se a agenda não tiver nenhum serviço, adiciona um em branco
            addAgendaServiceItem('', 30, null);
        }


        // Popula o editor de horários com os dados salvos da agenda
        if (agenda.schedule_config && agenda.schedule_config.days) {
            populateAgendaScheduleEditor(agenda.schedule_config.days);
        } else {
            // Se não houver config, popula com o padrão
            populateAgendaScheduleEditor();
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // --- Funções para controlar o modal de criação/edição de agenda ---

    function setupAgendaModalListeners() {
        const createAgendaBtn = document.getElementById('create-agenda-btn');
        const startCreationBtn = document.getElementById('start-agenda-creation-btn');
        const modal = document.getElementById('agenda-modal');
        const form = document.getElementById('agenda-form');
        const addServiceBtn = document.getElementById('add-agenda-service');
        const servicesList = document.getElementById('agenda-services-list');

        // Listeners para abrir o modal
        const openModal = () => {
            form.reset(); 
            document.getElementById('agenda-edit-id').value = '';
            document.getElementById('agenda-modal-title').textContent = 'Criar Nova Agenda';
            document.getElementById('agenda-services-list').innerHTML = '';
            addAgendaServiceItem();
            
            // CHAMA A NOVA FUNÇÃO PARA POPULAR OS HORÁRIOS PADRÃO
            populateAgendaScheduleEditor();
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        createAgendaBtn.addEventListener('click', openModal);
        startCreationBtn.addEventListener('click', openModal);

        // Listeners para fechar o modal
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        };
        modal.querySelectorAll('[data-target-modal="agenda-modal"]').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        // Listener para adicionar novos serviços
        addServiceBtn.addEventListener('click', () => {
            addAgendaServiceItem();
        });

        // Listener para remover serviços (usando delegação de evento)
        servicesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                // Apenas remove se não for o último item da lista
                if (servicesList.childElementCount > 1) {
                    e.target.parentElement.remove();
                } else {
                    showToast("A agenda deve ter pelo menos um serviço.", "error");
                }
            }
        });
        
        // Listener para o envio do formulário
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleSaveAgenda(closeModal); // Passa a função de fechar o modal
        });
    }

    function addAgendaServiceItem(name = '', duration = 30, serviceId = null) {
        const servicesList = document.getElementById('agenda-services-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        // <<< CORREÇÃO CRUCIAL AQUI >>>
        // Se um serviceId for fornecido, nós o armazenamos como um atributo de dados no elemento HTML.
        // Isso garante que, ao salvar, possamos ler este ID de volta.
        if (serviceId) {
            item.dataset.serviceId = serviceId;
        }

        item.innerHTML = `
            <div class="service-item-compact">
                <input type="text" class="agenda-service-name" placeholder="Nome do Serviço" value="${name}" required maxlength="50">
                <input type="number" class="agenda-service-duration" value="${duration}" required min="5" step="5">
                <span>Min.</span>
            </div>
            <button type="button" class="remove-btn">×</button>
        `;
        servicesList.appendChild(item);
    }

    async function handleSaveAgenda(onSuccessCallback) {
        const saveBtn = document.getElementById('save-agenda-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvando...';

        try {
            const token = await getAuthToken();
            const editingId = document.getElementById('agenda-edit-id').value;
            const isEditing = !!editingId;

            // 1. Coleta e validação dos dados principais
            const agendaName = document.getElementById('agenda-name').value;
            if (!agendaName.trim()) {
                throw new Error("O nome da agenda é obrigatório.");
            }

            // 2. Coleta dos serviços (Array de objetos)
            const services = [];
            document.querySelectorAll('#agenda-services-list .knowledge-item').forEach(item => {
                const nameInput = item.querySelector('.agenda-service-name');
                const durationInput = item.querySelector('.agenda-service-duration');
                const name = nameInput ? nameInput.value.trim() : '';
                const duration = durationInput ? parseInt(durationInput.value, 10) : 0;
                
                // Adiciona o serviço apenas se for válido
                if (name && duration > 0) {
                    // Para criação, o ID é nulo. Para edição, pegamos do dataset.
                    const serviceId = item.dataset.serviceId ? parseInt(item.dataset.serviceId, 10) : null;
                    services.push({ id: serviceId, name: name, duration_minutes: duration });
                }
            });

            if (services.length === 0) {
                throw new Error("Adicione pelo menos um serviço válido com nome e duração.");
            }

            // 3. Coleta da configuração de horários (Array de objetos)
            const scheduleDays = [];
            document.querySelectorAll('#agenda-schedule-details .schedule-day').forEach(dayEl => {
                const dayKey = dayEl.dataset.day;
                const toggle = dayEl.querySelector('input[type="checkbox"]');
                const openTime = dayEl.querySelector('input[type="time"]:first-of-type');
                const closeTime = dayEl.querySelector('input[type="time"]:last-of-type');

                scheduleDays.push({
                    day: dayKey,
                    active: toggle ? toggle.checked : false,
                    open: openTime ? openTime.value : '09:00',
                    close: closeTime ? closeTime.value : '18:00'
                });
            });

            // 4. Montagem do payload final para a API
            const agendaData = {
                name: agendaName,
                min_antecedence_minutes: parseInt(document.getElementById('agenda-min-antecedence').value, 10),
                max_days_ahead: parseInt(document.getElementById('agenda-max-days').value, 10),
                services: services, // Array de serviços
                schedule_config: {
                    interval: 30,
                    days: scheduleDays // Array de horários
                }
            };

            // 5. Definição da URL e método (POST para criar, PUT para editar)
            const url = isEditing ? `${API_BASE_URL}/api/agendas/${editingId}` : `${API_BASE_URL}/api/agendas`;
            const method = isEditing ? 'PUT' : 'POST';
            
            // 6. Envio para o backend
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(agendaData)
            });

            const result = await response.json();
            if (!response.ok) {
                // O erro virá do backend, então apenas o exibimos
                throw new Error(result.message || "Falha ao salvar a agenda.");
            }
            
            showToast(isEditing ? 'Agenda atualizada com sucesso!' : 'Agenda criada com sucesso!', 'success');
            await fetchAgendas(); 
            
            if (onSuccessCallback) onSuccessCallback();

        } catch (error) {
            console.error("Erro ao salvar agenda:", error);
            showToast(error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar Agenda';
        }
    }

    // =====================================================================
    //      EM app.js, COLE ESTA NOVA FUNÇÃO APÓS handleSaveAgenda
    // =====================================================================

    function populateAgendaScheduleEditor(scheduleData = []) {
        const container = document.getElementById('agenda-schedule-details');
        container.innerHTML = ''; // Limpa o conteúdo anterior

        const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
        const dayKeys = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];

        dayKeys.forEach((key, index) => {
            // Procura pelos dados do dia atual, ou usa um padrão inteligente
            let dayConfig = scheduleData.find(d => d.day === key);
            if (!dayConfig) {
                // Aplica nossas regras padrão
                if (key === 'domingo') {
                    dayConfig = { active: false, open: '09:00', close: '18:00' };
                } else if (key === 'sabado') {
                    dayConfig = { active: true, open: '08:00', close: '16:00' };
                } else {
                    dayConfig = { active: true, open: '08:00', close: '18:00' };
                }
            }

            const dayElement = document.createElement('div');
            dayElement.className = 'schedule-day';
            dayElement.dataset.day = key;
            
            dayElement.innerHTML = `
                <span class="day-name">${dayNames[index]}</span>
                <div class="time-inputs">
                    <label>Abre</label><input type="time" value="${dayConfig.open}">
                    <label>Fecha</label><input type="time" value="${dayConfig.close}">
                </div>
                <label class="day-toggle"><input type="checkbox" ${dayConfig.active ? 'checked' : ''}><span class="toggle-slider"></span></label>
            `;
            container.appendChild(dayElement);

            // Adiciona o listener para o toggle recém-criado
            const toggle = dayElement.querySelector('input[type="checkbox"]');
            toggle.addEventListener('change', () => updateDayScheduleState(dayElement));
            
            // Garante que o estado visual inicial esteja correto
            updateDayScheduleState(dayElement);
        });
    }    

    // =====================================================================
    // ================ LÓGICA DA VIEW DE CALENDÁRIO (NOVO) ================
    // =====================================================================

    function updateDateDisplay(date) {
        const displayEl = document.getElementById('day-schedule-date-display');
        if (displayEl) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0'); // Mês é base 0, então somamos 1
            const year = date.getFullYear();
            displayEl.textContent = `${day}/${month}/${year}`;
        }
    }

    // Função principal que abre e inicializa a view do calendário
    window.openCalendarView = function(agendaId) {
        currentAgenda = userAgendas.find(a => a.id === agendaId);
        if (!currentAgenda) {
            showToast("Não foi possível carregar a agenda.", "error");
            return;
        }

        selectedDate = new Date(); // Reseta para a data de hoje ao abrir
        document.getElementById('calendar-agenda-name').textContent = `Calendário de ${currentAgenda.name}`;
        updateDateDisplay(selectedDate);
        showView('calendar');
        renderMiniCalendar();
        renderDaySchedule();
    }

    // Função chamada quando o usuário clica em um dia no mini-calendário
    window.changeSelectedDate = function(day, month, year) {
        const gridEl = document.getElementById('day-schedule-grid');
        gridEl.innerHTML = '<div class="loading-spinner-large"></div>';
        document.getElementById('day-schedule-date-display').textContent = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

        selectedDate = new Date(year, month - 1, day);
        updateMiniCalendarSelection(); 
        renderDaySchedule();
    }

    // =====================================================================
    //      SUBSTITUA TODA A SUA FUNÇÃO renderMiniCalendar POR ESTA
    // =====================================================================

    window.renderMiniCalendar = async function() {
        // A lógica desta função permanece a mesma da versão anterior,
        // pois ela já está correta para quando precisamos de um loading.
        const calendarEl = document.getElementById('mini-calendar');
        const month = selectedDate.getMonth();
        const year = selectedDate.getFullYear();
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        calendarEl.innerHTML = `
            <div class="mini-calendar-header">
                <button onclick="window.changeMonth(-1)" title="Mês anterior">‹</button>
                <span>${monthNames[month]} ${year}</span>
                <button onclick="window.changeMonth(1)" title="Prximo mês">›</button>
            </div>
            <div class="mini-calendar-grid">
                <div class="loading-spinner" style="grid-column: 1 / -1; margin: 2rem auto;"></div>
            </div>
        `;

        try {
            const monthAvailability = await fetchMonthAvailability(year, month + 1);
            const firstDayOfMonth = new Date(year, month, 1);
            const lastDayOfMonth = new Date(year, month + 1, 0);
            const dayNames = ["D", "S", "T", "Q", "Q", "S", "S"];

            let finalGridContent = '';
            dayNames.forEach(day => { finalGridContent += `<div class="day-name">${day}</div>`; });
            for (let i = 0; i < firstDayOfMonth.getDay(); i++) { finalGridContent += `<div></div>`; }

            for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
                const isSelected = day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear();
                const dayStatusClass = monthAvailability[day] || '';
                finalGridContent += `<div class="day-number ${isSelected ? 'selected' : ''} ${dayStatusClass}" data-day="${day}" onclick="window.changeSelectedDate(${day}, ${month + 1}, ${year})">${day}</div>`;
            }
            
            const gridContainer = calendarEl.querySelector('.mini-calendar-grid');
            if (gridContainer) gridContainer.innerHTML = finalGridContent;

        } catch (error) {
            console.error("Erro ao renderizar mini-calendário:", error);
            const gridContainer = calendarEl.querySelector('.mini-calendar-grid');
            if (gridContainer) gridContainer.innerHTML = `<p class="error-message">Erro.</p>`;
        }
    };

    // Função para mudar o mês no mini-calendário
    window.changeMonth = function(offset) {
        selectedDate.setMonth(selectedDate.getMonth() + offset);
        // Para garantir a reatividade, a melhor prática é chamar a função de renderização principal
        renderMiniCalendar();
        
        // Simula o clique no primeiro dia do novo mês para carregar a grade de horários
        // Isso garante que a grade da direita sempre atualize ao mudar de mês
        const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        changeSelectedDate(newDate.getDate(), newDate.getMonth() + 1, newDate.getFullYear());
    }
    
    // Função LEVE que apenas atualiza o destaque do dia selecionado
    function updateMiniCalendarSelection() {
        const calendarEl = document.getElementById('mini-calendar');
        if (!calendarEl) return;

        // Remove a seleção de qualquer dia que estivesse selecionado antes
        const previouslySelected = calendarEl.querySelector('.day-number.selected');
        if (previouslySelected) {
            previouslySelected.classList.remove('selected');
        }

        // Encontra o novo dia a ser selecionado e adiciona a classe
        // Usamos data-day para garantir que estamos pegando o dia correto
        const currentDayEl = calendarEl.querySelector(`.day-number[data-day="${selectedDate.getDate()}"]`);
        if (currentDayEl) {
            currentDayEl.classList.add('selected');
        }
    }

    // Função de mudança de mês, agora mais limpa
    window.changeMonth = function(offset) {
        selectedDate.setMonth(selectedDate.getMonth() + offset, 1); // O ", 1" evita bugs em meses com diferentes dias
        window.renderMiniCalendar(); // Chama a função "pesada" com loading
    }    
       
    
    // Função principal que busca os dados e renderiza a grade de horários do dia
    async function renderDaySchedule() {
        const gridEl = document.getElementById('day-schedule-grid');
        if (!gridEl) return;

        try {
            const apiDate = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
            const { appointments, overrides } = await fetchAppointmentsForDay(apiDate);
            currentDayAppointments = appointments;

            // ... (o restante do código interno desta função, que já está correto, permanece o mesmo)
            // A lógica do loop while que constrói o finalHTML não precisa de alterações.
            // Copie e cole o corpo inteiro da função que você já tem para garantir.

            const dayOfWeekIndex = selectedDate.getDay();
            const dayKeys = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
            const dayConfig = currentAgenda.schedule_config.days.find(d => d.day === dayKeys[dayOfWeekIndex]);
            const workingHours = (dayConfig && dayConfig.active) ? { open: dayConfig.open, close: dayConfig.close } : null;

            const occupiedSlots = new Set();
            let finalHTML = '';
            const interval = 30;

            let currentTime = new Date(selectedDate);
            currentTime.setHours(6, 0, 0, 0);
            const dayEndTime = new Date(selectedDate);
            dayEndTime.setHours(23, 0, 0, 0);

            while (currentTime < dayEndTime) {
                const slotStartTime = new Date(currentTime);
                const slotTimeValue = slotStartTime.getTime();
                const slotISO = slotStartTime.toISOString();
                const slotTimeDisplay = slotStartTime.toTimeString().substring(0, 5);

                if (occupiedSlots.has(slotTimeValue)) {
                    currentTime.setMinutes(currentTime.getMinutes() + interval);
                    continue;
                }

                const appointmentInSlot = appointments.find(app => new Date(app.start_time).getTime() === slotTimeValue);

                if (appointmentInSlot) {
                    const startTime = new Date(appointmentInSlot.start_time);
                    const endTime = new Date(appointmentInSlot.end_time);
                    const duration = (endTime - startTime) / (1000 * 60);
                    const slotSpan = Math.max(1, Math.ceil(duration / interval));

                    finalHTML += `
                        <div class="day-schedule-slot booked">
                            <div class="slot-info">
                                <span class="client-name">${appointmentInSlot.client_name || 'Agendado'}</span>
                                <small>${appointmentInSlot.service_name || 'Serviço'} - ${slotTimeDisplay}</small>
                            </div>
                            <div class="slot-actions">
                                <button class="slot-action-btn" title="Editar Agendamento" onclick="window.openAppointmentModal('${slotISO}', ${JSON.stringify(appointmentInSlot).replace(/"/g, '&quot;').replace(/'/g, '&#39;')} )"><svg width="18" height="18"><use xlink:href="#icon-edit"/></svg></button>
                                <button class="slot-action-btn danger" title="Excluir Agendamento" onclick="window.handleDeleteAppointment(${appointmentInSlot.id}, '${(appointmentInSlot.client_name || '').replace(/'/g, "\\'")}')"><svg width="18" height="18"><use xlink:href="#icon-trash"/></svg></button>
                            </div>
                        </div>
                    `;
                    
                    for (let i = 1; i < slotSpan; i++) {
                        occupiedSlots.add(new Date(slotStartTime).setMinutes(slotStartTime.getMinutes() + (i * interval)));
                    }

                } else {
                    const overrideInSlot = overrides.find(ov => new Date(ov.slot_time).getTime() === slotTimeValue);
                    let status = 'default';
                    
                    if (overrideInSlot) {
                        status = overrideInSlot.status;
                    } else {
                        const isOutsideWorkingHours = workingHours ? (slotTimeDisplay < workingHours.open || slotTimeDisplay >= workingHours.close) : true;
                        if (isOutsideWorkingHours) status = 'blocked';
                        else status = 'available';
                    }

                    if (status === 'available') {
                        finalHTML += `
                            <div class="day-schedule-slot available" onclick="window.openAppointmentModal('${slotISO}')">
                                <span class="slot-time">${slotTimeDisplay}</span>
                                <div class="slot-actions">
                                    <button class="slot-action-btn" title="Bloquear horário" onclick="event.stopPropagation(); window.handleToggleSlot('${slotISO}', 'blocked')"><svg width="18" height="18"><use xlink:href="#icon-lock"/></svg></button>
                                    <button class="slot-action-btn" title="Novo Agendamento" onclick="event.stopPropagation(); window.openAppointmentModal('${slotISO}')"><svg width="18" height="18"><use xlink:href="#icon-plus-circle"/></svg></button>
                                </div>
                            </div>
                        `;
                    } else { 
                        finalHTML += `
                            <div class="day-schedule-slot blocked">
                                <span class="slot-time">${slotTimeDisplay}</span>
                                <div class="slot-actions">
                                    <button class="slot-action-btn" title="Liberar horário" onclick="window.handleToggleSlot('${slotISO}', 'available')"><svg width="18" height="18"><use xlink:href="#icon-unlock"/></svg></button>
                                </div>
                            </div>
                        `;
                    }
                }
                
                currentTime.setMinutes(currentTime.getMinutes() + interval);
            }

            gridEl.innerHTML = finalHTML;
            
        } catch (error) {
            console.error("Erro ao renderizar a grade de horários:", error);
            gridEl.innerHTML = `<p class="error-message">Não foi possível carregar os horários.</p>`;
        }
    }



    // Busca os agendamentos do dia na API
    async function fetchAppointmentsForDay(date) {
        const token = await getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/agendas/${currentAgenda.id}/appointments?date=${date}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Falha ao buscar agendamentos.");
        return await response.json();
    }

        // Função única para bloquear ou desbloquear um horário
    window.handleToggleSlot = async function(slotISO, newStatus) {
        // Ação de inversão simples
        const actionText = newStatus === 'blocked' ? 'bloquear' : 'liberar';
        if (!confirm(`Deseja ${actionText} este horário?`)) return;

        try {
            const token = await getAuthToken();
            await fetch(`${API_BASE_URL}/api/agendas/toggle-slot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    agenda_id: currentAgenda.id,
                    slot_time: slotISO,
                    new_status: newStatus
                })
            });
            showToast(`Horário ${actionText === 'bloquear' ? 'bloqueado' : 'liberado'}!`, 'success');
            renderDaySchedule();
            renderMiniCalendar();
        } catch (error) {
            showToast("Não foi possível atualizar o horário.", "error");
        }
        
    }

    window.openAppointmentModal = function(slotISO, appointment = null) {
        const modal = document.getElementById('appointment-modal');
        const form = document.getElementById('appointment-form');
        const title = document.getElementById('appointment-modal-title');
        const serviceSelect = document.getElementById('appointment-service');

        form.reset();
        document.getElementById('appointment-slot-start-time').value = slotISO;

        // <<< INÍCIO DA NOVA LÓGICA INTELIGENTE >>>

        const slotStartTime = new Date(slotISO).getTime();

        // 1. Encontra o próximo agendamento no dia
        const nextAppointment = currentDayAppointments
            .filter(app => new Date(app.start_time).getTime() > slotStartTime) // Pega todos os agendamentos futuros
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0]; // Ordena e pega o mais próximo

        // 2. Calcula o tempo disponível em minutos
        let availableWindowInMinutes;
        if (nextAppointment) {
            const nextAppointmentTime = new Date(nextAppointment.start_time).getTime();
            availableWindowInMinutes = (nextAppointmentTime - slotStartTime) / 60000;
        } else {
            availableWindowInMinutes = 9999; // Se não houver próximo agendamento, há tempo "infinito"
        }

        // 3. Popula o <select> de serviços, verificando a viabilidade
        serviceSelect.innerHTML = '<option value="" disabled selected>Selecione um serviço...</option>';
        currentAgenda.services.filter(service => !service.is_archived).forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            option.dataset.duration = service.duration_minutes;

            if (appointment && appointment.service_id === service.id) {
                // Se estiver editando, o serviço atual deve estar sempre habilitado
                option.textContent = `${service.name} (${service.duration_minutes} min)`;
                option.disabled = false;
            } else if (service.duration_minutes > availableWindowInMinutes) {
                // Se o serviço não couber na janela de tempo
                option.textContent = `${service.name} (${service.duration_minutes} min) - Tempo insuficiente. `;
                option.disabled = true; // Desabilita a opção
            } else {
                // Se o serviço couber
                option.textContent = `${service.name} (${service.duration_minutes} min)`;
                option.disabled = false;
            }
            
            serviceSelect.appendChild(option);
        });

        // <<< FIM DA NOVA LÓGICA INTELIGENTE >>>

        if (appointment) {
            // --- MODO EDIÇÃO ---
            title.textContent = 'Editar Agendamento';
            document.getElementById('appointment-edit-id').value = appointment.id;
            document.getElementById('appointment-service').value = appointment.service_id;
            document.getElementById('appointment-client-name').value = appointment.client_name;
            document.getElementById('appointment-client-phone').value = appointment.client_phone || '';
            document.getElementById('appointment-notes').value = appointment.notes || '';
        } else {
            // --- MODO CRIAÇÃO ---
            title.textContent = 'Novo Agendamento';
            document.getElementById('appointment-edit-id').value = '';
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    window.handleAgendaStatusToggle = async function(agendaId, isActive) {
        // A lógica de chamada da API permanece a mesma
        try {
            const status = isActive ? 'active' : 'inactive';
            const token = await getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/api/agendas/${agendaId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status })
            });

            if (!response.ok) throw new Error('Falha ao alterar status da agenda');

            // Atualiza o estado local
            const agenda = userAgendas.find(a => a.id == agendaId);
            if (agenda) {
                agenda.status = status;
                
                // <<< AQUI ESTÁ A CORREÇÃO >>>
                // 1. Encontramos o card antigo que está na tela.
                const oldCard = document.querySelector(`.agenda-card[data-agenda-id="${agendaId}"]`);
                
                if (oldCard) {
                    // 2. Criamos o novo card atualizado em memória.
                    const newCardElement = createAgendaCard(agenda);
                    
                    // 3. Usamos .replaceWith() para substituir o antigo pelo novo.
                    oldCard.replaceWith(newCardElement);
                }
            }

        } catch (error) {
            console.error('Erro ao alterar status da agenda:', error);
            showToast("Não foi possível atualizar o status.", "error");
            await fetchAgendas();
        }
    };    

    // Função para salvar (criar ou atualizar) o agendamento
    async function handleSaveAppointment(event) {
        event.preventDefault(); 
        const saveBtn = document.getElementById('save-appointment-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvando...';

        try {
            const token = await getAuthToken();
            
            // --- INÍCIO DA CORREÇÃO ---
            
            // 1. Determina se estamos editando ou criando
            const editingId = document.getElementById('appointment-edit-id').value;
            const isEditing = !!editingId;

            // 2. Coleta os dados (a sua lógica de cálculo de end_time já estava perfeita!)
            const serviceSelect = document.getElementById('appointment-service');
            const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
            
            const startTime = new Date(document.getElementById('appointment-slot-start-time').value);
            const duration = parseInt(selectedOption.dataset.duration, 10);
            const endTime = new Date(startTime.getTime() + duration * 60000);

            const appointmentData = {
                agenda_id: currentAgenda.id,
                service_id: document.getElementById('appointment-service').value,
                client_name: document.getElementById('appointment-client-name').value,
                client_phone: document.getElementById('appointment-client-phone').value,
                notes: document.getElementById('appointment-notes').value,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                status: 'confirmed'
            };
            
            // 3. Define a URL e o método da API dinamicamente
            const url = isEditing 
                ? `${API_BASE_URL}/api/appointments/${editingId}` 
                : `${API_BASE_URL}/api/appointments`;

            const method = isEditing ? 'PUT' : 'POST';

            // 4. Faz a chamada à API com os parâmetros corretos
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(appointmentData)
            });

            // --- FIM DA CORREÇÃO ---

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Falha ao salvar o agendamento.");
            }
            
            // Usa uma mensagem de sucesso mais específica
            showToast(isEditing ? 'Agendamento atualizado com sucesso!' : 'Agendamento salvo com sucesso!', 'success');
            closeAppointmentModal();
            renderDaySchedule(); 
            renderMiniCalendar();

        } catch (error) {
            console.error("Erro ao salvar agendamento:", error);
            showToast(error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar Agendamento';
        }
    }

// Função para deletar um agendamento
    window.handleDeleteAppointment = async function(appointmentId, clientName) {
        console.log('Função handleDeleteAppointment foi chamada com ID:', appointmentId, 'e Nome:', clientName);
        if (!confirm(`Tem certeza que deseja excluir o agendamento de "${clientName}"?\n\nEsta ação não pode ser desfeita.`)) {
            return;
        }

        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Não foi possível remover o agendamento.");
            }
            
            showToast("Agendamento removido com sucesso!", 'success');
            renderDaySchedule(); // Atualiza a grade para refletir a exclusão
            renderMiniCalendar();

        } catch (error) {
            console.error("Erro ao remover agendamento:", error);
            showToast(error.message, 'error');
        }
    }    

    // Função para fechar o modal
    function closeAppointmentModal() {
        const modal = document.getElementById('appointment-modal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }    

    // Listener para o botão de voltar
    function setupCalendarListeners() {
        // Listener para o botão de voltar (já existente)
        document.getElementById('back-to-agendas-btn').addEventListener('click', () => {
            showView('agendas');
        });

        // --- INÍCIO DA NOVA LÓGICA ---
        const appointmentModal = document.getElementById('appointment-modal');
        if (appointmentModal) {
            // Listener para o envio do formulário
            appointmentModal.querySelector('form').addEventListener('submit', handleSaveAppointment);

            // Listeners para os botões de fechar
            appointmentModal.querySelectorAll('[data-target-modal="appointment-modal"]').forEach(btn => {
                btn.addEventListener('click', closeAppointmentModal);
            });
        }
        // --- FIM DA NOVA LÓGICA ---
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
                
                <div class="stat-item">
                    <div class="stat-number">0</div>
                    <div class="stat-label">Respostas</div>
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
                isActivelyConnecting = true;

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
                    headers: {
                        'Content-Type': 'application/json', // PRECISA ter este header
                        'Authorization': `Bearer ${token}` 
                    },
                    // Adicionamos o socket.id no corpo da requisição
                    body: JSON.stringify({ socketId: socket.id }) 
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

    window.openBotSettings = function(botId) {
        const bot = userBots.find(b => b.id == botId);
        if (!bot) {
            console.error("Bot não encontrado para o ID:", botId);
            showToast("Erro: Assistente não encontrado.", "error");
            return;
        }

        isEditMode = true;
        editingBotId = botId;
        
        populateEditFormWithBotData(bot); 
        
        showView('edit');
    };    

    // Adiciona funções globais para o modal
    window.closeDeleteModal = closeDeleteModal;

    // === WIZARD ===
    function initializeWizard() {
        const wizardView = views.wizard; // <-- Ponto de referência para o Wizard

        setupWizardEventListeners(wizardView);
        setupOptionCards(wizardView);
        setupScheduleControls(wizardView);
        setupKnowledgeBase(wizardView);
        setupWizardValidation(wizardView);
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

    function setupOptionCards(viewElement) {
        // Agora, a busca por '.option-card' acontece apenas dentro do elemento fornecido
        viewElement.querySelectorAll('.option-card').forEach(card => {
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
                        // A linha que apagava o valor foi removida para segurança,
                        // mas a lógica de esconder já previne a submissão do valor.
                    }
                }
                // A validação do wizard não deve ser chamada na tela de edição
                if (viewElement.id === 'wizard-view') {
                    validateWizardStep(currentWizardStep);
                }
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

        setTimeout(() => {
            // Em vez de mirar em um elemento específico, rolamos a janela principal (window)
            // para o topo. Isso funciona de forma confiável tanto no desktop quanto no mobile.
            window.scrollTo(0, 0);
        }, 0);        
        
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

    async function handleWizardContinue() {
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
            console.log('Usuário clicou em "Fazer isso depois". Indo para o dashboard.');
            
            // Forçamos o código a ESPERAR que o processo de cancelamento termine
            // antes de prosseguir para as próximas linhas.
            if (editingBotId) {
                await handleConnectionToggle(editingBotId, 'connecting');
            }
            isActivelyConnecting = false;
            resetWizard();
            showView('dashboard');
            await fetchBots();
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

            const scheduleDataResult = collectScheduleData('#step-2'); 
            const faqData = collectFaqData();
            const contactsData = collectContactsData();
            
            // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
            // O wizard não tem um toggle 'schedule_enabled' global.
            // A forma correta de determinar se o agendamento está ativo é verificar
            // se o usuário ativou pelo menos UM dia na configuração.
            const scheduleEnabled = scheduleDataResult.data.some(day => day.active);
            // --- FIM DA CORREÇÃO DEFINITIVA ---

            const botData = {
                name: document.getElementById('bot-name').value || 'Novo Bot',
                function_type: functionType,
                tone_type: toneType,
                tone_custom_description: toneCustomDescription,
                schedule_enabled: scheduleEnabled, // <-- Agora usa a variável corrigida (true/false)
                schedule_data: JSON.stringify(scheduleDataResult.data),
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
            
            editingBotId = newBot.id; 
            
            return newBot;
            
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
    function collectScheduleData(contextSelector) {
        const container = document.querySelector(contextSelector);
        if (!container) {
            console.error("Contexto do horário não encontrado:", contextSelector);
            return { enabled: false, data: [] };
        }

        const scheduleEnabledCheckbox = container.querySelector('input[type="checkbox"][id*="schedule-enabled"]');
        const enabled = scheduleEnabledCheckbox ? scheduleEnabledCheckbox.checked : false;

        const data = [];
        const dayNames = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        
        container.querySelectorAll('.schedule-day').forEach((dayElement, index) => {
            const toggle = dayElement.querySelector('input[type="checkbox"]');
            const openTime = dayElement.querySelector('input[type="time"]:first-of-type');
            const closeTime = dayElement.querySelector('input[type="time"]:last-of-type');
            
            data.push({
                day: dayNames[index],
                active: toggle ? toggle.checked : false,
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
            isActivelyConnecting = true; // <-- DEFINA COMO TRUE AQUI        

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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ socketId: socket.id })
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
        const wizardView = views.wizard; // <-- Ponto de referência

        wizardFilesToUpload = [];
        isEditMode = false;
        editingBotId = null;
        wizardBotId = null;
        wizardBotData = {};
        currentWizardStep = 1;
        
        wizardView.querySelector('#bot-name').value = '';
        wizardView.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
        wizardView.querySelectorAll('textarea').forEach(textarea => {
            textarea.style.display = 'none';
            textarea.value = '';
        });
        
        const faqList = wizardView.querySelector('#faq-list');
        const contactsList = wizardView.querySelector('#contacts-list');
        const filesList = wizardView.querySelector('#files-list');
        
        if (faqList) faqList.innerHTML = '';
        if (contactsList) contactsList.innerHTML = '';
        if (filesList) filesList.innerHTML = '';
        
        // As funções abaixo já são escopadas para o wizard, então estão seguras
        resetScheduleToDefault(); 
        setDefaultSelections();
        
        elements.qrDisplay.innerHTML = `
            <div class="qr-placeholder">
                <svg width="48" height="48"><use xlink:href="#icon-qr-placeholder"/></svg>
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
    
    function initializeWizardView() {
        // Roda a inicialização apenas uma vez para evitar duplicar listeners
        if (isWizardInitialized) return;

        console.log('🔧 Inicializando a View do Wizard pela primeira vez...');
        initializeWizard(); // Esta função você já tem

        document.getElementById('faq-list').addEventListener('click', handleKnowledgeItemRemove);
        document.getElementById('contacts-list').addEventListener('click', handleKnowledgeItemRemove);        

        isWizardInitialized = true;
    }    

    // === SOCKET.IO ===
    function initializeSocket() {
        if (socket && socket.connected) return;
        
        socket = io(API_BASE_URL, { transports: ['websocket'] });
        
        socket.on("connect", () => {
            console.log("✅ Conectado ao servidor via WebSocket!");
        });
        
        socket.on("qr_code", (data) => {
            if (data.botId != editingBotId) return;

            // Limpa qualquer contador regressivo anterior para evitar timers duplicados
            if (qrTimerInterval) clearInterval(qrTimerInterval);

            let timeLeft = 20; // O tempo visual que o usuário vê
            const qrModalContent = document.getElementById('qr-modal-content');
            const wizardQrDisplay = document.getElementById('qr-display');

            // Função interna para renderizar o QR Code e o timer no elemento correto
            const renderQrAndTimer = (targetEl) => {
                if (!targetEl) return;
                targetEl.innerHTML = `
                    <div class="qr-code-wrapper"></div>
                    <p class="qr-timer" id="qr-timer-display">Atualizando em ${timeLeft}s...</p>
                `;
                // Gera o QR Code visualmente
                new QRCode(targetEl.querySelector('.qr-code-wrapper'), {
                    text: data.qrString,
                    width: 240, height: 240,
                    colorDark: "#000000", colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            };
            
            // Determina se estamos no wizard ou no modal e renderiza o conteúdo lá
            const targetDisplayElement = views.wizard.classList.contains('active') ? wizardQrDisplay : qrModalContent;
            renderQrAndTimer(targetDisplayElement);

            // Inicia o contador regressivo que atualiza a UI a cada segundo
            qrTimerInterval = setInterval(() => {
                timeLeft--;
                const timerDisplay = document.getElementById('qr-timer-display');
                if (timerDisplay) timerDisplay.textContent = `Atualizando em ${timeLeft}s...`;
                
                // Quando o contador visual chega a zero...
                if (timeLeft <= 0) {
                    clearInterval(qrTimerInterval);
                    // ...substituímos o QR Code pela mensagem de "Gerando novo código..."
                    if (targetDisplayElement) {
                        targetDisplayElement.innerHTML = `
                            <div class="qr-loading">
                                <div class="loading-spinner"></div>
                                <h3>Gerando novo código...</h3>
                            </div>
                        `;
                    }
                }
            }, 1000);
        });

        socket.on("connection_timeout", (data) => {
            // Ignora o evento se não for para o bot que estamos conectando ativamente
            if (!isActivelyConnecting || data.botId != editingBotId) return;
            
            isActivelyConnecting = false; // O processo de conexão falhou, então não está mais ativo
            if (qrTimerInterval) clearInterval(qrTimerInterval); // Para o contador regressivo, se estiver rodando
            
            // Determina onde mostrar a mensagem de erro (wizard ou modal)
            const targetEl = views.wizard.classList.contains('active') ? elements.qrDisplay : document.getElementById('qr-modal-content');
            if (!targetEl) return;

            // O novo HTML com o botão "Tentar Novamente"
            const errorHTML = `
                <div class="qr-error">
                    <h3>Tempo Esgotado</h3>
                    <p>O tempo para escanear expirou. Clique abaixo para tentar novamente.</p>
                    <button class="btn-primary" id="retry-connection-btn">Gerar Novo QR Code</button>
                </div>
            `;
            targetEl.innerHTML = errorHTML;

            // Adiciona um listener de clique ao botão que acabamos de criar
            document.getElementById('retry-connection-btn').addEventListener('click', () => {
                // A ação do botão é simplesmente chamar a mesma função de conexão novamente
                handleConnectionToggle(data.botId, 'offline');
            });
        });        

        socket.on("client_ready", async (data) => {
            if (data.botId != editingBotId) return;
            isActivelyConnecting = false;

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
            isActivelyConnecting = false;

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
            const LANDING_PAGE_URL = 'https://facilchat.com.br';

            auth.signOut().then(() => {
                // ---- INÍCIO DA LÓGICA WHITELABEL ----
                if (isWhitelabelMode) {
                    // No modo revendedor, apenas recarrega a página de login atual.
                    console.log('Logout em modo Whitelabel. Recarregando a página.');
                    window.location.reload();
                } else {
                    // No modo padrão, redireciona para a landing page.
                    console.log('Logout em modo Padrão. Redirecionando para a landing page.');
                    window.location.href = LANDING_PAGE_URL;
                }
                // ---- FIM DA LÓGICA WHITELABEL ----
            }).catch((error) => {
                console.error('Erro ao fazer logout:', error);
                alert('Ocorreu um erro ao tentar sair da sua conta.');
            });
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

        
        elements.closeWizard.addEventListener('click', async () => { // Adiciona async
            console.log('Wizard fechado pelo botão "X".');

            const botIdToCancel = wizardBotId || editingBotId;
            if (botIdToCancel) {
                console.log(`[Frontend] Cancelando conexão pendente para o bot ${botIdToCancel}.`);
                // Adiciona await para esperar a finalização
                await handleConnectionToggle(botIdToCancel, 'connecting'); 
            }

            isActivelyConnecting = false;
            resetWizard();
            showView('dashboard');
            await fetchBots(); // Adiciona await por boa prática
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
                <input type="text" placeholder="Pergunta" value="${question}" maxlength="100">
                <input type="text" placeholder="Resposta" value="${answer}" maxlength="300">
            </div>
            <button type="button" class="remove-btn">×</button>
        `;
        
        faqList.appendChild(item);
        // Esta chamada garante que o botão some se o formulário for populado já no limite
        updateAddButtonState('faq-list', 'add-faq', 5); 
    }

    function addContactItem(sector = '', contact = '') {
        const contactsList = document.getElementById('contacts-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        
        item.innerHTML = `
            <input type="text" placeholder="Para quem encaminhar?" value="${sector}" maxlength="30" style="flex-basis: 200px; flex-shrink: 0;">
            <input type="text" placeholder="Telefone, e-mail ou link de contato" value="${contact}" maxlength="100" style="flex-grow: 1;">
            <button type="button" class="remove-btn">×</button>
        `;
        
        contactsList.appendChild(item);
        updateAddButtonState('contacts-list', 'add-contact', 5);
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

    function updateAddButtonState(listId, buttonId, limit) {
    const list = document.getElementById(listId);
    const button = document.getElementById(buttonId);
    if (!list || !button) return;

    const itemCount = list.querySelectorAll('.knowledge-item').length;

    if (itemCount >= limit) {
        button.style.display = 'none'; // Esconde o botão
    } else {
        button.style.display = 'block'; // Mostra o botão
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
        // Roda a inicialização apenas uma vez
        if (isEditViewInitialized) return;

        console.log('🔧 Inicializando a View de Edição pela primeira vez...');
        
        const editView = views.edit; // Ponto de referência para a Tela de Edição
        
        const editScheduleBtn = document.getElementById('edit-schedule-btn');
        const scheduleModal = document.getElementById('schedule-modal');

        if (editScheduleBtn && scheduleModal) {
            editScheduleBtn.addEventListener('click', () => {
                scheduleModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }

        if (scheduleModal) {
            const closeButtons = scheduleModal.querySelectorAll('[data-target-modal="schedule-modal"]');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    scheduleModal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                });
            });
        }
        
        const saveScheduleBtn = document.getElementById('save-schedule-btn');
        if(saveScheduleBtn) {
            saveScheduleBtn.addEventListener('click', () => {
                scheduleModal.classList.remove('active');
                document.body.style.overflow = 'auto';
                const scheduleEnabled = scheduleModal.querySelector('#modal-schedule-enabled').checked;
                document.getElementById('schedule-status-text').textContent = scheduleEnabled ? 'Horários personalizados ativos.' : 'Sem restrição, sempre ativo.';
            });
        }

        const modalScheduleDetails = document.getElementById('modal-schedule-details');
        const modalScheduleEnabled = document.getElementById('modal-schedule-enabled');
        if(modalScheduleEnabled && modalScheduleDetails){
            modalScheduleEnabled.addEventListener('change', () => {
                modalScheduleDetails.style.display = modalScheduleEnabled.checked ? 'block' : 'none';
            });
            modalScheduleDetails.querySelectorAll('.schedule-day').forEach(dayElement => {
                const toggle = dayElement.querySelector('input[type="checkbox"]');
                if (toggle) {
                    toggle.addEventListener('change', () => updateDayScheduleState(dayElement));
                }
            });
        }

        const leadEnabledCheckbox = document.getElementById('edit-lead-collection-enabled');
        const leadDetails = document.getElementById('edit-lead-collection-details');
        if (leadEnabledCheckbox && leadDetails) {
            leadEnabledCheckbox.addEventListener('change', () => {
                leadDetails.style.display = leadEnabledCheckbox.checked ? 'block' : 'none';
            });
        }
        const snoozeEnabledCheckbox = document.getElementById('edit-smart-snooze-enabled');
        const snoozeDetails = document.getElementById('edit-smart-snooze-details');
        if (snoozeEnabledCheckbox && snoozeDetails) {
            snoozeEnabledCheckbox.addEventListener('change', () => {
                snoozeDetails.style.display = snoozeEnabledCheckbox.checked ? 'block' : 'none';
            });
        }
        
        const editForm = document.getElementById('edit-bot-form');
        if (editForm) {
            editForm.addEventListener('submit', handleEditFormSubmit);
        }
        const cancelEditBtn = document.getElementById('cancel-edit');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                isEditMode = false;
                editingBotId = null;
                showView('dashboard');
            });
        }
        
        setupEditKnowledgeBase();
        
        // --- AQUI ESTÁ A CORREÇÃO ---
        // Removemos a chamada para a função antiga (setupEditOptionCards)
        // e reutilizamos a função genérica e segura, passando o escopo correto.
        setupOptionCards(editView);
        // --- FIM DA CORREÇÃO ---

        const downloadBtn = document.getElementById('download-leads-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                if(editingBotId) handleDownloadLeads(editingBotId);
            });
        }

        document.getElementById('edit-faq-list').addEventListener('click', handleKnowledgeItemRemove);
        document.getElementById('edit-contacts-list').addEventListener('click', handleKnowledgeItemRemove);      

        isEditViewInitialized = true;
    }

    async function handleEditFormSubmit(event) {
        event.preventDefault();
        
        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner"></span> Salvando...';
        
        try {
            const token = await getAuthToken();
            const botId = document.getElementById('edit-bot-id').value;
            
            let functionValue = document.querySelector('#edit-function-options .option-card.selected')?.dataset.value || 'Suporte ao Cliente';
            if (functionValue === 'Personalizado') {
                functionValue = document.getElementById('edit-bot-function-custom').value.trim();
            }
            
            let toneValue = document.querySelector('#edit-tone-options .option-card.selected')?.dataset.value || 'Amigável';
            let toneCustom = '';
            if (toneValue === 'Personalizado') {
                toneCustom = document.getElementById('edit-bot-tone-custom').value.trim();
            }

            const scheduleDataResult = collectScheduleData('#schedule-modal');
            const scheduleEnabled = scheduleDataResult.enabled;
            const scheduleData = scheduleDataResult.data;
            
            const faqItems = collectFaqDataFromEdit();
            const contactItems = collectContactsDataFromEdit();
            const smartSnoozeEnabled = document.getElementById('edit-smart-snooze-enabled').checked;
            const smartSnoozeMinutes = document.getElementById('edit-smart-snooze-minutes').value || 15;
            const leadCollectionEnabled = document.getElementById('edit-lead-collection-enabled').checked;
            const leadCollectionPrompt = document.getElementById('edit-lead-collection-prompt').value.trim();
            const knowledgeInstructions = document.getElementById('edit-knowledge-instructions').value.trim()
            const agendaEnabled = document.getElementById('edit-agenda-enabled').checked;

            const botData = {
                name: document.getElementById('edit-bot-name').value,
                function_type: functionValue,
                tone_type: toneValue,
                tone_custom_description: toneCustom,
                schedule_enabled: scheduleEnabled,
                schedule_data: JSON.stringify(scheduleData),
                knowledge_faq: JSON.stringify(faqItems),
                knowledge_contacts: JSON.stringify(contactItems),
                knowledge_instructions: knowledgeInstructions,
                smart_snooze_enabled: smartSnoozeEnabled,
                smart_snooze_minutes: parseInt(smartSnoozeMinutes, 10),
                lead_collection_enabled: leadCollectionEnabled,
                lead_collection_prompt: leadCollectionPrompt,
                agenda_enabled: agendaEnabled,              
            };
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(botData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao atualizar o bot.');
            }
            
            showToast('Bot atualizado com sucesso!', 'success');
            await fetchBots();
            showView('dashboard');
            
        } catch (error) {
            console.error('Erro ao atualizar bot:', error);
            showToast(`Erro: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Alterações';
            isEditMode = false;
            editingBotId = null;
        }
    }

    function populateEditFormWithBotData(bot) {
        // --- Preenche o cabeçalho e campos de identidade ---
        document.getElementById('editing-bot-name-header').textContent = bot.name || 'Bot sem nome';
        document.getElementById('edit-bot-id').value = bot.id;
        document.getElementById('edit-bot-name').value = bot.name || '';
        
        const functionOptionsContainer = document.getElementById('edit-function-options');
        const functionCustomTextarea = document.getElementById('edit-bot-function-custom');
        functionOptionsContainer.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        let functionCard = functionOptionsContainer.querySelector(`.option-card[data-value="${bot.function_type}"]`);
        if (functionCard) {
            functionCard.classList.add('selected');
            functionCustomTextarea.style.display = 'none';
            functionCustomTextarea.value = '';
        } else {
            functionCard = functionOptionsContainer.querySelector('.option-card[data-value="Personalizado"]');
            if (functionCard) {
                functionCard.classList.add('selected');
                functionCustomTextarea.style.display = 'block';
                functionCustomTextarea.value = bot.function_type || '';
            }
        }

        const toneOptionsContainer = document.getElementById('edit-tone-options');
        const toneCustomTextarea = document.getElementById('edit-bot-tone-custom');
        toneOptionsContainer.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        let toneCard = toneOptionsContainer.querySelector(`.option-card[data-value="${bot.tone_type}"]`);
        if (toneCard) {
            toneCard.classList.add('selected');
            toneCustomTextarea.style.display = bot.tone_type === 'Personalizado' ? 'block' : 'none';
            toneCustomTextarea.value = bot.tone_custom_description || '';
        }
        
        // --- Preenche a Base de Conhecimento (INCLUINDO "OUTRAS INSTRUÇÕES") ---
        const instructionsTextarea = document.getElementById('edit-knowledge-instructions');
        instructionsTextarea.value = bot.knowledge_instructions || '';
        instructionsTextarea.style.display = 'block'; // Garante que o campo esteja sempre visível

        populateEditFAQ(bot.knowledge_faq || []);
        populateEditFiles(bot.knowledge_files || []);
        
        // --- Preenche a Sidebar de Operações ---
        const leadEnabledCheckbox = document.getElementById('edit-lead-collection-enabled');
        const leadDetails = document.getElementById('edit-lead-collection-details');
        const leadPromptTextarea = document.getElementById('edit-lead-collection-prompt');

        // Define o valor do textarea com o texto do bot ou o padrão
        leadPromptTextarea.value = bot.lead_collection_prompt || 'Olá! Para podermos iniciar, poderia me dizer como você nos encontrou? (Ex: Instagram, Google, Indicação)';
        
        // Define o estado do toggle
        leadEnabledCheckbox.checked = bot.lead_collection_enabled || false;
        // Mostra ou esconde o container com base no estado do toggle
        leadDetails.style.display = leadEnabledCheckbox.checked ? 'block' : 'none';

        const snoozeEnabledCheckbox = document.getElementById('edit-smart-snooze-enabled');
        const snoozeDetails = document.getElementById('edit-smart-snooze-details');
        snoozeEnabledCheckbox.checked = bot.smart_snooze_enabled || false;
        snoozeDetails.style.display = snoozeEnabledCheckbox.checked ? 'block' : 'none';
        document.getElementById('edit-smart-snooze-minutes').value = bot.smart_snooze_minutes || 15;
        document.getElementById('edit-agenda-enabled').checked = bot.agenda_enabled || false;

        populateEditContacts(bot.knowledge_contacts || []);

        // --- Preenche os dados de Horário (código anterior já estava correto) ---
        const dayMapPtToEn = { 'segunda': 'monday', 'terca': 'tuesday', 'quarta': 'wednesday', 'quinta': 'thursday', 'sexta': 'friday', 'sabado': 'saturday', 'domingo': 'sunday' };
        const scheduleEnabled = bot.schedule_enabled || false;
        document.getElementById('schedule-status-text').textContent = scheduleEnabled ? 'Horários personalizados ativos.' : 'Sem restrição, sempre ativo';
        document.getElementById('modal-schedule-enabled').checked = scheduleEnabled;
        document.getElementById('modal-schedule-details').style.display = scheduleEnabled ? 'block' : 'none';
        let scheduleData = [];
        try { scheduleData = Array.isArray(bot.schedule_data) ? bot.schedule_data : JSON.parse(bot.schedule_data || '[]'); } catch (e) { console.error('Erro no parse do schedule_data:', e); }
        if (scheduleData.length > 0) {
            scheduleData.forEach((dayData) => {
                const dayInEnglish = dayMapPtToEn[dayData.day.toLowerCase()];
                if (!dayInEnglish) return;
                const dayElement = document.querySelector(`#modal-schedule-details .schedule-day[data-day="${dayInEnglish}"]`);
                if (!dayElement) return;
                const toggle = dayElement.querySelector('input[type="checkbox"]');
                if (toggle) {
                    toggle.checked = dayData.active;
                    updateDayScheduleState(dayElement);
                }
                const openTimeInput = dayElement.querySelector('input[type="time"]:first-of-type');
                const closeTimeInput = dayElement.querySelector('input[type="time"]:last-of-type');
                if (dayData.active) {
                    if (openTimeInput) openTimeInput.value = dayData.open;
                    if (closeTimeInput) closeTimeInput.value = dayData.close;
                }
            });
        }
    }

    function addEditFaqItem(question = '', answer = '') {
        const faqList = document.getElementById('edit-faq-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        item.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Pergunta" value="${question}" maxlength="100">
                <input type="text" placeholder="Resposta" value="${answer}" maxlength="300">
            </div>
            <button type="button" class="remove-btn">×</button>
        `;
        faqList.appendChild(item);
        updateAddButtonState('edit-faq-list', 'edit-add-faq', 5);
    }

    function addEditContactItem(sector = '', contact = '') {
        const contactsList = document.getElementById('edit-contacts-list');
        const item = document.createElement('div');
        item.className = 'knowledge-item';
        item.innerHTML = `
            <input type="text" placeholder="Para quem encaminhar?" value="${sector}" maxlength="30" style="flex-basis: 200px; flex-shrink: 0;">
            <input type="text" placeholder="Telefone, e-mail ou link de contato" value="${contact}" maxlength="100" style="flex-grow: 1;">
            <button type="button" class="remove-btn">×</button>
        `;
        contactsList.appendChild(item);
        updateAddButtonState('edit-contacts-list', 'edit-add-contact', 5);
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
    
    function handleKnowledgeItemRemove(event) {
        // Verifica se o elemento clicado foi um botão de remover
        const removeButton = event.target.closest('.remove-btn');
        if (!removeButton) {
            return; // Se não foi, não faz nada
        }

        const list = event.currentTarget; // O `currentTarget` é a lista (ul/div) onde o listener está
        const itemToRemove = removeButton.closest('.knowledge-item');

        if (list && itemToRemove) {
            // 1. Remove o item da tela
            itemToRemove.remove();

            // 2. Reavalia o estado do botão "Adicionar" com base no ID da lista
            if (list.id === 'faq-list') {
                updateAddButtonState('faq-list', 'add-faq', 5);
            } else if (list.id === 'contacts-list') {
                updateAddButtonState('contacts-list', 'add-contact', 5);
            } else if (list.id === 'edit-faq-list') {
                updateAddButtonState('edit-faq-list', 'edit-add-faq', 5);
            } else if (list.id === 'edit-contacts-list') {
                updateAddButtonState('edit-contacts-list', 'edit-add-contact', 5);
            }
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
    

    function populateEditFAQ(faqs) {
        const faqList = document.getElementById('edit-faq-list');
        faqList.innerHTML = '';
        
        faqs.forEach(faq => {
            addEditFaqItem(faq.question, faq.answer);
            updateAddButtonState('edit-faq-list', 'edit-add-faq', 5);
        });
    }

    function populateEditContacts(contacts) {
        const contactsList = document.getElementById('edit-contacts-list');
        contactsList.innerHTML = '';
        
        contacts.forEach(contact => {
            addEditContactItem(contact.sector, contact.contact);
            updateAddButtonState('edit-contacts-list', 'edit-add-contact', 5);
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
            <button type="button" class="remove-btn">×</button>
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
                //if (diffDays > 3) {
                //    diffDays = 3;
                //}
                
                text = `Plano atual: Grátis (acaba em ${diffDays} dia${diffDays > 1 ? 's' : ''})`;
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
        console.log('🔧 Versão: Estrutura Estável v1.0');
        
        appLoading.classList.remove('hidden');
        console.log('⏳ Aguardando estado de autenticação...');
        
        Object.values(views).forEach(view => view.classList.remove('active'));
        elements.header.style.display = 'none';
        
        // Configura apenas os listeners globais que existem em todas as telas
        setupEventListeners();
        setupThemeToggle();
        setupPricingToggle();
        setupNavigation();
        setupPlanButtons();
        setupAgendaModalListeners();
        setupCalendarListeners();

        
        // As inicializações do Wizard e da tela de Edição foram REMOVIDAS daqui
        // para serem chamadas pela função showView.
        
        auth.onAuthStateChanged((user) => {
            console.log('🔐 Estado de autenticação DEFINIDO:', user ? `Logado: ${user.email}` : 'Não logado');
            handleAuthStateChange(user);
        });
        
        console.log('✅ Inicialização configurada. App aguardando autenticação...');      
    }

    function setupNavigation() {
        const navContainer = document.querySelector('.header-nav');
        if (!navContainer) return;

        navContainer.addEventListener('click', (e) => {
            e.preventDefault();
            const targetLink = e.target.closest('a.nav-link');
            if (!targetLink) return;

            const linkText = targetLink.textContent.trim();
            let viewToShow = 'dashboard'; 

            // Lógica atualizada para incluir Agendas
            if (linkText === 'Planos') {
                viewToShow = 'plans';
            } else if (linkText === 'Agendas') { // <-- NOVA CONDIÇÃO
                viewToShow = 'agendas';
            } else if (linkText === 'Painel') {
                viewToShow = 'dashboard';
            }
            
            navContainer.querySelectorAll('a.nav-link').forEach(link => link.classList.remove('active'));
            targetLink.classList.add('active');

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