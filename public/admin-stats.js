// Переменные состояния
let currentStats = {};

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserInfo();
    await loadAPIStats();
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
            setTimeout(() => window.location.href = '/', 2000);
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о пользователе:', error);
        document.getElementById('userInfo').innerHTML = '👤 Ошибка';
    }
}

// Загрузка статистики API
async function loadAPIStats() {
    try {
        const response = await fetch('/api/admin/api-stats');
        const data = await response.json();
        
        if (data.success) {
            currentStats = data;
            displayTopEndpoints(data.topEndpoints);
            displayDetailedStats(data.stats);
        } else {
            if (data.error === 'Нет доступа') {
                notify.error('У вас нет прав для просмотра статистики API');
                window.location.href = '/';
                return;
            }
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики API:', error);
        document.getElementById('topEndpoints').innerHTML = 
            '<div class="stats-loading">Ошибка загрузки статистики</div>';
        document.getElementById('detailedStats').innerHTML = 
            '<div class="stats-loading">Ошибка загрузки статистики</div>';
    }
}

// Отображение топ endpoints
function displayTopEndpoints(topEndpoints) {
    const container = document.getElementById('topEndpoints');
    
    if (topEndpoints.length === 0) {
        container.innerHTML = '<div class="stats-loading">Нет данных</div>';
        return;
    }
    
    const table = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Endpoint</th>
                    <th>Запросов</th>
                    <th>Среднее время (мс)</th>
                    <th>Ошибки</th>
                </tr>
            </thead>
            <tbody>
                ${topEndpoints.map(endpoint => `
                    <tr>
                        <td class="endpoint-cell">${endpoint.endpoint}</td>
                        <td class="count-cell">${endpoint.count}</td>
                        <td class="time-cell">${endpoint.avgTime}мс</td>
                        <td class="error-cell">${endpoint.errorRate}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Отображение детальной статистики
function displayDetailedStats(stats) {
    const container = document.getElementById('detailedStats');
    
    if (Object.keys(stats).length === 0) {
        container.innerHTML = '<div class="stats-loading">Нет данных</div>';
        return;
    }
    
    const table = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Endpoint</th>
                    <th>Запросов</th>
                    <th>Среднее время</th>
                    <th>Мин. время</th>
                    <th>Макс. время</th>
                    <th>Ошибки</th>
                    <th>% ошибок</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(stats).map(([endpoint, data]) => `
                    <tr>
                        <td class="endpoint-cell">${endpoint}</td>
                        <td class="count-cell">${data.count}</td>
                        <td class="time-cell">${data.avgTime}мс</td>
                        <td class="time-cell">${data.minTime}мс</td>
                        <td class="time-cell">${data.maxTime}мс</td>
                        <td class="error-cell">${data.errors}</td>
                        <td class="error-cell">${data.errorRate}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Настройка обработчиков событий
function setupEventHandlers() {
    document.getElementById('refreshStatsBtn').addEventListener('click', async () => {
        await loadAPIStats();
        notify.success('Статистика обновлена');
    });
    
    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
        showConfirm('Вы уверены, что хотите сбросить всю статистику API?', async () => {
            try {
                const response = await fetch('/api/admin/reset-api-stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    notify.success(data.message);
                    await loadAPIStats();
                } else {
                    notify.error(`Ошибка: ${data.error}`);
                }
            } catch (error) {
                console.error('Ошибка сброса статистики:', error);
                notify.error(`Ошибка соединения: ${error.message}`);
            }
        });
    });
}