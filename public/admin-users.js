// Переменные состояния
let allUsers = [];

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserInfo();
    await loadAdminUsers();
    setupEventHandlers();
});

// Загрузка информации о пользователе (админе)
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
            setTimeout(() => window.location.href = '/', 2000);
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о пользователе:', error);
        document.getElementById('userInfo').innerHTML = '👤 Ошибка';
    }
}

// Загрузка списка пользователей
async function loadAdminUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users;
            updateUsersStats();
            displayAdminUsers(allUsers);
        } else {
            if (data.error === 'Нет доступа') {
                alert('У вас нет прав для доступа к управлению пользователями');
                window.location.href = '/';
                return;
            }
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        document.getElementById('adminUsersList').innerHTML = 
            '<div class="users-loading">Ошибка загрузки пользователей</div>';
    }
}

// Обновление статистики пользователей
function updateUsersStats() {
    const total = allUsers.length;
    const active = allUsers.filter(u => !u.isBlocked).length;
    const blocked = allUsers.filter(u => u.isBlocked).length;
    const totalSessions = allUsers.reduce((sum, u) => sum + (u.sessionsCount || 0), 0);
    
    document.getElementById('totalUsers').textContent = total;
    document.getElementById('activeUsers').textContent = active;
    document.getElementById('blockedUsers').textContent = blocked;
    document.getElementById('totalSessions').textContent = totalSessions;
}

// Отображение пользователей
function displayAdminUsers(users) {
    const usersListDiv = document.getElementById('adminUsersList');
    
    if (users.length === 0) {
        usersListDiv.innerHTML = '<div class="users-loading">Пользователей не найдено</div>';
        return;
    }
    
    const providerIcons = {
        'google': '🔵',
        'telegram': '🔷', 
        'local': '🔘'
    };
    
    usersListDiv.innerHTML = users.map(user => `
        <div class="admin-user-item ${user.isBlocked ? 'blocked' : ''}">
            <div class="admin-user-header">
                <div class="user-main-info">
                    <span class="user-login">${user.login}</span>
                    <span class="user-provider">${providerIcons[user.provider] || '🔘'} ${user.provider || 'local'}</span>
                    ${user.isBlocked ? '<span class="user-status blocked">Заблокирован</span>' : '<span class="user-status active">Активен</span>'}
                </div>
                <div class="admin-user-actions">
                    <button class="info-btn" onclick="showUserDetails('${user.id}')">
                        ℹ️ Подробнее
                    </button>
                    <button class="${user.isBlocked ? 'unblock-btn' : 'block-btn'}" 
                            onclick="toggleUserStatus('${user.id}', '${user.isBlocked ? 'unblock' : 'block'}')">
                        ${user.isBlocked ? '✅ Разблокировать' : '🚫 Заблокировать'}
                    </button>
                    <button class="delete-user-btn" onclick="deleteUser('${user.id}')">
                        🗑️ Удалить
                    </button>
                </div>
            </div>
            <div class="user-details">
                <div class="user-info-row">
                    <span><strong>ID:</strong> ${user.id}</span>
                    <span><strong>Email:</strong> ${user.email || 'Не указан'}</span>
                    <span><strong>Сессий:</strong> ${user.sessionsCount || 0}</span>
                </div>
                <div class="user-info-row">
                    <span><strong>Создан:</strong> ${new Date(user.createdAt).toLocaleString('ru-RU')}</span>
                    <span><strong>Активность:</strong> ${new Date(user.lastActiveAt).toLocaleString('ru-RU')}</span>
                </div>
                ${user.name ? `<div class="user-info-row"><span><strong>Имя:</strong> ${user.name}</span></div>` : ''}
            </div>
        </div>
    `).join('');
}

// Показ детальной информации о пользователе
function showUserDetails(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const details = `
Подробная информация о пользователе:

ID: ${user.id}
Логин: ${user.login}
Email: ${user.email || 'Не указан'}
Имя: ${user.name || 'Не указано'}
Провайдер: ${user.provider || 'local'}
Статус: ${user.isBlocked ? 'Заблокирован' : 'Активен'}
Количество сессий: ${user.sessionsCount || 0}

Создан: ${new Date(user.createdAt).toLocaleString('ru-RU')}
Последняя активность: ${new Date(user.lastActiveAt).toLocaleString('ru-RU')}
${user.isBlocked ? `Заблокирован: ${new Date(user.blockedAt).toLocaleString('ru-RU')}` : ''}
    `.trim();
    
    alert(details);
}

// Блокировка/разблокировка пользователя
async function toggleUserStatus(userId, action) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const actionText = action === 'block' ? 'заблокировать' : 'разблокировать';
    const confirmMessage = `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} пользователя "${user.login}"?`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/toggle-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, action })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Пользователь "${user.login}" успешно ${action === 'block' ? 'заблокирован' : 'разблокирован'}!`);
            await loadAdminUsers();
        } else {
            alert(`Ошибка: ${data.error}`);
        }
    } catch (error) {
        console.error('Ошибка изменения статуса пользователя:', error);
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Удаление пользователя
async function deleteUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const confirmMessage = `ВНИМАНИЕ! Удалить пользователя "${user.login}"?\n\n` +
        `Это действие удалит:\n` +
        `- Аккаунт пользователя\n` +
        `- Все его сессии (${user.sessionsCount || 0})\n` +
        `- Все связанные данные\n\n` +
        `Это действие НЕОБРАТИМО!`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/delete-user/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Пользователь "${user.login}" успешно удален!`);
            await loadAdminUsers();
        } else {
            alert(`Ошибка удаления: ${data.error}`);
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Применение фильтров
function applyUsersFilters() {
    const statusFilter = document.getElementById('userStatusFilter').value;
    const searchFilter = document.getElementById('userSearchFilter').value.toLowerCase();
    
    let filteredUsers = allUsers;
    
    // Фильтр по статусу
    if (statusFilter !== 'all') {
        if (statusFilter === 'active') {
            filteredUsers = filteredUsers.filter(u => !u.isBlocked);
        } else if (statusFilter === 'blocked') {
            filteredUsers = filteredUsers.filter(u => u.isBlocked);
        } else {
            filteredUsers = filteredUsers.filter(u => u.provider === statusFilter);
        }
    }
    
    // Поиск по логину или email
    if (searchFilter) {
        filteredUsers = filteredUsers.filter(u => 
            u.login.toLowerCase().includes(searchFilter) || 
            (u.email && u.email.toLowerCase().includes(searchFilter))
        );
    }
    
    displayAdminUsers(filteredUsers);
}

// Настройка обработчиков событий
function setupEventHandlers() {
    // Кнопка обновления
    document.getElementById('refreshUsersBtn').addEventListener('click', loadAdminUsers);
    
    // Фильтры
    document.getElementById('userStatusFilter').addEventListener('change', applyUsersFilters);
    document.getElementById('userSearchFilter').addEventListener('input', applyUsersFilters);
}