// Элементы DOM
const searchInput = document.getElementById('searchInput');
const messageCount = document.getElementById('messageCount');
const searchBtn = document.getElementById('searchBtn');
const groupsList = document.getElementById('groupsList');
const results = document.getElementById('results');
// Массив ключевых слов
let keywords = [];




// Функция выхода из системы
async function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        try {
            // Останавливаем все автопоиски пользователя перед выходом
            await fetch('/api/stop-all-autosearch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // Очищаем cookie на клиенте
            document.cookie = 'userId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            
            // Перенаправляем на страницу входа
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Ошибка при выходе:', error);
            // Все равно выходим даже если API недоступен
            document.cookie = 'userId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/login.html';
        }
    }
}

// Функция добавления ключевого слова
function addKeyword(word) {
    const trimmedWord = word.trim().toLowerCase();
    if (trimmedWord && !keywords.includes(trimmedWord)) {
        keywords.push(trimmedWord);
        updateKeywordsDisplay();
        saveKeywords();
    }
}

// Функция удаления ключевого слова
function removeKeyword(word) {
    keywords = keywords.filter(k => k !== word);
    updateKeywordsDisplay();
    saveKeywords();
}

// Функция отображения ключевых слов
function updateKeywordsDisplay() {
    const keywordsList = document.getElementById('keywordsList');
    keywordsList.innerHTML = keywords.map(keyword => `
        <div class="keyword-tag">
            <span>${keyword}</span>
            <button class="keyword-remove" onclick="removeKeyword('${keyword}')">×</button>
        </div>
    `).join('');
}

// Сохранение ключевых слов
function saveKeywords() {
    localStorage.setItem('searchKeywords', JSON.stringify(keywords));
}

// Загрузка ключевых слов
function loadKeywords() {
    const savedKeywords = localStorage.getItem('searchKeywords');
    if (savedKeywords) {
        keywords = JSON.parse(savedKeywords);
        updateKeywordsDisplay();
    }
}

// Загрузка сохранённых настроек
function loadSettings() {
    const savedKeyword = localStorage.getItem('lastKeyword');
    const savedCount = localStorage.getItem('lastCount');
    const savedSearch = localStorage.getItem('lastSearch');
    
    if (savedKeyword) searchInput.value = savedKeyword;
    if (savedCount) messageCount.value = savedCount;
    if (savedSearch && !searchInput.value) searchInput.value = savedSearch;
    
    // Загружаем сохраненные ключевые слова
    loadKeywords();
}

// Найди функцию loadLastResults и исправь:
function loadLastResults() {
    const savedResults = localStorage.getItem('lastResults');
    const savedKeyword = localStorage.getItem('lastKeywordUsed');
    
    if (savedResults && savedKeyword) {
        try {
            const results = JSON.parse(savedResults);
            if (results.length > 0) {
                // ПРОВЕРЬ ЭТУ СТРОКУ - она должна быть такой:
                displayResults(results, savedKeyword);
                showClearButton();
            }
        } catch (error) {
            console.error('Ошибка загрузки сохраненных результатов:', error);
        }
    }

    // Показываем кнопки для сохраненных результатов
    const saveButton = document.getElementById('saveToHistory');
    const clearButton = document.getElementById('clearResultsBtn');

    if (saveButton) saveButton.style.display = 'block';
    if (clearButton) clearButton.style.display = 'block';
}

// Сохранение настроек
function saveSettings() {
    localStorage.setItem('lastKeyword', searchInput.value);
    localStorage.setItem('lastCount', messageCount.value);
    localStorage.setItem('lastSearch', searchInput.value);
}

// Загружаем при старте
loadSettings();

