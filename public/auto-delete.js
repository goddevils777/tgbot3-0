// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initializeAutoDelete();
    loadAutoDeleteTasks();
    
    // Автообновление каждые 5 секунд
    setInterval(() => {
        loadAutoDeleteTasks();
    }, 5000);
});
// Инициализация обработчиков событий
function initializeAutoDelete() {
    document.getElementById('createAutoDeleteTask').addEventListener('click', createAutoDeleteTask);
    document.getElementById('usersList').addEventListener('input', () => {
        updateUsersCount();
        updateCalculation();
        saveFormData(); // Автосохранение
    });
    
    // Обновление расчетов и автосохранение при изменении данных
    document.getElementById('startDate').addEventListener('change', () => {
        updateCalculation();
        saveFormData();
    });
    document.getElementById('startTime').addEventListener('change', () => {
        updateCalculation();
        saveFormData();
    });
    document.getElementById('deleteTimer').addEventListener('change', saveFormData);
    
    // Устанавливаем сегодняшнюю дату и время +5 минут
    const now = new Date();
    const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);
    
    document.getElementById('startDate').value = now.toISOString().split('T')[0];
    document.getElementById('startTime').value = in5Minutes.toTimeString().slice(0, 5);
    
    // Устанавливаем минимальную дату (сегодня)
    document.getElementById('startDate').min = now.toISOString().split('T')[0];
    
    // Загружаем сохраненные данные
    loadFormData();
    
    updateCalculation();
}

// Парсинг списка пользователей
function parseUsersList() {
    const text = document.getElementById('usersList').value.trim();
    if (!text) return [];
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const users = [];
    
    lines.forEach((line, index) => {
        // Пропускаем пустые строки и комментарии
        if (!line || line.startsWith('#') || line.startsWith('//')) return;
        
        const user = {
            id: index + 1,
            input: line,
            type: detectUserType(line),
            status: 'pending'
        };
        users.push(user);
    });
    
    return users;
}

// Определение типа пользователя
// Определение типа пользователя
function detectUserType(input) {
    // Обработка ссылок t.me
    if (input.includes('t.me/')) {
        return 'username'; // Считаем ссылки как username
    }
    
    if (input.startsWith('@')) return 'username';
    if (input.startsWith('+') && /^\+\d+$/.test(input)) return 'phone';
    if (/^\d+$/.test(input)) return 'id';
    
    // Проверяем на валидный username (только буквы, цифры, подчеркивания)
    if (/^[a-zA-Z0-9_]+$/.test(input)) return 'username';
    
    return 'name';
}

// Обновление счетчика пользователей
function updateUsersCount() {
    const users = parseUsersList();
    document.getElementById('usersCount').textContent = `Пользователей: ${users.length}`;
    return users.length;
}
// Расчет времени выполнения с реальными случайными интервалами
function updateCalculation() {
    const users = parseUsersList();
    const startDate = document.getElementById('startDate').value;
    const startTime = document.getElementById('startTime').value;
    
    if (!startDate || !startTime || users.length === 0) {
        document.getElementById('calculationResult').innerHTML = 
            '<div class="calc-warning">⚠️ Добавьте список контактов для начала расчета</div>';
        return;
    }
    
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const now = new Date();
    
    // Проверяем что время в будущем
    if (startDateTime <= now) {
        document.getElementById('calculationResult').innerHTML = 
            '<div class="calc-warning">⚠️ Время начала должно быть в будущем</div>';
        return;
    }
    
    const totalUsers = users.length;
    
    // Рассчитываем реальные случайные интервалы для каждого пользователя
    let totalMinutes = 0;
    const intervals = [];
    
    for (let i = 0; i < totalUsers; i++) {
        // Случайный интервал 15-45 минут для каждого пользователя
        const randomInterval = 15 + Math.random() * 30;
        intervals.push(randomInterval);
        totalMinutes += randomInterval;
    }
    
    // Средний интервал из реальных расчетов
    const averageInterval = totalUsers > 0 ? Math.round(totalMinutes / totalUsers) : 0;
    
    const estimatedEndTime = new Date(startDateTime.getTime() + totalMinutes * 60000);
    
    // Добавляем время для избежания ночных часов
    let adjustedEndTime = estimatedEndTime;
    if (totalMinutes > 600) { // Больше 10 часов
        const nightHours = Math.floor(totalMinutes / 1440) * 10; // 10 часов ночи на каждые сутки
        adjustedEndTime = new Date(estimatedEndTime.getTime() + nightHours * 60 * 60000);
    }
    
    const result = {
        totalUsers,
        averageInterval,
        totalMinutes: Math.round(totalMinutes),
        estimatedEndTime: adjustedEndTime,
        duration: formatDuration(Math.round(totalMinutes)),
        minInterval: Math.round(Math.min(...intervals)),
        maxInterval: Math.round(Math.max(...intervals))
    };
    
    displayCalculation(result);
}

