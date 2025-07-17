// AI Chat Sniper - JavaScript логика

let aiSniperActive = false;
let selectedChats = [];
let activityData = {
    todayResponses: 0,
    totalResponses: 0,
    chatStats: {},
    timeStats: {}
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initializeAiSniper();
    loadChats();
    loadSavedSettings();
    setupEventListeners();
    
    // Проверяем был ли активен AI Sniper
    const wasActive = localStorage.getItem('aiSniperActive');
    if (wasActive === 'true') {
        // Сразу обновляем интерфейс как будто уже запущен
        aiSniperActive = true;
        updateStatusDisplay();
        
        setTimeout(async () => {
            console.log('Восстанавливаем AI Sniper...');
            
            // Проверяем что все необходимые данные есть
            const mainPrompt = document.getElementById('mainPrompt').value.trim();
            const communicationStyle = document.querySelector('input[name="communicationStyle"]:checked')?.value;
            
            if (!mainPrompt || selectedChats.length === 0) {
                console.log('❌ Недостаточно данных для автозапуска');
                aiSniperActive = false;
                updateStatusDisplay();
                saveAiSniperState(false);
                return;
            }
            
            try {
                const response = await fetch('/api/start-ai-sniper', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        mainPrompt: mainPrompt,
                        communicationStyle: communicationStyle,
                        chats: selectedChats,
                        schedule: getScheduleSettings()
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    addLogEntry('🔄 AI Sniper восстановлен после перезагрузки', 'success');
                    startActivityMonitoring();
                } else {
                    console.error('❌ Ошибка автозапуска:', data.error);
                    aiSniperActive = false;
                    updateStatusDisplay();
                    saveAiSniperState(false);
                    addLogEntry(`❌ Ошибка автозапуска: ${data.error}`, 'error');
                }
            } catch (error) {
                console.error('❌ Ошибка соединения при автозапуске:', error);
                aiSniperActive = false;
                updateStatusDisplay();
                saveAiSniperState(false);
                addLogEntry(`❌ Ошибка соединения: ${error.message}`, 'error');
            }
        }, 3000);
    }
    
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
});

// Инициализация компонентов
function initializeAiSniper() {
    updateStatusDisplay();
    loadActivityData();
    setDefaultSchedule();
}

// Установка обработчиков событий
function setupEventListeners() {
    // Кнопки управления
    const startBtn = document.getElementById('startAiSniper');
    const stopBtn = document.getElementById('stopAiSniper');
    const testBtn = document.getElementById('testSettings');
    
    if (startBtn) startBtn.addEventListener('click', startAiSniper);
    if (stopBtn) stopBtn.addEventListener('click', stopAiSniper);
    if (testBtn) testBtn.addEventListener('click', testSettings);
    
    // Управление чатами
    const selectAllBtn = document.getElementById('selectAllChats');
    const clearSelectionBtn = document.getElementById('clearChatSelection');
    
    if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllChats);
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearChatSelection);
    
    // Управление логом
    const clearLogBtn = document.getElementById('clearLog');
    const exportLogBtn = document.getElementById('exportLog');
    
    if (clearLogBtn) clearLogBtn.addEventListener('click', clearActivityLog);
    if (exportLogBtn) exportLogBtn.addEventListener('click', exportActivityLog);
    
    // Автосохранение настроек
    const promptInput = document.getElementById('mainPrompt');
    if (promptInput) {
        promptInput.addEventListener('input', saveSettings);
    }
    
    document.addEventListener('change', (e) => {
        if (e.target.name === 'communicationStyle') {
            saveSettings();
        }
        if (e.target.type === 'checkbox' && e.target.closest('#chatsList')) {
            updateSelectedChats();
            updateChatsCounter();
        }
    });
}