// Найди обработчик поиска и замени на это:
searchBtn.addEventListener('click', async () => {
    // Добавляем текущее слово из поля если есть
    const currentWord = searchInput.value.trim();
    if (currentWord) {
        addKeyword(currentWord);
        searchInput.value = '';
    }
    
    const count = parseInt(messageCount.value) || 100;
    const selectedGroups = getSelectedGroups();
    
    if (keywords.length === 0) {
        notify.warning('Добавьте хотя бы одно ключевое слово для поиска');
        return;
    }
    
    if (selectedGroups.length === 0) {
        notify.warning('Выберите хотя бы одну группу');
        return;
    }

    saveSettings();

    results.innerHTML = `
        <div class="loading-container">
            <div class="loader"></div>
            <p>Ищем сообщения...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                keywords: keywords,
                groups: selectedGroups,
                limit: count
            })
        });
        
        const data = await response.json();
        console.log('Ответ от сервера:', data); // Отладка
        
        if (data.success) {
            // Сохраняем результаты для истории
            window.lastSearchResults = data.messages || [];
            
            // Отображаем результаты
            displayResults(data.messages, keywords[0]);
            
            // Показываем кнопки если есть результаты
            const saveButton = document.getElementById('saveToHistory');
            const clearButton = document.getElementById('clearResultsBtn');
            
            if (window.lastSearchResults.length > 0) {
                if (saveButton) saveButton.style.display = 'block';
                if (clearButton) clearButton.style.display = 'block';
            } else {
                if (saveButton) saveButton.style.display = 'none';
                if (clearButton) clearButton.style.display = 'none';
            }
        } else {
            results.innerHTML = `<p>Ошибка: ${data.error}</p>`;
        }

    } catch (error) {
        console.error('Ошибка поиска:', error);
        results.innerHTML = `<p>Ошибка соединения: ${error.message}</p>`;
    }
});

// Поиск по нажатию Enter
searchInput.addEventListener('keypress', (e) => {
    if (e.key === ' ') {
        e.preventDefault();
        const word = searchInput.value.trim();
        if (word) {
            addKeyword(word);
            searchInput.value = '';
        }
    } else if (e.key === 'Enter') {
        // Добавляем текущее слово и запускаем поиск
        const word = searchInput.value.trim();
        if (word) {
            addKeyword(word);
            searchInput.value = '';
        }
        if (keywords.length > 0) {
            searchBtn.click();
        }
    }
});

messageCount.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});


// Тестовые данные групп
const testGroups = [
    { id: 1, name: 'Новости технологий', username: '@technews' },
    { id: 2, name: 'JavaScript сообщество', username: '@jscomm' },
    { id: 3, name: 'Криптовалюты', username: '@cryptochat' },
    { id: 4, name: 'Дизайн и UI/UX', username: '@designchat' }
];

// Функция отображения групп
async function displayGroups() {
    try {
        const response = await fetch('/api/groups');
        const data = await response.json();
        
        if (data.success) {
            groupsList.innerHTML = data.groups.map(group => `
                <div class="group-item">
                    <input type="checkbox" id="group-${group.id}" value="${group.id}">
                    <label for="group-${group.id}">
                        <span class="group-name">${group.name}</span>
                        <span class="group-username">${group.type} • ${group.participantsCount || 0} участников</span>
                    </label>
                </div>
            `).join('');
            
            // Загружаем сохраненные выборы
            loadSelectedGroups();
        }
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
    }
}

// Обработчик кнопки AI анализа
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const aiPrompt = document.getElementById('aiPrompt').value.trim();
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    if (!aiPrompt) {
        alert('Введите промпт для AI анализа');
        return;
    }
    
    // Получаем текущие результаты поиска
    const currentResults = JSON.parse(localStorage.getItem('lastResults') || '[]');
    if (currentResults.length === 0) {
        notify.warning('Сначала выполните поиск сообщений');
        return;
    }
    
    // Блокируем кнопку и показываем загрузку
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Анализирую...';
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: currentResults,
                prompt: aiPrompt
            })
        });
        
        const data = await response.json();
        console.log('Ответ от сервера:', data);

        
    if (data.success) {
        const results = document.getElementById('results');
        
        // Показываем сводку
        results.innerHTML += `
            <div class="ai-analysis-result">
                <h3>Результат AI фильтрации:</h3>
                <div class="analysis-summary">${data.analysis.summary}</div>
            </div>
        `;
        
        // Если есть отфильтрованные сообщения - показываем их
        if (data.analysis.filteredMessages && data.analysis.filteredMessages.length > 0) {
            // Обновляем глобальную переменную для сохранения в историю
            window.lastSearchResults = data.analysis.filteredMessages;
            
            // Показываем отфильтрованные сообщения

            // Показываем отфильтрованные сообщения
            displayResults(data.analysis.filteredMessages, 'AI фильтрация');

            // Обновляем заголовок результатов
            const resultsSection = document.querySelector('.results-section h2');
            if (resultsSection) {
                resultsSection.textContent = `🤖 Результаты AI фильтрации (${data.analysis.filteredCount} из ${data.analysis.originalCount})`;
            }
            
            // Показываем кнопки
            const saveButton = document.getElementById('saveToHistory');
            const clearButton = document.getElementById('clearResultsBtn');
            
            if (saveButton) saveButton.style.display = 'block';
            if (clearButton) clearButton.style.display = 'block';
        }
    } else {
       notify.error(`Ошибка AI анализа: ${data.error}`);
    }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Анализировать через AI';
    }
});


// Функция загрузки информации о сессии
async function loadSessionInfo() {
    try {
        const response = await fetch('/api/session-info');
        const data = await response.json();
        
        const sessionInfoDiv = document.getElementById('sessionInfo');
        
        if (data.success && data.session) {
            sessionInfoDiv.innerHTML = `
                <span>Сессия: ${data.session.name}</span>
                <span>•</span>
                <span>${data.session.phone}</span>
            `;
            sessionInfoDiv.className = 'session-info';
        } else {
            sessionInfoDiv.innerHTML = '<span>Нет активной сессии</span>';
            sessionInfoDiv.className = 'session-info no-session';
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о сессии:', error);
        const sessionInfoDiv = document.getElementById('sessionInfo');
        sessionInfoDiv.innerHTML = '<span>Ошибка загрузки</span>';
        sessionInfoDiv.className = 'session-info no-session';
    }
}

// Вызываем при загрузке страницы
(async () => {
    await loadSessionInfo();
    await displayGroups();
    loadLastResults();
})();

// Функция получения выбранных групп
function getSelectedGroups() {
    const checkboxes = document.querySelectorAll('.group-item input[type="checkbox"]:checked');
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

// Найди функцию displayResults и обнови её:
function displayResults(messages, keyword) {
    console.log('displayResults вызвана с:', messages.length, 'сообщений');
    console.log('Первое сообщение:', messages[0]);
    const results = document.getElementById('results');
    
    // Добавь проверку на undefined/null
    if (!messages || !Array.isArray(messages)) {
        console.error('Ошибка: messages не является массивом', messages);
        results.innerHTML = '<p>Ошибка загрузки результатов</p>';
        return;
    }
    
    if (messages.length === 0) {
        results.innerHTML = '<p>Сообщения не найдены</p>';
        return;
    }
    
    const html = messages.map(msg => {
        // Добавь проверки на каждое поле
        const messageText = msg && msg.text ? msg.text : 'Нет текста';
        const groupName = msg && msg.groupName ? msg.groupName : 'Неизвестная группа';
        const sender = msg && msg.sender ? msg.sender : 'Неизвестно';
        const date = msg && msg.date ? msg.date : 'Неизвестно';
        const link = msg && msg.link ? msg.link : '#';
        
        // Подсветка ключевого слова
        const highlightedText = keyword ? messageText.replace(
            new RegExp(keyword, 'gi'),
            `<mark>$&</mark>`
        ) : messageText;
        
        return `
            <div class="message-item">
                <div class="message-header">
                    <span class="message-group">${groupName}</span>
                    <span class="message-sender">От: ${sender}</span>
                    <span class="message-date">${date}</span>
                    <a href="${link}" target="_blank" class="message-link">Открыть в Telegram</a>
                </div>
                <div class="message-text">${highlightedText}</div>
            </div>
        `;
    }).join('');
    
    results.innerHTML = `
        <p style="margin-bottom: 20px;">Найдено сообщений: ${messages.length}</p>
        ${html}
    `;

    // Показываем секцию AI анализа если есть результаты
    const aiSection = document.querySelector('.ai-section');
    if (messages.length > 0) {
        aiSection.style.display = 'block';
        showClearButton();
    } else {
        aiSection.style.display = 'none';
    }

    // Сохраняем результаты поиска
    localStorage.setItem('lastResults', JSON.stringify(messages));
    localStorage.setItem('lastKeywordUsed', keyword);

    const saveButton = document.getElementById('saveToHistory');
    const clearButton = document.getElementById('clearResultsBtn');

    if (messages && messages.length > 0) {
        // Сохраняем результаты для истории если их еще нет
        if (!window.lastSearchResults) {
            window.lastSearchResults = messages;
        }
        
        if (saveButton) saveButton.style.display = 'block';
        if (clearButton) clearButton.style.display = 'block';
    } else {
        if (saveButton) saveButton.style.display = 'none';
        if (clearButton) clearButton.style.display = 'none';
    }
}

// Функция обновления счётчика групп
function updateGroupsCounter() {
    const checkedCount = document.querySelectorAll('.group-item input[type="checkbox"]:checked').length;
    document.getElementById('groupsCounter').textContent = `Выбрано: ${checkedCount}`;
}

// Сохранение выбранных групп
function saveSelectedGroups() {
    const checkboxes = document.querySelectorAll('.group-item input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    localStorage.setItem('selectedGroups', JSON.stringify(selectedIds));
}

// Загрузка выбранных групп
function loadSelectedGroups() {
    const savedGroups = localStorage.getItem('selectedGroups');
    if (savedGroups) {
        const selectedIds = JSON.parse(savedGroups);
        selectedIds.forEach(id => {
            const checkbox = document.querySelector(`#group-${id}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        updateGroupsCounter();
    }
}

