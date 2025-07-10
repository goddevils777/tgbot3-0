// Переменные состояния
let currentSessionData = null;
let allSessions = [];

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Загружаем информацию о текущей сессии
    await loadCurrentSession();
    
    // Загружаем список всех сессий
    await loadAllSessions();
    
    // Настраиваем обработчики событий
    setupEventHandlers();
});

// Загрузка информации о текущей сессии
async function loadCurrentSession() {
    try {
        const response = await fetch('/api/current-session');
        const data = await response.json();
        
        if (data.success) {
            displayCurrentSession(data.session);
        } else {
            displayCurrentSession(null);
        }
    } catch (error) {
        console.error('Ошибка загрузки текущей сессии:', error);
        document.getElementById('currentSession').innerHTML = 
            '<div class="session-loading">Ошибка загрузки информации о сессии</div>';
    }
}

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

// Добавление новой сессии
async function addNewSession() {
    const sessionName = document.getElementById('sessionName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    if (!sessionName) {
        alert('Введите название сессии');
        return;
    }
    
    if (!phoneNumber) {
        alert('Введите номер телефона');
        return;
    }
    
    // Проверяем формат номера телефона
    if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
        alert('Введите корректный номер телефона');
        return;
    }
    
    try {
        const addBtn = document.getElementById('addSessionBtn');
        addBtn.disabled = true;
        addBtn.textContent = 'Создание сессии...';
        
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
            alert('Сессия успешно создана!');
            
            // Очищаем форму
            document.getElementById('sessionName').value = '';
            document.getElementById('phoneNumber').value = '';
            
            // Перезагружаем списки
            await loadCurrentSession();
            await loadAllSessions();
        } else {
            alert(`Ошибка создания сессии: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    } finally {
        const addBtn = document.getElementById('addSessionBtn');
        addBtn.disabled = false;
        addBtn.textContent = 'Добавить сессию';
    }
}

// Переключение на другую сессию
async function switchSession(sessionId) {
    if (!confirm('Переключиться на другую сессию? Текущая сессия будет отключена.')) {
        return;
    }
    
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
            alert('Сессия успешно переключена!');
            await loadCurrentSession();
            await loadAllSessions();
        } else {
            alert(`Ошибка переключения: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    }
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
            alert('Сессия успешно удалена!');
            await loadAllSessions();
        } else {
            alert(`Ошибка удаления: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Настройка обработчиков событий
function setupEventHandlers() {
    document.getElementById('addSessionBtn').addEventListener('click', addNewSession);
}