// Обновляем отображение расчетов
function displayCalculation(result) {
    const calcDiv = document.getElementById('calculationResult');
    
    calcDiv.innerHTML = `
        <div class="calc-success">
            <div class="calc-row">
                <span class="calc-label">👥 Пользователей:</span>
                <span class="calc-value">${result.totalUsers}</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">⏱️ Интервалы:</span>
                <span class="calc-value">${result.minInterval}-${result.maxInterval} мин (среднее: ${result.averageInterval})</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">🕐 Общее время выполнения:</span>
                <span class="calc-value">${result.duration}</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">🏁 Завершение:</span>
                <span class="calc-value">${result.estimatedEndTime.toLocaleString('ru-RU')}</span>
            </div>
        </div>
    `;
}

// Форматирование длительности
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days} дн. ${remainingHours} ч. ${mins} мин.`;
    } else if (hours > 0) {
        return `${hours} ч. ${mins} мин.`;
    } else {
        return `${mins} мин.`;
    }
}

// Создание задания автоудаления (убираем ссылки на удаленные настройки)
async function createAutoDeleteTask() {
    const users = parseUsersList();
    const deleteTimer = document.getElementById('deleteTimer').value;
    const startDate = document.getElementById('startDate').value;
    const startTime = document.getElementById('startTime').value;
    
    // Валидация
    if (users.length === 0) {
        notify.warning('Введите хотя бы одного пользователя');
        return;
    }
    
    if (!startDate || !startTime) {
        notify.warning('Укажите дату и время начала');
        return;
    }
    
    // Проверяем, что время в будущем
    const scheduledTime = new Date(`${startDate}T${startTime}`);
    if (scheduledTime <= new Date()) {
        notify.warning('Время начала должно быть в будущем');
        return;
    }
    
    try {
        const response = await fetch('/api/create-auto-delete-task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                users: users,
                deleteTimer: deleteTimer,
                startDateTime: scheduledTime.toISOString(),
                settings: {
                    smartIntervals: true,      // Всегда включено
                    avoidNightHours: true,     // Всегда включено
                    checkExistingTimer: true   // Всегда включено
                }
            })
        });
        
        const data = await response.json();
        
        // В конце функции createAutoDeleteTask, после успешного создания добавь:
        if (data.success) {
            notify.success('Задание автоудаления создано успешно!');
            
            // Очищаем форму и сохраненные данные
            document.getElementById('usersList').value = '';
            clearSavedData(); // Очищаем localStorage
            updateUsersCount();
            updateCalculation();
            
            // Обновляем список заданий
            loadAutoDeleteTasks();
        } else {
            notify.error(`Ошибка создания задания: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Загрузка списка заданий автоудаления
async function loadAutoDeleteTasks() {
    try {
        const response = await fetch('/api/auto-delete-tasks');
        const data = await response.json();
        
        if (data.success) {
            displayAutoDeleteTasks(data.tasks);
        }
    } catch (error) {
        console.error('Ошибка загрузки заданий:', error);
    }
}