// Функция очистки результатов
function clearResults() {
    if (confirm('Вы уверены, что хотите очистить все результаты поиска?')) {
        // Очищаем результаты на странице
        results.innerHTML = '';
        
        // Скрываем AI секцию
        const aiSection = document.querySelector('.ai-section');
        aiSection.style.display = 'none';
        
        // Скрываем кнопку очистки
        document.getElementById('clearResultsBtn').style.display = 'none';
        
        // Очищаем сохраненные результаты
        localStorage.removeItem('lastResults');
        localStorage.removeItem('lastKeywordUsed');
        
        console.log('Результаты поиска очищены');
    }
}

// Функция показа кнопки очистки
function showClearButton() {
    document.getElementById('clearResultsBtn').style.display = 'block';
}


// Функция для сохранения результатов поиска в историю
function saveSearchToHistory() {
    if (!window.lastSearchResults || window.lastSearchResults.length === 0) {
        alert('Нет результатов для сохранения');
        return;
    }
    
    // Создаем объект истории
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
    
    // Получаем текущие параметры поиска
    const keywords = Array.from(document.querySelectorAll('.keyword-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    const selectedGroups = Array.from(document.querySelectorAll('#groupsList input:checked')).length;
    
    // Сохраняем в историю
    const historyData = {
        keywords: keywords,
        groupsCount: selectedGroups,
        messagesCount: window.lastSearchResults.length,
        messages: window.lastSearchResults,
        searchParams: {
            messageCount: document.getElementById('messageCount').value
        }
    };
    
    const savedId = window.historyManager.addToHistory('search', historyData);
    
    // Показываем уведомление
    alert(`Результаты поиска сохранены в историю!\nНайдено: ${window.lastSearchResults.length} сообщений`);
    
    console.log('Результаты поиска сохранены с ID:', savedId);
}





document.addEventListener('DOMContentLoaded', function() {
    // Добавляем обработчик для кнопки сохранения
    const saveButton = document.getElementById('saveToHistory');
    if (saveButton) {
        saveButton.addEventListener('click', saveSearchToHistory);
        console.log('Обработчик кнопки сохранения добавлен');
    } else {
        console.error('Кнопка saveToHistory не найдена');
    }
});

// Обработчик кнопки очистки
document.getElementById('clearResultsBtn').addEventListener('click', clearResults);


// Добавляем слушатель на изменение чекбоксов
document.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' && e.target.closest('.group-item')) {
        updateGroupsCounter();
        saveSelectedGroups();
    }
});

// Обработчики кнопок выбора групп
document.getElementById('selectAllBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.group-item input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateGroupsCounter();
});

document.getElementById('deselectAllBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.group-item input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateGroupsCounter();
});
