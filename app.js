document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURAÇÕES E ELEMENTOS GLOBAIS ---
    const firebaseConfig = {
        apiKey: "AIzaSyD6KF1OxewXN1gI81Lsm9i82bkps1UxwJ8",
        authDomain: "facilchat-auth.firebaseapp.com",
        projectId: "facilchat-auth",
        storageBucket: "facilchat-auth.appspot.com",
        messagingSenderId: "473078468134",
        appId: "1:473078468134:web:b74df1f1461093bab920e7"
    };
    const API_BASE_URL = 'https://facilchat-backend-production.up.railway.app';
    
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();
    
    let socket;
    let userBots = [];
    const daysOfWeek = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

    // --- SELEÇÃO DE ELEMENTOS DO HTML ---
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const botsListDiv = document.getElementById('bots-list');
    const createBotForm = document.getElementById('create-bot-form');
    const qrModal = document.getElementById('qr-modal');
    const editModal = document.getElementById('edit-modal');
    const editBotForm = document.getElementById('edit-bot-form');
    const scheduleEnabledToggle = document.getElementById('schedule-enabled-toggle');
    const scheduleDetailsContainer = document.getElementById('schedule-details-container');
    const faqListContainer = document.getElementById('faq-list-container');
    const addFaqBtn = document.getElementById('add-faq-btn');
    const contactsListContainer = document.getElementById('contacts-list-container');
    const addContactBtn = document.getElementById('add-contact-btn');
    const filesListContainer = document.getElementById('files-list-container');
    const uploadSection = document.getElementById('upload-section');
    const fileUploadInput = document.getElementById('file-upload-input');
    const uploadProgressIndicator = document.getElementById('upload-progress-indicator');


    // --- FUNÇÃO DE INICIALIZAÇÃO ---
    function initializeApp() {
        generateScheduleHTML();
        setupEventListeners();
        auth.onAuthStateChanged(handleAuthStateChange);
    }

    // --- SETUP DE EVENT LISTENERS ---
    function setupEventListeners() {
        document.getElementById('login-google').addEventListener('click', () => auth.signInWithPopup(provider).catch(console.error));
        document.getElementById('logout').addEventListener('click', () => auth.signOut());
        
        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                qrModal.style.display = 'none';
                editModal.style.display = 'none';
            });
        });

        document.getElementById('show-create-form-btn').addEventListener('click', () => {
            botsListDiv.style.display = 'none';
            document.getElementById('show-create-form-btn').style.display = 'none';
            document.getElementById('create-bot-section').style.display = 'block';
        });

        document.getElementById('cancel-create-btn').addEventListener('click', () => {
            document.getElementById('create-bot-section').style.display = 'none';
            botsListDiv.style.display = 'flex';
            document.getElementById('show-create-form-btn').style.display = 'inline-flex';
        });

        document.getElementById('bot-tone').addEventListener('change', e => {
            document.getElementById('bot-tone-custom').style.display = (e.target.value === 'Personalizado') ? 'block' : 'none';
        });

        document.getElementById('edit-bot-tone').addEventListener('change', e => {
            document.getElementById('edit-bot-tone-custom').style.display = (e.target.value === 'Personalizado') ? 'block' : 'none';
        });
        
        createBotForm.addEventListener('submit', handleCreateBot);
        editBotForm.addEventListener('submit', handleUpdateBot);
        botsListDiv.addEventListener('click', handleBotActionClick);
        scheduleEnabledToggle.addEventListener('change', () => {
            scheduleDetailsContainer.style.display = scheduleEnabledToggle.checked ? 'block' : 'none';
        });

        addFaqBtn.addEventListener('click', () => addFaqItem());
        addContactBtn.addEventListener('click', () => addContactItem());
        
        editModal.addEventListener('click', (event) => {
            const removeButton = event.target.closest('.btn-remove-item');
            if (!removeButton) return;
            
            const knowledgeItem = removeButton.closest('.knowledge-item');
            if (knowledgeItem) {
                knowledgeItem.remove();
                return;
            }
            
            const fileItem = removeButton.closest('.file-item');
            if (fileItem) {
                const botId = document.getElementById('edit-bot-id').value;
                const fileId = fileItem.dataset.fileId;
                handleDeleteFile(botId, fileId, fileItem);
            }
        });
        
        fileUploadInput.addEventListener('change', handleFileUpload);
    }

    // --- LÓGICA PRINCIPAL (AUTENTICAÇÃO, FETCH, RENDER, ETC.) ---
    function handleAuthStateChange(user) {
        if (user) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            document.getElementById('user-email').textContent = user.email;
            syncUserWithBackend();
            fetchBots();
            initializeSocket();
        } else {
            loginContainer.style.display = 'block';
            appContainer.style.display = 'none';
            if (socket) socket.disconnect();
        }
    }

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

    async function fetchBots() {
        botsListDiv.innerHTML = '<p class="loading-bots">Carregando seus assistentes...</p>';
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar os bots.');
            userBots = await response.json();
            renderBots();
        } catch (error) {
            console.error("Erro em fetchBots:", error);
            botsListDiv.innerHTML = '<p style="color: #F87171;">Não foi possível carregar seus assistentes.</p>';
        }
    }

    function renderBots() {
        if (userBots.length === 0) {
            botsListDiv.innerHTML = '<div class="card" style="text-align: center;"><p>Você ainda não tem assistentes. Que tal criar um no botão acima?</p></div>';
            return;
        }
        botsListDiv.innerHTML = '';
        userBots.forEach(bot => {
            const botItem = document.createElement('div');
            botItem.className = 'card bot-item';
            botItem.setAttribute('data-bot-id', bot.id);
            let statusText = 'Offline';
            let statusButtonsHTML = `<button data-action="connect" class="btn-success">Conectar</button>`;
            switch (bot.status) {
                case 'online':
                    statusText = 'Online';
                    statusButtonsHTML = `<button data-action="pause" class="btn-warning">Pausar</button><button data-action="disconnect" class="btn-danger">Desconectar</button>`;
                    break;
                case 'paused':
                    statusText = 'Pausado';
                    statusButtonsHTML = `<button data-action="resume" class="btn-success">Retomar</button><button data-action="disconnect" class="btn-danger">Desconectar</button>`;
                    break;
                case 'connecting':
                    statusText = 'Conectando...';
                    statusButtonsHTML = `<button disabled>Aguarde...</button>`;
                    break;
            }
            const botHTML = `<div class="bot-header"><div class="bot-title"><span class="status-indicator ${bot.status}" title="${statusText}"></span><h3>${bot.name}</h3></div><div class="bot-actions">${statusButtonsHTML}<button data-action="config" class="btn-secondary">Configurações</button><button data-action="delete" class="btn-danger">Deletar</button></div></div>`;
            botItem.innerHTML = botHTML;
            botsListDiv.appendChild(botItem);
        });
    }

    async function handleCreateBot(event) {
        event.preventDefault();
        const submitButton = createBotForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Salvando...';
        const botData = {
            name: document.getElementById('bot-name').value,
            function_type: document.getElementById('bot-function').value,
            tone_type: document.getElementById('bot-tone').value,
            tone_custom_description: document.getElementById('bot-tone-custom').value
        };
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(botData)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao criar o bot.');
            }
            createBotForm.reset();
            document.getElementById('bot-tone-custom').style.display = 'none';
            document.getElementById('cancel-create-btn').click();
            await fetchBots();
        } catch (error) {
            console.error("Erro ao criar bot:", error);
            alert(`Erro: ${error.message}`);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar e Continuar';
        }
    }
    
    // --- LÓGICA DE AÇÕES DO BOT ---
    function handleBotActionClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (!action) return;
        const botItem = button.closest('.bot-item');
        const botId = botItem.dataset.botId;

        const actions = {
            'connect': handleConnect,
            'disconnect': handleDisconnect,
            'pause': botId => setBotStatus(botId, 'paused'),
            'resume': botId => setBotStatus(botId, 'online'),
            'delete': handleDeleteBot,
            'config': openSettingsModal
        };
        if (actions[action]) {
            actions[action](botId);
        }
    }
    function openSettingsModal(botId) {
        const bot = userBots.find(b => b.id == botId);
        if (!bot) return alert('Bot não encontrado!');
        
        // 1. Preenche a Identidade
        document.getElementById('edit-bot-id').value = bot.id;
        document.getElementById('edit-bot-name').value = bot.name || '';
        document.getElementById('edit-bot-function').value = bot.function_type || 'Suporte ao Cliente';
        document.getElementById('edit-bot-tone').value = bot.tone_type || 'Amigável';
        const customToneTextarea = document.getElementById('edit-bot-tone-custom');
        customToneTextarea.value = bot.tone_custom_description || '';
        customToneTextarea.style.display = (bot.tone_type === 'Personalizado') ? 'block' : 'none';
        
        // 2. Preenche o Horário de Atendimento
        scheduleEnabledToggle.checked = bot.schedule_enabled || false;
        scheduleDetailsContainer.style.display = bot.schedule_enabled ? 'block' : 'none';
        const scheduleData = bot.schedule_data || []; // A API já envia um array.
        daysOfWeek.forEach(day => {
            const dayData = scheduleData.find(d => d.day === day) || { active: false, open: '09:00', close: '18:00' };
            document.getElementById(`schedule-${day}-toggle`).checked = dayData.active;
            document.getElementById(`schedule-${day}-open`).value = dayData.open;
            document.getElementById(`schedule-${day}-close`).value = dayData.close;
            const dayElement = document.getElementById(`schedule-day-${day}`);
            if (dayData.active) {
                dayElement.classList.remove('disabled');
            } else {
                dayElement.classList.add('disabled');
            }
        });

        // 3. Preenche a Base de Conhecimento
        faqListContainer.innerHTML = '';
        const faqs = bot.knowledge_faq || []; // A API já envia um array. Se não houver, usa um array vazio.
        if (faqs.length > 0) {
            faqs.forEach(faq => addFaqItem(faq.question, faq.answer));
        }

        contactsListContainer.innerHTML = '';
        const contacts = bot.knowledge_contacts || []; // A API já envia um array.
        if (contacts.length > 0) {
            contacts.forEach(contact => addContactItem(contact.sector, contact.contact));
        }

        // 4. Preenche a Lista de Arquivos
        filesListContainer.innerHTML = '';
        if (bot.knowledge_files && bot.knowledge_files.length > 0) {
            bot.knowledge_files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.dataset.fileId = file.id;
                fileItem.innerHTML = `<div class="file-info"><span>📄</span><span>${file.file_name}</span></div><button type="button" class="btn-remove-item btn-danger">×</button>`;
                filesListContainer.appendChild(fileItem);
            });
        }
        
        if (bot.knowledge_files && bot.knowledge_files.length >= 3) {
            uploadSection.style.display = 'none';
        } else {
            uploadSection.style.display = 'block';
        }
        uploadProgressIndicator.style.display = 'none';

        editModal.style.display = 'flex';
    }

    async function handleUpdateBot(event) {
        event.preventDefault();
        const submitButton = editBotForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Salvando...';

        const botId = document.getElementById('edit-bot-id').value;
        
        const botData = {
            name: document.getElementById('edit-bot-name').value,
            function_type: document.getElementById('edit-bot-function').value,
            tone_type: document.getElementById('edit-bot-tone').value,
            tone_custom_description: document.getElementById('edit-bot-tone-custom').value,
            schedule_enabled: document.getElementById('schedule-enabled-toggle').checked,
            schedule_data: JSON.stringify(daysOfWeek.map(day => ({
                day: day,
                active: document.getElementById(`schedule-${day}-toggle`).checked,
                open: document.getElementById(`schedule-${day}-open`).value,
                close: document.getElementById(`schedule-${day}-close`).value
            }))),
            knowledge_faq: JSON.stringify(Array.from(document.querySelectorAll('#faq-list-container .knowledge-item')).map(item => ({
                question: item.querySelector('input[placeholder="Pergunta"]').value,
                answer: item.querySelector('input[placeholder="Resposta"]').value
            }))),
            knowledge_contacts: JSON.stringify(Array.from(document.querySelectorAll('#contacts-list-container .knowledge-item')).map(item => ({
                sector: item.querySelector('input[placeholder="Setor"]').value,
                contact: item.querySelector('input[placeholder="Contato (telefone ou e-mail)"]').value
            })))
        };

        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(botData)
            });
            if (!response.ok) throw new Error('Falha ao atualizar o bot.');
            
            editModal.style.display = 'none';
            await fetchBots();
        } catch (error) {
            console.error('Erro ao atualizar bot:', error);
            alert('Não foi possível salvar as alterações.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Alterações';
        }
    }

    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert("O arquivo é muito grande. O limite é de 10MB.");
            return;
        }

        const botId = document.getElementById('edit-bot-id').value;
        uploadSection.style.display = 'none';
        uploadProgressIndicator.style.display = 'block';

        try {
            const token = await getAuthToken();
            const fileContentBase64 = await toBase64(file);
            
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    fileContent: fileContentBase64,
                    fileType: file.type,
                    fileName: file.name
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Falha ao processar o documento.");
            }

            alert('Documento processado com sucesso!');
            await fetchBots();
            const updatedBot = userBots.find(b => b.id == botId);
            if (updatedBot) {
                openSettingsModal(updatedBot.id);
            } else {
                editModal.style.display = 'none';
            }
            
        } catch (error) {
            console.error("Erro no upload:", error);
            alert(`Erro: ${error.message}`);
        } finally {
            event.target.value = '';
            uploadProgressIndicator.style.display = 'none';
        }
    }
    
    async function handleDeleteFile(botId, fileId, fileItemElement) {
        if (!confirm(`Tem certeza que deseja deletar o arquivo "${fileItemElement.querySelector('.file-info span:last-child').textContent}"?`)) return;
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/files/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao deletar o arquivo.');
            
            fileItemElement.remove();
            uploadSection.style.display = 'block';
            await fetchBots();

        } catch (error) {
            console.error('Erro ao deletar arquivo:', error);
            alert(error.message);
        }
    }

    // --- FUNÇÕES HELPER ---
    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    function addFaqItem(question = '', answer = '') {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'knowledge-item';
        itemDiv.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Pergunta" value="${question}">
                <input type="text" placeholder="Resposta" value="${answer}">
            </div>
            <button type="button" class="btn-remove-item btn-danger">×</button>
        `;
        faqListContainer.appendChild(itemDiv);
    }

    function addContactItem(sector = '', contact = '') {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'knowledge-item';
        itemDiv.innerHTML = `
            <div class="knowledge-item-inputs">
                <input type="text" placeholder="Setor" value="${sector}">
                <input type="text" placeholder="Contato (telefone ou e-mail)" value="${contact}">
            </div>
            <button type="button" class="btn-remove-item btn-danger">×</button>
        `;
        contactsListContainer.appendChild(itemDiv);
    }
    
    function generateScheduleHTML() {
        let html = '';
        daysOfWeek.forEach(day => {
            const capitalizedDay = day.charAt(0).toUpperCase() + day.slice(1);
            html += `
                <div class="schedule-day disabled" id="schedule-day-${day}">
                    <label class="switch">
                        <input type="checkbox" id="schedule-${day}-toggle">
                        <span class="slider round"></span>
                    </label>
                    <span class="schedule-day-label">${capitalizedDay}</span>
                    <div class="schedule-day-inputs">
                        <input type="time" id="schedule-${day}-open" value="09:00">
                        <span>às</span>
                        <input type="time" id="schedule-${day}-close" value="18:00">
                    </div>
                </div>
            `;
        });
        scheduleDetailsContainer.innerHTML = html;

        daysOfWeek.forEach(day => {
            document.getElementById(`schedule-${day}-toggle`).addEventListener('change', (e) => {
                const dayElement = document.getElementById(`schedule-day-${day}`);
                if (e.target.checked) {
                    dayElement.classList.remove('disabled');
                } else {
                    dayElement.classList.add('disabled');
                }
            });
        });
    }

    async function handleConnect(botId) {
        document.getElementById('qr-status').textContent = 'Iniciando conexão...';
        document.getElementById('qrcode-container').innerHTML = '';
        qrModal.style.display = 'flex';
        try {
            const token = await getAuthToken();
            await fetch(`${API_BASE_URL}/api/bots/${botId}/connect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error(error);
            alert('Erro ao iniciar a conexão.');
            qrModal.style.display = 'none';
        }
    }

    async function handleDisconnect(botId) {
        if (!confirm("Tem certeza que deseja desconectar este bot?")) return;
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/disconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao desconectar o bot.');
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    }

    async function setBotStatus(botId, status) {
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status })
            });
            if (!response.ok) throw new Error(`Falha ao alterar o status para ${status}.`);
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    }

    async function handleDeleteBot(botId) {
        if (!confirm("CUIDADO: Deletar um assistente é uma ação permanente e irá apagar todos os seus dados e histórico. Deseja continuar?")) {
            return;
        }
        try {
            const token = await getAuthToken();
            const response = await fetch(`${API_BASE_URL}/api/bots/${botId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao deletar o bot.');
            await fetchBots();
        } catch (error) {
            console.error("Erro ao deletar bot:", error);
            alert(error.message);
        }
    }

    function initializeSocket() {
        if (socket && socket.connected) return;
        socket = io(API_BASE_URL, { transports: ['websocket'] });
        socket.on("connect", () => console.log("✅ Conectado ao servidor via WebSocket!"));
        socket.on("qr_code", (data) => {
            document.getElementById('qr-status').textContent = 'Escaneie com seu WhatsApp!';
            document.getElementById('qrcode-container').innerHTML = "";
            new QRCode(document.getElementById('qrcode-container'), data.qrString);
        });
        socket.on("client_ready", (data) => {
            document.getElementById('qr-status').textContent = "Conectado com sucesso! ✅";
            setTimeout(() => {
                qrModal.style.display = 'none';
            }, 2000);
        });
        socket.on("bot_status_changed", (data) => {
            const bot = userBots.find(b => b.id == data.botId);
            if (bot) {
                bot.status = data.status;
                renderBots();
            }
        });
        socket.on('connect_error', (err) => console.error('Falha na conexão do WebSocket:', err.message));
    }
    
    // Inicia a aplicação
    initializeApp();
});