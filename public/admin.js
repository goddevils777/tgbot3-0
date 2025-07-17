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
                notify.error('У вас нет прав для доступа к админ панели');
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
                    <button class="download-btn" onclick="downloadRequest('${request.id}')">
                        📥 Скачать
                    </button>
                    <button class="delete-btn" onclick="deleteRequest('${request.id}')">
                        🗑️ Удалить
                    </button>
                    <button onclick="pushToGitHub('${request.id}')" class="github-btn" title="Отправить в GitHub">
                        📤 В GitHub
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
    // Проверяем существование элементов перед добавлением обработчиков
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAdminRequests);
    }
    
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    
    const searchFilter = document.getElementById('searchFilter');
    if (searchFilter) {
        searchFilter.addEventListener('input', applyFilters);
    }
    
    const uploadRequestBtn = document.getElementById('uploadRequestBtn');
    if (uploadRequestBtn) {
        uploadRequestBtn.addEventListener('click', uploadRequestWithUser);
    }
    
    // Модальное окно
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    const cancelBtn = document.querySelector('.cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    // Кнопки в модальном окне
    const updateStatusBtn = document.getElementById('updateStatusBtn');
    if (updateStatusBtn) {
        updateStatusBtn.addEventListener('click', updateRequestStatus);
    }
    
    const createSessionBtn = document.getElementById('createSessionBtn');
    if (createSessionBtn) {
        createSessionBtn.addEventListener('click', createSessionForRequest);
    }
    
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
           notify.success('Статус заявки обновлен');
            closeModal();
            await loadAdminRequests();
        } else {
            notify.error(`Ошибка: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Создание сессии для заявки
async function createSessionForRequest() {
    if (!currentRequestId) return;
    
    const request = allRequests.find(r => r.id === currentRequestId);
    if (!request) return;
    
    showConfirm(`Создать сессию для заявки ${request.id}?\nТелефон: ${request.phoneNumber}\nСессия: ${request.sessionName}`, async () => { // ДОБАВИТЬ async
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
                notify.success('Сессия создана! Проверьте терминал для ввода SMS кода.');
                closeModal();
                await loadAdminRequests();
            } else {
                notify.error(`Ошибка создания сессии: ${data.error}`);
            }
        } catch (error) {
            notify.error(`Ошибка соединения: ${error.message}`); // ИСПРАВИТЬ ЭТУ СТРОКУ
        }
    });
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
    
    showConfirm(confirmMessage, async () => {
        try {
            const response = await fetch(`/api/admin/delete-request/${requestId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                notify.success(`Заявка ${requestId} успешно удалена!`);
                await loadAdminRequests(); // Перезагружаем список
            } else {
                notify.error(`Ошибка удаления: ${data.error}`);
            }
        } catch (error) {
            console.error('Ошибка удаления заявки:', error);
            notify.error(`Ошибка соединения: ${error.message}`); // ИСПРАВИТЬ ЭТУ СТРОКУ
        }
    });
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
                notify.error('Неверный формат файла');
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
                notify.success(result.message);
                await loadAdminRequests(); // Перезагружаем список
            } else {
                notify.error(`Ошибка импорта: ${result.error}`);
            }
        } catch (error) {
            console.error('Ошибка импорта:', error);
            notify.error(`Ошибка обработки файла: ${error.message}`);
        }
    };
    
    input.click();
}



// Скачать конкретную заявку с пользователем
async function downloadRequest(requestId) {
    try {
        const response = await fetch(`/api/admin/export-request/${requestId}`);
        const data = await response.json();
        
        if (data.success) {
            // Создаем файл для скачивания
            const blob = new Blob([JSON.stringify(data, null, 2)], { 
                type: 'application/json' 
            });
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `request_${requestId}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            notify.success(`Заявка ${requestId} скачана с данными пользователя`);
        } else {
            notify.error(`Ошибка скачивания: ${data.error}`);
        }
    } catch (error) {
        console.error('Ошибка скачивания заявки:', error);
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Загрузить заявку с пользователем
function uploadRequestWithUser() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.request || !data.user) {
                notify.error('Неверный формат файла. Нужны данные заявки и пользователя.');
                return;
            }
            
            const response = await fetch('/api/admin/import-request-with-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    request: data.request, 
                    user: data.user 
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                notify.success(result.message);
                await loadAdminRequests(); // Перезагружаем список
            } else {
                notify.error(`Ошибка загрузки: ${result.error}`);
            }
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            notify.error(`Ошибка обработки файла: ${error.message}`);
        }
    };
    
    input.click();
}

// Отправить заявку в GitHub
async function pushToGitHub(requestId) {
    const commitMessage = prompt('Введите сообщение для commit:', `Добавлена заявка ${requestId}`);
    
    if (commitMessage === null) return; // Отмена
    
    const confirmMessage = `Отправить заявку ${requestId} в GitHub?`;
    
    showConfirm(confirmMessage, async () => {
        try {
            const response = await fetch(`/api/admin/push-to-github/${requestId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ commitMessage })
            });
            
            const data = await response.json();
            
            if (data.success) {
                notify.success(data.message);
            } else {
                notify.error(`Ошибка отправки: ${data.error}`);
            }
        } catch (error) {
            console.error('Ошибка отправки в GitHub:', error);
            notify.error(`Ошибка соединения: ${error.message}`);
        }
    });
}