// Отображение заданий автоудаления
function displayAutoDeleteTasks(tasks) {
    const tasksList = document.getElementById('autoDeleteTasksList');
    
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p>Нет активных заданий автоудаления</p>';
        return;
    }
    
    tasksList.innerHTML = tasks.map(task => {
        const totalUsers = task.totalUsers || task.users.length;
        const completedCount = task.completedUsers ? task.completedUsers.length : 0;
        const failedCount = task.failedUsers ? task.failedUsers.length : 0;
        const progressPercent = totalUsers > 0 ? Math.round((completedCount / totalUsers) * 100) : 0;
        
        const showProgress = ['scheduled', 'executing'].includes(task.status);
        
        return `
            <div class="task-item">
                <div class="task-header">
                    <div class="task-info">
                        <span class="task-status status-${task.status}">${getTaskStatusText(task.status)}</span>
                        <span>Начало: ${new Date(task.startDateTime).toLocaleString('ru-RU')}</span>
                        <span>Таймер: ${getTimerText(task.deleteTimer)}</span>
                    </div>
                    <button class="delete-task" onclick="deleteAutoDeleteTask('${task.id}')">Удалить</button>
                </div>
                
                ${showProgress ? `
                    <div class="task-progress">
                        <div class="progress-info">
                            <span>Прогресс: ${completedCount}/${totalUsers} пользователей</span>
                            <span>${progressPercent}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        ${failedCount > 0 ? `<div class="failed-info">Ошибок: ${failedCount}</div>` : ''}
                    </div>
                ` : ''}
                
                <div class="task-stats">
                    <div class="stats-item success">✅ Выполнено: ${completedCount}</div>
                    <div class="stats-item error">❌ Ошибок: ${failedCount}</div>
                    <div class="stats-item total">👥 Всего: ${totalUsers}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Получение текста статуса
function getTaskStatusText(status) {
    const statusTexts = {
        'pending': 'Ожидает',
        'scheduled': 'Запланировано',
        'executing': 'Выполняется',
        'completed': 'Завершено',
        'failed': 'Ошибка'
    };
    return statusTexts[status] || status;
}

// Получение текста таймера
function getTimerText(timer) {
    const timerTexts = {
        '1day': '1 день',
        '1week': '1 неделя',
        '1month': '1 месяц',
        'disable': 'Отключить'
    };
    return timerTexts[timer] || timer;
}

// Удаление задания автоудаления
async function deleteAutoDeleteTask(taskId) {
    showConfirm('Вы уверены, что хотите удалить это задание?', async () => {
        try {
            const response = await fetch(`/api/auto-delete-tasks/${taskId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                notify.success('Задание удалено');
                loadAutoDeleteTasks();
            } else {
                notify.error(`Ошибка удаления: ${data.error}`);
            }
        } catch (error) {
            notify.error(`Ошибка соединения: ${error.message}`);
        }
    });
}

// Сохранение данных в localStorage
function saveFormData() {
    const formData = {
        usersList: document.getElementById('usersList').value,
        deleteTimer: document.getElementById('deleteTimer').value,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value
    };
    
    localStorage.setItem('autoDeleteFormData', JSON.stringify(formData));
}

// Загрузка данных из localStorage
function loadFormData() {
    const saved = localStorage.getItem('autoDeleteFormData');
    if (saved) {
        try {
            const formData = JSON.parse(saved);
            
            if (formData.usersList) {
                document.getElementById('usersList').value = formData.usersList;
                updateUsersCount();
            }
            
            if (formData.deleteTimer) {
                document.getElementById('deleteTimer').value = formData.deleteTimer;
            }
            
            // Дату и время загружаем только если они в будущем
            if (formData.startDate && formData.startTime) {
                const savedDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
                if (savedDateTime > new Date()) {
                    document.getElementById('startDate').value = formData.startDate;
                    document.getElementById('startTime').value = formData.startTime;
                }
            }
            
            updateCalculation();
        } catch (error) {
            console.error('Ошибка загрузки сохраненных данных:', error);
        }
    }
}

// Очистка сохраненных данных
function clearSavedData() {
    localStorage.removeItem('autoDeleteFormData');
}