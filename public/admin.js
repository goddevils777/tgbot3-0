// Переменные состояния
let allRequests = [];
let currentRequestId = null;

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserInfo();
    await loadAdminRequests();
    setupEventHandlers();
});

// Загрузка информации о пользователе
async function loadUserInfo() {
    try {
        const response = await fetch('/api/user-info');
        const data = await response.json();
        
        const userInfoDiv = document.getElementById('userInfo');
        
        if (data.success && data.user) {
            userInfoDiv.innerHTML = `👤 ${data.user.login} (Админ)`;
            userInfoDiv.className = 'session-info';
        } else {
            userInfoDiv.innerHTML = '👤 Нет доступа';
            userInfoDiv.className = 'session-info no-session';
            // Перенаправляем на главную если нет доступа
            setTimeout(() => window.location.href = '/', 2000);
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о пользователе:', error);
        document.getElementById('userInfo').innerHTML = '👤 Ошибка';
    }
}

// Загрузка заявок для админа
async function loadAdminRequests() {
    try {
        const response = await fetch('/api/admin/requests');
        const data = await response.json();
        
        if (data.success) {
            allRequests = data.requests;
            updateStats();
            displayAdminRequests(allRequests);
        } else {
            if (data.error === 'Нет доступа') {
                alert('У вас нет прав для доступа к админ панели');
                window.location.href = '/';
                return;
            }
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки заявок:', error);
        document.getElementById('adminRequestsList').innerHTML = 
            '<div class="requests-loading">Ошибка загрузки заявок</div>';
    }
}

// Обновление статистики
function updateStats() {
    const total = allRequests.length;
    const pending = allRequests.filter(r => r.status === 'pending').length;
    const processing = allRequests.filter(r => r.status === 'processing').length;
    const completed = allRequests.filter(r => r.status === 'completed').length;
    
    document.getElementById('totalRequests').textContent = total;
    document.getElementById('pendingRequests').textContent = pending;
    document.getElementById('processingRequests').textContent = processing;
    document.getElementById('completedRequests').textContent = completed;
}

// Отображение заявок
function displayAdminRequests(requests) {
    const requestsListDiv = document.getElementById('adminRequestsList');
    
    if (requests.length === 0) {
        requestsListDiv.innerHTML = '<div class="requests-loading">Заявок не найдено</div>';
        return;
    }
    
    const statusTexts = {
        'pending': 'Ожидает обработки',
        'processing': 'В обработке',
        'completed': 'Выполнена',
        'rejected': 'Отклонена'
    };
    
    requestsListDiv.innerHTML = requests.map(request => `
        <div class="admin-request-item">
            <div class="admin-request-header">
                <div>
                    <span class="request-id">ID: ${request.id}</span>
                    <span class="request-status status-${request.status}">
                        ${statusTexts[request.status] || request.status}
                    </span>
                </div>
                <div class="admin-request-actions">
                    <button class="process-btn" onclick="openProcessModal('${request.id}')">
                        Обработать
                    </button>
                    <button class="delete-btn" onclick="deleteRequest('${request.id}')">
                        🗑️ Удалить
                    </button>
                </div>
            </div>
            <div class="request-info">
                <span>Пользователь: ${request.userId}</span>
                <span>•</span>
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

// Открытие модального окна обработки заявки
function openProcessModal(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    currentRequestId = requestId;
    
    document.getElementById('modalRequestInfo').innerHTML = `
        <p><strong>ID:</strong> ${request.id}</p>
        <p><strong>Пользователь:</strong> ${request.userId}</p>
        <p><strong>Название сессии:</strong> ${request.sessionName}</p>
        <p><strong>Телефон:</strong> ${request.phoneNumber}</p>
        <p><strong>Создана:</strong> ${new Date(request.createdAt).toLocaleString('ru-RU')}</p>
    `;
    
    document.getElementById('newStatus').value = request.status;
    document.getElementById('statusNotes').value = request.notes || '';
    
    document.getElementById('processModal').style.display = 'block';
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('processModal').style.display = 'none';
    currentRequestId = null;
}

// Настройка обработчиков событий
function setupEventHandlers() {
    // Кнопка обновления
    document.getElementById('refreshBtn').addEventListener('click', loadAdminRequests);
    
    // Фильтры
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('searchFilter').addEventListener('input', applyFilters);
    
    // Модальное окно
    document.querySelector('.close').addEventListener('click', closeModal);
    document.querySelector('.cancel-btn').addEventListener('click', closeModal);
    
    // Кнопки в модальном окне
    document.getElementById('updateStatusBtn').addEventListener('click', updateRequestStatus);
    document.getElementById('createSessionBtn').addEventListener('click', createSessionForRequest);
    
    // Закрытие модального окна при клике вне его
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('processModal')) {
            closeModal();
        }
    });
}

// Применение фильтров
function applyFilters() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
    
    let filteredRequests = allRequests;
    
    // Фильтр по статусу
    if (statusFilter !== 'all') {
        filteredRequests = filteredRequests.filter(r => r.status === statusFilter);
    }
    
    // Поиск по ID или телефону
    if (searchFilter) {
        filteredRequests = filteredRequests.filter(r => 
            r.id.toLowerCase().includes(searchFilter) || 
            r.phoneNumber.includes(searchFilter)
        );
    }
    
    displayAdminRequests(filteredRequests);
}

// Обновление статуса заявки
async function updateRequestStatus() {
    if (!currentRequestId) return;
    
    const newStatus = document.getElementById('newStatus').value;
    const notes = document.getElementById('statusNotes').value;
    
    try {
        const response = await fetch('/api/admin/update-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requestId: currentRequestId,
                status: newStatus,
                notes: notes
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Статус заявки обновлен');
            closeModal();
            await loadAdminRequests();
        } else {
            alert(`Ошибка: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Создание сессии для заявки
async function createSessionForRequest() {
    if (!currentRequestId) return;
    
    const request = allRequests.find(r => r.id === currentRequestId);
    if (!request) return;
    
    if (confirm(`Создать сессию для заявки ${request.id}?\nТелефон: ${request.phoneNumber}\nСессия: ${request.sessionName}`)) {
        try {
            const response = await fetch('/api/admin/create-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requestId: currentRequestId,
                    sessionName: request.sessionName,
                    phoneNumber: request.phoneNumber,
                    userId: request.userId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert('Сессия создана! Проверьте терминал для ввода SMS кода.');
                closeModal();
                await loadAdminRequests();
            } else {
                alert(`Ошибка создания сессии: ${data.error}`);
            }
        } catch (error) {
            alert(`Ошибка соединения: ${error.message}`);
        }
    }
}

// Удаление заявки администратором
async function deleteRequest(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    const confirmMessage = `Удалить заявку ${requestId}?\n\n` +
        `Пользователь: ${request.userId}\n` +
        `Сессия: ${request.sessionName}\n` +
        `Телефон: ${request.phoneNumber}\n\n` +
        `${request.status === 'completed' ? 'ВНИМАНИЕ: Также будут удалены все файлы сессий пользователя!' : ''}`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/delete-request/${requestId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Заявка ${requestId} успешно удалена!`);
            await loadAdminRequests(); // Перезагружаем список
        } else {
            alert(`Ошибка удаления: ${data.error}`);
        }
    } catch (error) {
        console.error('Ошибка удаления заявки:', error);
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Экспорт заявок
async function exportRequests() {
    try {
        const response = await fetch('/api/admin/export-requests');
        const data = await response.json();
        
        if (data.success) {
            // Создаем файл для скачивания
            const blob = new Blob([JSON.stringify(data, null, 2)], { 
                type: 'application/json' 
            });
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `imported_requests.json`; // ИЗМЕНИЛИ ЭТУ СТРОКУ
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            alert(`Экспортировано ${data.requests.length} заявок. Файл сохранен как imported_requests.json`);
        } else {
            alert(`Ошибка экспорта: ${data.error}`);
        }
    } catch (error) {
        console.error('Ошибка экспорта заявок:', error);
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Импорт заявок
function importRequests() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.requests || !Array.isArray(data.requests)) {
                alert('Неверный формат файла');
                return;
            }
            
            const response = await fetch('/api/admin/import-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests: data.requests })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(result.message);
                await loadAdminRequests(); // Перезагружаем список
            } else {
                alert(`Ошибка импорта: ${result.error}`);
            }
        } catch (error) {
            console.error('Ошибка импорта:', error);
            alert(`Ошибка обработки файла: ${error.message}`);
        }
    };
    
    input.click();
}

// Обновить setupEventHandlers для добавления новых кнопок
function setupEventHandlers() {
    // Существующие обработчики...
    document.getElementById('refreshBtn').addEventListener('click', loadAdminRequests);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('searchFilter').addEventListener('input', applyFilters);
    
    // Новые обработчики
    document.getElementById('exportRequestsBtn').addEventListener('click', exportRequests);
    document.getElementById('importRequestsBtn').addEventListener('click', importRequests);
    
    // Модальное окно
    document.querySelector('.close').addEventListener('click', closeModal);
    document.querySelector('.cancel-btn').addEventListener('click', closeModal);
    
    // Кнопки в модальном окне
    document.getElementById('updateStatusBtn').addEventListener('click', updateRequestStatus);
    document.getElementById('createSessionBtn').addEventListener('click', createSessionForRequest);
    
    // Закрытие модального окна при клике вне его
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('processModal')) {
            closeModal();
        }
    });
}