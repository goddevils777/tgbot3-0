// Переменные состояния
let autoKeywords = [];
let currentSessionId = null;
let autoSearchActive = false;




// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadSessionInfo();
    await loadAutoSearchStatus();
    await displayGroups();
    loadAutoSettings();
    setupEventHandlers();
    
    // Обновляем статус каждые 10 секунд
    setInterval(loadAutoSearchStatus, 10000);
    
    // ДОБАВЬ ЭТУ СТРОКУ - автообновление результатов каждые 15 секунд
    setInterval(loadAutoSearchResults, 15000);
});


// Загрузка информации о текущей сессии
async function loadSessionInfo() {
    try {
        const response = await fetch('/api/current-session');
        const data = await response.json();
        
        const sessionInfoDiv = document.getElementById('sessionInfo');
        const currentSessionDiv = document.getElementById('currentSessionName');
        
        if (data.success && data.session) {
            sessionInfoDiv.innerHTML = `
                <span>Сессия: ${data.session.name}</span>
                <span>•</span>
                <span>${data.session.phone}</span>
            `;
            sessionInfoDiv.className = 'session-info';
            
            currentSessionDiv.innerHTML = `Автопоиск для сессии: ${data.session.name}`;
            currentSessionId = data.session.id;
        } else {
            sessionInfoDiv.innerHTML = '<span>Нет активной сессии</span>';
            sessionInfoDiv.className = 'session-info no-session';
            
            currentSessionDiv.innerHTML = '<span class="session-loading">Нет активной сессии</span>';
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о сессии:', error);
        const sessionInfoDiv = document.getElementById('sessionInfo');
        sessionInfoDiv.innerHTML = '<span>Ошибка загрузки</span>';
        sessionInfoDiv.className = 'session-info no-session';
    }
}

// Загрузка статуса автопоиска
async function loadAutoSearchStatus() {
    try {
        const response = await fetch('/api/autosearch-status');
        const data = await response.json();
        
        if (data.success) {
            displayAutoSearchStatus(data.searches);
            updateControlsStatus(data.searches);
        }
    } catch (error) {
        console.error('Ошибка загрузки статуса автопоиска:', error);
        document.getElementById('autoSearchStatus').innerHTML = 
            '<div class="status-loading">Ошибка загрузки статуса</div>';
    }
}

// Отображение статуса автопоиска
function displayAutoSearchStatus(searches) {
    const statusDiv = document.getElementById('autoSearchStatus');
    
    if (searches.length === 0) {
        statusDiv.innerHTML = '<div class="status-loading">Автопоиск не запущен</div>';
        return;
    }
    
    const search = searches[0]; // Только один автопоиск
    statusDiv.innerHTML = `
        <div class="status-item ${search.isActive ? 'active' : 'inactive'}">
            <div class="status-info">
                <div class="session-name-large">${search.sessionName}</div>
                <div class="status-details">
                    ${search.isActive ? 
                        `Активен • Найдено сообщений: ${search.resultsCount} • Последняя проверка: ${search.lastCheck ? new Date(search.lastCheck).toLocaleString('ru-RU') : 'Ещё не проверялось'}` :
                        'Остановлен'
                    }
                </div>
            </div>
            <div class="status-badge ${search.isActive ? 'active' : 'inactive'}">
                ${search.isActive ? 'Активен' : 'Остановлен'}
            </div>
        </div>
    `;
    // Автоматически загружаем результаты если автопоиск активен
    if (searches.length > 0 && searches[0].isActive) {
        loadAutoSearchResults();
    }
}

// Обновление состояния кнопок управления
function updateControlsStatus(searches) {
    const startBtn = document.getElementById('startAutoSearch');
    const stopBtn = document.getElementById('stopAutoSearch');
    const statusSpan = document.getElementById('currentStatus');
    
    const isActive = searches.length > 0 && searches[0].isActive;
    autoSearchActive = isActive;
    
    if (isActive) {
        statusSpan.textContent = 'Активен';
        statusSpan.className = 'status active';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusSpan.textContent = 'Остановлен';
        statusSpan.className = 'status stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// Загрузка групп для автопоиска
async function displayGroups() {
    try {
        const response = await fetch('/api/groups');
        const data = await response.json();
        
        if (data.success) {
            const autoGroupsList = document.getElementById('autoGroupsList');
            autoGroupsList.innerHTML = data.groups.map(group => `
                <div class="group-item">
                    <input type="checkbox" id="auto-group-${group.id}" value="${group.id}">
                    <label for="auto-group-${group.id}">
                        <span class="group-name">${group.name}</span>
                        <span class="group-username">${group.type} • ${group.participantsCount || 0} участников</span>
                    </label>
                </div>
            `).join('');
            
            loadAutoSettings();
        }
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
    }
}

// Настройка обработчиков событий
function setupEventHandlers() {
    const autoSearchInput = document.getElementById('autoSearchInput');
    const startBtn = document.getElementById('startAutoSearch');
    const stopBtn = document.getElementById('stopAutoSearch');
    
    
    // Обработка ввода ключевых слов
    autoSearchInput.addEventListener('keypress', (e) => {
        if (e.key === ' ' && autoSearchInput.value.trim()) {
            addAutoKeyword(autoSearchInput.value.trim());
            autoSearchInput.value = '';
            e.preventDefault();
        }
    });
    
    // Кнопки управления автопоиском
    startBtn.addEventListener('click', startAutoSearch);
    stopBtn.addEventListener('click', stopAutoSearch);
    
    // Кнопки выбора групп
    document.getElementById('selectAllAuto').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#autoGroupsList input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.checked = true);
        updateAutoGroupsCounter();
        saveAutoSettings();
    });
    
    document.getElementById('clearAutoSelection').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#autoGroupsList input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.checked = false);
        updateAutoGroupsCounter();
        saveAutoSettings();
    });
    
    // Обработчик изменения выбора групп
    document.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.closest('#autoGroupsList')) {
            updateAutoGroupsCounter();
            saveAutoSettings();
        }
    });
}