// Загрузка списка чатов
async function loadChats() {
    try {
        const response = await fetch('/api/groups');
        const data = await response.json();
        
        if (data.success) {
            displayChats(data.groups);
        } else {
            document.getElementById('chatsList').innerHTML = 
                '<div class="error-message">Ошибка загрузки чатов: ' + data.error + '</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
        document.getElementById('chatsList').innerHTML = 
            '<div class="error-message">Ошибка соединения с сервером</div>';
    }
}


// Отображение списка чатов (с глобальной переменной)
function displayChats(chats) {
    const chatsList = document.getElementById('chatsList');
    
    if (chats.length === 0) {
        chatsList.innerHTML = '<div class="no-chats">Нет доступных чатов</div>';
        return;
    }
    
    chatsList.innerHTML = chats.map(chat => `
        <div class="chat-item">
            <input type="checkbox" id="chat-${chat.id}" value="${chat.id}">
            <label for="chat-${chat.id}">
                <div class="chat-info">
                    <span class="chat-name">${chat.name}</span>
                    <span class="chat-meta">${chat.type} • ${chat.participantsCount || 0} участников</span>
                </div>
            </label>
        </div>
    `).join('');
    
    updateChatsCounter();
    
    // Восстанавливаем сохраненные чаты если есть
    if (window.savedChatsToRestore && window.savedChatsToRestore.length > 0) {
        console.log('🔄 Восстанавливаем чаты из глобальной переменной:', window.savedChatsToRestore);
        restoreSelectedChats(window.savedChatsToRestore);
        window.savedChatsToRestore = null; // Очищаем после использования
    } else {
        console.log('❌ Нет чатов для восстановления');
    }
}

// Обновление счетчика выбранных чатов
function updateChatsCounter() {
    const checkedCount = document.querySelectorAll('#chatsList input[type="checkbox"]:checked').length;
    document.getElementById('chatsCounter').textContent = `Выбрано: ${checkedCount}`;
}

// Выбрать все чаты
function selectAllChats() {
    const checkboxes = document.querySelectorAll('#chatsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateSelectedChats();
    updateChatsCounter();
}

// Снять выбор всех чатов
function clearChatSelection() {
    const checkboxes = document.querySelectorAll('#chatsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateSelectedChats();
    updateChatsCounter();
}


// Обновление списка выбранных чатов (с автосохранением)
function updateSelectedChats() {
    const checkboxes = document.querySelectorAll('#chatsList input[type="checkbox"]:checked');
    selectedChats = Array.from(checkboxes).map(checkbox => {
        const label = checkbox.nextElementSibling;
        return {
            id: checkbox.value,
            name: label.querySelector('.chat-name').textContent
        };
    });
    
    console.log('📝 Обновлены выбранные чаты:', selectedChats);
    
    // Автосохранение при изменении
    saveSettings();
}


// Запуск AI Sniper (с проверкой состояния)
async function startAiSniper() {
    // Проверяем не запущен ли уже
    if (aiSniperActive) {
        notify.warning('AI Sniper уже запущен');
        return;
    }
    
    const mainPrompt = document.getElementById('mainPrompt').value.trim();
    const communicationStyle = document.querySelector('input[name="communicationStyle"]:checked').value;
    
    // Валидация
    if (!mainPrompt) {
        notify.warning('Введите основной промпт вашей деятельности');
        return;
    }
    
    if (selectedChats.length === 0) {
        notify.warning('Выберите хотя бы один чат для мониторинга');
        return;
    }
    
    try {
        const response = await fetch('/api/start-ai-sniper', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mainPrompt: mainPrompt,
                communicationStyle: communicationStyle,
                chats: selectedChats,
                schedule: getScheduleSettings()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            aiSniperActive = true;
            updateStatusDisplay();
            addLogEntry('🚀 AI Sniper запущен', 'success');
            notify.success('AI Sniper успешно запущен!');
            
            // Сохраняем состояние активности
            saveAiSniperState(true);

            // Начинаем мониторинг активности
            startActivityMonitoring();
            
        } else {
            notify.error(`Ошибка запуска: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Остановка AI Sniper
async function stopAiSniper() {
    try {
        const response = await fetch('/api/stop-ai-sniper', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            aiSniperActive = false;
            updateStatusDisplay();
            addLogEntry('⏹️ AI Sniper остановлен', 'info');
            notify.success('AI Sniper остановлен');
            
            // Сохраняем состояние неактивности
            saveAiSniperState(false);

            stopActivityMonitoring();
        } else {
            notify.error(`Ошибка остановки: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Тестирование настроек
async function testSettings() {
    const mainPrompt = document.getElementById('mainPrompt').value.trim();
    
    if (!mainPrompt) {
        notify.warning('Введите основной промпт для тестирования');
        return;
    }
    
    try {
        addLogEntry('🧪 Тестируем настройки AI...', 'info');
        
        const response = await fetch('/api/test-ai-prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: mainPrompt,
                style: document.querySelector('input[name="communicationStyle"]:checked').value
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLogEntry(`✅ Тест пройден: ${data.testResponse}`, 'success');
            notify.success('Настройки протестированы успешно!');
        } else {
            addLogEntry(`❌ Ошибка теста: ${data.error}`, 'error');
            notify.error(`Ошибка тестирования: ${data.error}`);
        }
    } catch (error) {
        addLogEntry(`❌ Ошибка соединения: ${error.message}`, 'error');
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Обновление отображения статуса
function updateStatusDisplay() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const startBtn = document.getElementById('startAiSniper');
    const stopBtn = document.getElementById('stopAiSniper');
    
    if (aiSniperActive) {
        statusIndicator.textContent = '🟢';
        statusText.textContent = 'Активен';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    } else {
        statusIndicator.textContent = '⏸️';
        statusText.textContent = 'Остановлен';
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
    }
    
    // Обновляем статистику
    document.getElementById('todayResponses').textContent = activityData.todayResponses;
    document.getElementById('activeChats').textContent = selectedChats.length;
}

// Добавление записи в лог
function addLogEntry(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    const timestamp = new Date().toLocaleString('ru-RU');
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-message">${message}</span>
    `;
    
    // Удаляем placeholder если есть
    const placeholder = logContainer.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // Ограничиваем количество записей
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 100) {
        entries[entries.length - 1].remove();
    }
}

// Очистка лога активности
function clearActivityLog() {
    const logContainer = document.getElementById('activityLog');
    logContainer.innerHTML = '<div class="log-placeholder">Лог очищен</div>';
    notify.success('Лог активности очищен');
}

// Экспорт лога
function exportActivityLog() {
    const entries = document.querySelectorAll('.log-entry');
    if (entries.length === 0) {
        notify.warning('Нет данных для экспорта');
        return;
    }
    
    let logText = 'AI Chat Sniper - Лог активности\n';
    logText += '=' .repeat(50) + '\n\n';
    
    entries.forEach(entry => {
        const time = entry.querySelector('.log-time').textContent;
        const message = entry.querySelector('.log-message').textContent;
        logText += `${time}: ${message}\n`;
    });
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-sniper-log-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    notify.success('Лог экспортирован');
}

// Получение настроек расписания
function getScheduleSettings() {
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const weekdayInputs = document.querySelectorAll('.weekday-options input:checked');
    
    const startTime = startTimeInput ? startTimeInput.value : '09:00';
    const endTime = endTimeInput ? endTimeInput.value : '22:00';
    const weekdays = Array.from(weekdayInputs).map(cb => parseInt(cb.value));
    
    return {
        startTime,
        endTime,
        weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5] // По умолчанию рабочие дни
    };
}

// Установка расписания по умолчанию
function setDefaultSchedule() {
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    
    if (startTimeInput) {
        startTimeInput.value = '09:00';
    }
    if (endTimeInput) {
        endTimeInput.value = '22:00';
    }
}


// Сохранение настроек (включая выбранные группы)
function saveSettings() {
    const settings = {
        mainPrompt: document.getElementById('mainPrompt') ? document.getElementById('mainPrompt').value : '',
        communicationStyle: document.querySelector('input[name="communicationStyle"]:checked')?.value,
        selectedChats: selectedChats, // Сохраняем выбранные чаты
        schedule: getScheduleSettings()
    };
    
    localStorage.setItem('aiSniperSettings', JSON.stringify(settings));
    console.log('💾 Настройки AI Sniper сохранены:', settings);
}

// Загрузка сохраненных настроек (с детальной отладкой)
function loadSavedSettings() {
    const saved = localStorage.getItem('aiSniperSettings');
    if (!saved) return;
    
    try {
        const settings = JSON.parse(saved);
        console.log('📂 Загружаем сохраненные настройки:', settings);
        
        // Сохраняем чаты в глобальную переменную для восстановления
        if (settings.selectedChats && settings.selectedChats.length > 0) {
            console.log('💾 Найдены сохраненные чаты, сохраняем для восстановления:', settings.selectedChats);
            window.savedChatsToRestore = settings.selectedChats;
        } else {
            console.log('❌ В настройках нет selectedChats или он пустой');
            console.log('🔍 Проверяем structure settings:', Object.keys(settings));
        }
        
        // Загружаем промпт
        if (settings.mainPrompt) {
            const promptInput = document.getElementById('mainPrompt');
            if (promptInput) {
                promptInput.value = settings.mainPrompt;
            }
        }
        
        // Загружаем стиль общения
        if (settings.communicationStyle) {
            const styleInput = document.querySelector(`input[name="communicationStyle"][value="${settings.communicationStyle}"]`);
            if (styleInput) {
                styleInput.checked = true;
            }
        }
        
        // Загружаем расписание
        if (settings.schedule) {
            const startTimeInput = document.getElementById('startTime');
            const endTimeInput = document.getElementById('endTime');
            
            if (settings.schedule.startTime && startTimeInput) {
                startTimeInput.value = settings.schedule.startTime;
            }
            if (settings.schedule.endTime && endTimeInput) {
                endTimeInput.value = settings.schedule.endTime;
            }
            
            // Загружаем выбранные дни недели
            if (settings.schedule.weekdays) {
                settings.schedule.weekdays.forEach(day => {
                    const checkbox = document.querySelector(`.weekday-options input[value="${day}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки настроек:', error);
    }
}

// Восстановление выбранных чатов
function restoreSelectedChats(savedChats) {
    console.log('🔄 Восстанавливаем выбранные чаты:', savedChats);
    
    savedChats.forEach(chat => {
        const checkbox = document.querySelector(`#chat-${chat.id}`);
        if (checkbox) {
            checkbox.checked = true;
            console.log(`✅ Восстановлен чат: ${chat.name}`);
        } else {
            console.log(`❌ Чат не найден: ${chat.name} (${chat.id})`);
        }
    });
    
    // Обновляем глобальные переменные
    updateSelectedChats();
    updateChatsCounter();
}

// Загрузка данных активности
function loadActivityData() {
    // Здесь можно загружать данные с сервера
    // Пока используем локальные данные
    updateStatusDisplay();
}

// Мониторинг активности (обновление статистики)
let activityInterval;

function startActivityMonitoring() {
    console.log('Мониторинг активности запущен');
    
    activityInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/ai-sniper-stats');
            
            if (!response.ok) {
                console.warn('Сервер временно недоступен, пропускаем обновление');
                return;
            }
            
            const data = await response.json();
            
            if (data.success) {
                activityData = { ...activityData, ...data.stats };
                updateStatusDisplay();
                updateAnalytics();
            }
        } catch (error) {
            console.warn('Временная ошибка соединения с сервером, продолжаем работу');
            // Не показываем ошибку пользователю, это нормально при перезагрузке сервера
        }
    }, 15000); // Увеличиваем интервал до 15 секунд
}

function stopActivityMonitoring() {
    if (activityInterval) {
        clearInterval(activityInterval);
        activityInterval = null;
    }
}

// Обновление аналитики
function updateAnalytics() {
    // Обновляем статистику по чатам
    const chatStatsElement = document.getElementById('chatStats');
    if (activityData.chatStats && Object.keys(activityData.chatStats).length > 0) {
        chatStatsElement.innerHTML = Object.entries(activityData.chatStats)
            .map(([chatName, count]) => `<div class="stat-item">${chatName}: <strong>${count}</strong></div>`)
            .join('');
    } else {
        chatStatsElement.innerHTML = '<div class="no-data">Нет данных</div>';
    }
    
    // Обновляем статистику времени
    const timeStatsElement = document.getElementById('timeStats');
    if (activityData.timeStats && Object.keys(activityData.timeStats).length > 0) {
        timeStatsElement.innerHTML = Object.entries(activityData.timeStats)
            .map(([hour, count]) => `<div class="stat-item">${hour}:00: <strong>${count}</strong></div>`)
            .join('');
    } else {
        timeStatsElement.innerHTML = '<div class="no-data">Нет данных</div>';
    }
}


// Обновление текущего времени и статуса
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU');
    const currentTimeElement = document.getElementById('currentTime');
    const workingStatusElement = document.getElementById('workingStatus');
    
    if (currentTimeElement) {
        currentTimeElement.textContent = timeString;
    }
    
    if (workingStatusElement) {
        const schedule = getScheduleSettings();
        const isWorking = isCurrentlyWorkingTime(schedule);
        workingStatusElement.textContent = isWorking ? '✅ Рабочее время' : '❌ Нерабочее время';
        workingStatusElement.style.color = isWorking ? 'green' : 'red';
    }
}


// Проверка рабочего времени (с поддержкой работы через полночь)
function isCurrentlyWorkingTime(schedule) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    if (!schedule.weekdays.includes(currentDay)) return false;
    
    const startTime = timeToMinutes(schedule.startTime);
    const endTime = timeToMinutes(schedule.endTime);
    
    // Если конец времени меньше начала - работа через полночь
    if (endTime < startTime) {
        // Работаем с startTime до 23:59 ИЛИ с 00:00 до endTime
        return currentTime >= startTime || currentTime <= endTime;
    } else {
        // Обычный режим - в пределах одного дня
        return currentTime >= startTime && currentTime <= endTime;
    }
}

function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

// Сохранение состояния активности
function saveAiSniperState(isActive) {
    localStorage.setItem('aiSniperActive', isActive.toString());
}