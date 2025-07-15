// Переменные состояния
let currentSessionData = null;
let allSessions = [];

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {

    
    // Загружаем список всех сессий
    await loadAllSessions();
    
    // Загружаем заявки пользователя
    await loadUserRequests();
    
    // Настраиваем обработчики событий
    setupEventHandlers();
});



// Отображение текущей сессии
function displayCurrentSession(session) {
    const currentSessionDiv = document.getElementById('currentSession');
    
    if (!session) {
        currentSessionDiv.innerHTML = `
            <div class="session-loading">
                Нет активной сессии. Добавьте новую сессию ниже.
            </div>
        `;
        return;
    }
    
    currentSessionDiv.innerHTML = `
        <div class="session-header">
            <span class="session-name">${session.name || 'Основная сессия'}</span>
            <span class="session-status status-active">Активна</span>
        </div>
        <div class="session-info">
            <span>Телефон: ${session.phone || 'Не указан'}</span>
            <span>Подключена: ${session.connectedAt || 'Неизвестно'}</span>
        </div>
    `;
}

// Загрузка списка всех сессий
async function loadAllSessions() {
    try {
        const response = await fetch('/api/sessions');
        const data = await response.json();
        
        if (data.success) {
            allSessions = data.sessions;
            displayAllSessions(allSessions);
        }
    } catch (error) {
        console.error('Ошибка загрузки сессий:', error);
        document.getElementById('sessionsList').innerHTML = 
            '<div class="sessions-loading">Ошибка загрузки списка сессий</div>';
    }
}

// Отображение всех сессий
function displayAllSessions(sessions) {
    const sessionsListDiv = document.getElementById('sessionsList');
    
    if (sessions.length === 0) {
        sessionsListDiv.innerHTML = '<div class="sessions-loading">Нет сохраненных сессий</div>';
        return;
    }
    
    sessionsListDiv.innerHTML = sessions.map(session => `
        <div class="session-item">
            <div class="session-header">
                <span class="session-name">${session.name}</span>
                <span class="session-status ${session.isActive ? 'status-active' : 'status-inactive'}">
                    ${session.isActive ? 'Активна' : 'Неактивна'}
                </span>
            </div>
            <div class="session-info">
                <span>Телефон: ${session.phone}</span>
                <span>Создана: ${session.createdAt}</span>
            </div>
            <div class="session-actions">
                ${!session.isActive ? `<button class="switch-session-btn" onclick="switchSession('${session.id}')">Переключиться</button>` : ''}
                <button class="delete-session-btn" onclick="deleteSession('${session.id}')">Удалить</button>
            </div>
        </div>
    `).join('');
}



// Переключение на другую сессию
async function switchSession(sessionId) {
    
    showConfirm('Переключиться на другую сессию? Текущая сессия будет отключена.', async () => {
        try {
            const response = await fetch('/api/switch-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                notify.success('Сессия успешно переключена!');
                await loadCurrentSession();
                await loadAllSessions();
            } else {
                notify.error(`Ошибка переключения: ${data.error}`);
            }
        } catch (error) {
            notify.error(`Ошибка соединения: ${error.message}`);
        }
    });
}