// Добавление ключевого слова
function addAutoKeyword(keyword) {
    if (keyword && !autoKeywords.includes(keyword)) {
        autoKeywords.push(keyword);
        updateAutoKeywordsDisplay();
        saveAutoSettings();
    }
}

// Удаление ключевого слова
function removeAutoKeyword(keyword) {
    autoKeywords = autoKeywords.filter(k => k !== keyword);
    updateAutoKeywordsDisplay();
    saveAutoSettings();
}

// Обновление отображения ключевых слов
function updateAutoKeywordsDisplay() {
    const keywordsList = document.getElementById('autoKeywordsList');
    keywordsList.innerHTML = autoKeywords.map(keyword => 
        `<span class="keyword-tag">${keyword} <button onclick="removeAutoKeyword('${keyword}')">&times;</button></span>`
    ).join('');
}

// Обновление счетчика групп
function updateAutoGroupsCounter() {
    const checkedCount = document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked').length;
    document.getElementById('autoGroupsCounter').textContent = `Выбрано: ${checkedCount}`;
}

// Запуск автопоиска
async function startAutoSearch() {
    if (autoKeywords.length === 0) {
        alert('Добавьте хотя бы одно ключевое слово');
        return;
    }
    
    const selectedGroups = getSelectedAutoGroups();
    if (selectedGroups.length === 0) {
        alert('Выберите хотя бы одну группу');
        return;
    }
    
    try {
        const response = await fetch('/api/start-autosearch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                keywords: autoKeywords,
                groups: selectedGroups
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Автопоиск запущен!');
            await loadAutoSearchStatus();
        } else {
            alert(`Ошибка запуска автопоиска: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Остановка автопоиска
async function stopAutoSearch() {
    try {
        const response = await fetch('/api/stop-autosearch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Автопоиск остановлен!');
            await loadAutoSearchStatus();
        } else {
            alert(`Ошибка остановки автопоиска: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    }
}

// Получение выбранных групп
function getSelectedAutoGroups() {
    const checkboxes = document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked');
    const selectedGroups = [];
    
    checkboxes.forEach(checkbox => {
        const groupId = checkbox.value;
        const label = checkbox.nextElementSibling;
        const groupName = label.querySelector('.group-name').textContent;
        
        selectedGroups.push({
            id: groupId,
            name: groupName
        });
    });
    
    return selectedGroups;
}

// Загрузка результатов автопоиска
async function loadAutoSearchResults() {
    try {
        const response = await fetch('/api/autosearch-results');
        const data = await response.json();
        
        if (data.success) {
            displayAutoResults(data.results, data.sessionName);
        } else {
            document.getElementById('autoResults').innerHTML = '<p>Нет результатов автопоиска</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки результатов:', error);
        document.getElementById('autoResults').innerHTML = '<p>Ошибка загрузки результатов</p>';
    }
}

// Отображение результатов автопоиска
function displayAutoResults(results, sessionName) {
    const autoResultsDiv = document.getElementById('autoResults');
    
    if (!results || results.length === 0) {
        autoResultsDiv.innerHTML = '<p>Пока нет результатов автопоиска</p>';
        return;
    }
    
    // Сортируем результаты по времени (новые сверху)
    results.sort((a, b) => b.timestamp - a.timestamp);
    
    const html = results.map(msg => `
        <div class="message-item">
            <div class="message-header">
                <span class="message-group">${msg.groupName}</span>
                <span class="message-sender">От: ${msg.sender || 'Неизвестно'}</span>
                <span class="message-date">${msg.date}</span>
                <a href="${msg.link}" target="_blank" class="message-link">Открыть в Telegram</a>
            </div>
            <div class="message-text">${msg.text}</div>
        </div>
    `).join('');
    
    autoResultsDiv.innerHTML = `
        <p style="margin-bottom: 20px;">Найдено сообщений: ${results.length}</p>
        ${html}
    `;

    const saveAutosearchButton = document.getElementById('saveAutosearchToHistory');
    if (saveAutosearchButton) {
        if (results && results.length > 0) {
            saveAutosearchButton.style.display = 'block';
        } else {
            saveAutosearchButton.style.display = 'none';
        }
    }
}

// Сохранение настроек
function saveAutoSettings() {
    localStorage.setItem('autoKeywords', JSON.stringify(autoKeywords));
    const selectedGroups = Array.from(document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
    localStorage.setItem('autoSelectedGroups', JSON.stringify(selectedGroups));
}

// Загрузка настроек
function loadAutoSettings() {
    const savedKeywords = localStorage.getItem('autoKeywords');
    if (savedKeywords) {
        autoKeywords = JSON.parse(savedKeywords);
        updateAutoKeywordsDisplay();
    }
    
    const savedGroups = localStorage.getItem('autoSelectedGroups');
    if (savedGroups) {
        const groupIds = JSON.parse(savedGroups);
        groupIds.forEach(groupId => {
            const checkbox = document.querySelector(`#auto-group-${groupId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        updateAutoGroupsCounter();
    }
}

// Функция для сохранения результатов автопоиска в историю
function saveAutosearchToHistory() {
    // Получаем текущие результаты автопоиска
    const autoResults = document.querySelectorAll('.message-item');
    
    if (autoResults.length === 0) {
        alert('Нет результатов автопоиска для сохранения');
        return;
    }
    
    // Создаем объект истории если его нет
    if (!window.historyManager) {
        window.historyManager = {
            addToHistory: function(type, data) {
                const history = JSON.parse(localStorage.getItem('telegram_bot_history') || '{"search":[],"livestream":[],"autosearch":[]}');
                const record = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    ...data
                };
                history[type].unshift(record);
                if (history[type].length > 50) {
                    history[type] = history[type].slice(0, 50);
                }
                localStorage.setItem('telegram_bot_history', JSON.stringify(history));
                return record.id;
            }
        };
    }
    
    // Получаем настройки автопоиска
    const keywords = Array.from(document.querySelectorAll('.keyword-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    const selectedGroups = Array.from(document.querySelectorAll('#autoGroupsList input:checked')).length;
    
    // Подготавливаем данные для сохранения
    const historyData = {
        keywords: keywords,
        groupsCount: selectedGroups,
        messagesCount: autoResults.length,
        searchParams: {
            isAutosearch: true,
            startedAt: new Date().toISOString()
        },
        results: Array.from(autoResults).map(item => {
            const messageText = item.querySelector('.message-text')?.textContent || '';
            const groupName = item.querySelector('.message-group')?.textContent || '';
            const sender = item.querySelector('.message-sender')?.textContent || '';
            return {
                text: messageText,
                groupName: groupName,
                sender: sender
            };
        })
    };
    
    // Сохраняем в историю
    const savedId = window.historyManager.addToHistory('autosearch', historyData);
    
    // Показываем уведомление
    alert(`Результаты автопоиска сохранены в историю!\nКлючевые слова: ${keywords.join(', ')}\nНайдено: ${autoResults.length} сообщений`);
    
    console.log('Результаты автопоиска сохранены с ID:', savedId);
}

// Обработчик кнопки сохранения автопоиска
document.addEventListener('DOMContentLoaded', () => {
    const saveAutosearchButton = document.getElementById('saveAutosearchToHistory');
    if (saveAutosearchButton) {
        saveAutosearchButton.addEventListener('click', saveAutosearchToHistory);
    }
});

// Автоматически загружаем результаты при загрузке страницы
setTimeout(loadAutoSearchResults, 1000);