// Удаление сессии
async function deleteSession(sessionId) {
    if (!confirm('Удалить эту сессию? Это действие необратимо.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.success('Сессия успешно удалена!');
            await loadAllSessions();
        } else {
            notify.error(`Ошибка удаления: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Настройка обработчиков событий
function setupEventHandlers() {
    document.getElementById('createRequestBtn').addEventListener('click', createRequest);
}

// Создание заявки на подключение аккаунта
async function createRequest() {
    const sessionName = document.getElementById('sessionName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    if (!sessionName) {
        notify.success('Введите название сессии');
        return;
    }
    
    if (!phoneNumber) {
        notify.success('Введите номер телефона');
        return;
    }
    
    // Проверяем формат номера телефона
    const cleanPhone = phoneNumber.replace(/\s/g, '');
    if (!cleanPhone.match(/^\+?[1-9]\d{1,14}$/)) {
        notify.success('Введите корректный номер телефона');
        return;
    }
    
    try {
        const createBtn = document.getElementById('createRequestBtn');
        createBtn.disabled = true;
        createBtn.textContent = 'Отправляем заявку...';
        
        const response = await fetch('/api/create-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionName: sessionName,
                phoneNumber: phoneNumber
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.success(`Заявка создана!\nВаш ID: ${data.requestId}\n\nСвяжитесь с менеджером в Telegram: @support_manager\nСообщите ваш ID: ${data.requestId}`);
            
            // Очищаем форму
            document.getElementById('sessionName').value = '';
            document.getElementById('phoneNumber').value = '';
            
            // Перезагружаем список заявок
            await loadUserRequests();
        } else {
            notify.error(`Ошибка создания заявки: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    } finally {
        const createBtn = document.getElementById('createRequestBtn');
        createBtn.disabled = false;
        createBtn.textContent = 'Отправить заявку';
    }
}

// Загрузка заявок пользователя
async function loadUserRequests() {
    try {
        const response = await fetch('/api/my-requests');
        const data = await response.json();
        
        if (data.success) {
            displayUserRequests(data.requests);
        }
    } catch (error) {
        console.error('Ошибка загрузки заявок:', error);
        document.getElementById('requestsList').innerHTML = 
            '<div class="requests-loading">Ошибка загрузки заявок</div>';
    }
}

// Отображение заявок пользователя
function displayUserRequests(requests) {
    const requestsListDiv = document.getElementById('requestsList');
    
    if (requests.length === 0) {
        requestsListDiv.innerHTML = '<div class="requests-loading">У вас пока нет заявок</div>';
        return;
    }
    
    const statusTexts = {
        'pending': 'Ожидает обработки',
        'processing': 'В обработке',
        'completed': 'Выполнена',
        'rejected': 'Отклонена'
    };
    
    requestsListDiv.innerHTML = requests.map(request => `
        <div class="request-item">
            <div class="request-header">
                <span class="request-id">ID: ${request.id}</span>
                <span class="request-status status-${request.status}">
                    ${statusTexts[request.status] || request.status}
                </span>
            </div>
            <div class="request-info">
                <span>Сессия: ${request.sessionName}</span>
                <span>•</span>
                <span>Телефон: ${request.phoneNumber}</span>
                <span>•</span>
                <span>Создана: ${new Date(request.createdAt).toLocaleString('ru-RU')}</span>
            </div>
            ${request.notes ? `<div class="request-notes">Примечание: ${request.notes}</div>` : ''}
        </div>
    `).join('');
}
// Загрузка файла сессии
async function uploadSessionFile() {
    const fileInput = document.getElementById('sessionFile');
    const sessionNameInput = document.getElementById('sessionName');
    
    const file = fileInput.files[0];
    const sessionName = sessionNameInput.value.trim();
    
    if (!file) {
        notify.warning('Выберите файл сессии');
        return;
    }
    
    if (!sessionName) {
        notify.warning('Введите название сессии');
        return;
    }
    
    try {
        const uploadBtn = document.getElementById('uploadSessionBtn');
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Загружаем...';
        
        const formData = new FormData();
        formData.append('sessionFile', file);
        formData.append('sessionName', sessionName);
        
        const response = await fetch('/api/upload-session', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.success('Сессия успешно загружена!');
            
            // Очищаем форму
            fileInput.value = '';
            sessionNameInput.value = '';
            
            // Перезагружаем списки
            await loadCurrentSession();
            await loadAllSessions();
        } else {
            notify.error(`Ошибка загрузки: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    } finally {
        const uploadBtn = document.getElementById('uploadSessionBtn');
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Загрузить сессию';
    }
}

// Добавление новой сессии
async function addNewSession() {
    const sessionName = document.getElementById('sessionName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    if (!sessionName) {
        notify.warning('Введите название сессии');
        return;
    }
    
    if (!phoneNumber) {
        notify.warning('Введите номер телефона');
        return;
    }
    
    // Проверяем формат номера телефона
    if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
        notify.warning('Введите корректный номер телефона');
        return;
    }
    
    try {
        const addBtn = document.getElementById('addSessionBtn');
        addBtn.disabled = true;
        addBtn.textContent = 'Создание сессии...';
        
        notify.info('Перейдите в терминал сервера для ввода SMS кода!');
        
        const response = await fetch('/api/add-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: sessionName,
                phone: phoneNumber
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.error(`Ошибка создания сессии: ${data.error}`);
            
            // Очищаем форму
            document.getElementById('sessionName').value = '';
            document.getElementById('phoneNumber').value = '';
            
            // Перезагружаем списки
            await loadCurrentSession();
            await loadAllSessions();
        } else {
            notify.error(`Ошибка создания сессии: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    } finally {
        const addBtn = document.getElementById('addSessionBtn');
        addBtn.disabled = false;
        addBtn.textContent = 'Создать сессию';
    }
}