// Переменные состояния
let autoKeywords = [];
let isAutoSearchRunning = false;
let autoSearchInterval = null;
let lastMessageIds = {}; // Объект для хранения последних ID по группам
let isCheckingMessages = false; // Новая переменная для предотвращения перекрытия

// DOM элементы (будут инициализированы после загрузки)
let autoSearchInput, autoKeywordsList, autoGroupsList, autoGroupsCounter, statusElement, autoResults;

// Функции управления ключевыми словами
function addAutoKeyword(word) {
    const trimmedWord = word.trim().toLowerCase();
    if (trimmedWord && !autoKeywords.includes(trimmedWord)) {
        autoKeywords.push(trimmedWord);
        updateAutoKeywordsDisplay();
        saveAutoSettings();
    }
}

function removeAutoKeyword(word) {
    autoKeywords = autoKeywords.filter(k => k !== word);
    updateAutoKeywordsDisplay();
    saveAutoSettings();
}

function updateAutoKeywordsDisplay() {
    autoKeywordsList.innerHTML = autoKeywords.map(keyword => `
        <div class="keyword-tag">
            <span>${keyword}</span>
            <button class="keyword-remove" onclick="removeAutoKeyword('${keyword}')">×</button>
        </div>
    `).join('');
}

// Загрузка групп
async function loadAutoGroups() {
    try {
        const response = await fetch('/api/groups');
        const data = await response.json();
        
        if (data.success) {
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

// Сохранение/загрузка настроек
function saveAutoSettings() {
    localStorage.setItem('autoKeywords', JSON.stringify(autoKeywords));
    const selectedGroups = Array.from(document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
    localStorage.setItem('autoSelectedGroups', JSON.stringify(selectedGroups));
}

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

// Обработчик изменения выбора группы
document.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' && e.target.closest('.group-item')) {
        updateAutoGroupsCounter();
        saveAutoSettings();
    }
});

// Обновление счетчика групп
function updateAutoGroupsCounter() {
    const checkedCount = document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked').length;
    autoGroupsCounter.textContent = `Выбрано: ${checkedCount}`;
}

// Обработчик кнопки снятия выбора
function clearAutoSelection() {
    const checkboxes = document.querySelectorAll('#autoGroupsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateAutoGroupsCounter();
    saveAutoSettings();
}

// Обработчик кнопки выбора всех групп
function selectAllAuto() {
    const checkboxes = document.querySelectorAll('#autoGroupsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateAutoGroupsCounter();
    saveAutoSettings();
}

// Функция старта автопоиска
async function startAutoSearch() {
    const selectedGroups = document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked');
    
    if (autoKeywords.length === 0) {
        alert('Добавьте хотя бы одно ключевое слово');
        return;
    }
    
    if (selectedGroups.length === 0) {
        alert('Выберите хотя бы одну группу для мониторинга');
        return;
    }
    
    // Инициализируем lastMessageIds для всех выбранных групп
    // Устанавливаем флаг запуска для возможности остановки во время инициализации
    isAutoSearchRunning = true;
    document.getElementById('startAutoSearch').disabled = true;
    document.getElementById('stopAutoSearch').disabled = false;
    statusElement.textContent = 'Запущен';
    statusElement.className = 'status running';

    // Инициализируем lastMessageIds для всех выбранных групп
        console.log('Инициализация автопоиска...');
        for (const groupCheckbox of selectedGroups) {
            // Проверяем, не была ли нажата кнопка остановки
            if (!isAutoSearchRunning) {
                console.log('Инициализация прервана пользователем');
                return;
            }
            
            const groupElement = groupCheckbox.nextElementSibling;
            const groupName = groupElement.querySelector('.group-name').textContent;
            
            try {
                const response = await fetch('/api/init-autosearch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        groupId: groupCheckbox.value,
                        groupName: groupName
                    })
                });
                
                const data = await response.json();
                if (data.success) {
                    lastMessageIds[groupCheckbox.value] = data.lastMessageId;
                    console.log(`Группа ${groupName}: начальный ID = ${data.lastMessageId}`);
                }
            } catch (error) {
                console.error(`Ошибка инициализации группы ${groupName}:`, error);
            }
            
            // Проверяем еще раз перед паузой
            if (!isAutoSearchRunning) {
                console.log('Инициализация прервана пользователем');
                return;
            }
            
            // Пауза между запросами для избежания flood wait
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Проверяем, не была ли остановка во время инициализации
        if (!isAutoSearchRunning) {
            console.log('Автопоиск был остановлен во время инициализации');
            return;
        }
    
    isAutoSearchRunning = true;
    document.getElementById('startAutoSearch').disabled = true;
    document.getElementById('stopAutoSearch').disabled = false;
    statusElement.textContent = 'Запущен';
    statusElement.className = 'status running';
    
    console.log('Автопоиск запущен! Ожидание новых сообщений...');

    // Запускаем первую проверку сразу
    checkForNewMessages();
    
    // Запускаем проверку каждые 10 секунд, но только после завершения предыдущей
    autoSearchInterval = setInterval(() => {
        if (isAutoSearchRunning) {
            checkForNewMessages();
        }
    }, 10000); // 10 секунд между циклами
}

// Функция остановки автопоиска
function stopAutoSearch() {
    console.log('Останавливаем автопоиск...');
    
    // Сначала устанавливаем флаг остановки
    isAutoSearchRunning = false;
    
    // Останавливаем интервал
    if (autoSearchInterval) {
        clearInterval(autoSearchInterval);
        autoSearchInterval = null;
    }
    
    // Обновляем интерфейс
    document.getElementById('startAutoSearch').disabled = false;
    document.getElementById('stopAutoSearch').disabled = true;
    statusElement.textContent = 'Остановлен';
    statusElement.className = 'status stopped';
    
    console.log('Автопоиск остановлен');
}

// Функция проверки новых сообщений
async function checkForNewMessages() {
    if (!isAutoSearchRunning || isCheckingMessages) return;
    
    isCheckingMessages = true; // Блокируем новые проверки
    
    console.log('Начинаем проверку новых сообщений...');
    const selectedGroups = document.querySelectorAll('#autoGroupsList input[type="checkbox"]:checked');
    
    for (let i = 0; i < selectedGroups.length; i++) {
        if (!isAutoSearchRunning) break; // Проверяем, не остановлен ли поиск
        
        const groupCheckbox = selectedGroups[i];
        
        try {
            const groupElement = groupCheckbox.nextElementSibling;
            const groupName = groupElement.querySelector('.group-name').textContent;
            
            console.log(`Проверяем группу ${i + 1}/${selectedGroups.length}: ${groupName}`);
            
            const response = await fetch('/api/autosearch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    keywords: autoKeywords,
                    groupId: groupCheckbox.value,
                    groupName: groupName,
                    lastMessageId: lastMessageIds[groupCheckbox.value] || 0
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.results.length > 0) {
                console.log(`Найдено ${data.results.length} новых сообщений в ${groupName}`);
                displayNewMessages(data.results);
                
                // Обновляем ID последнего сообщения для этой группы
                const maxId = Math.max(...data.results.map(msg => msg.id));
                lastMessageIds[groupCheckbox.value] = maxId;
            }
        } catch (error) {
            console.error('Ошибка автопоиска:', error);
        }
        
        // Пауза 2 секунды между запросами к разным группам (кроме последней)
        if (i < selectedGroups.length - 1 && isAutoSearchRunning) {
            console.log('Пауза 2 секунды до следующей группы...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('Проверка всех групп завершена. Пауза 10 секунд до следующего цикла...');
    isCheckingMessages = false; // Разблокируем проверки
}

// Функция отображения новых сообщений
function displayNewMessages(messages) {
    messages.forEach(message => {
        // Подсвечиваем ключевые слова
        let highlightedText = message.text;
        autoKeywords.forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            highlightedText = highlightedText.replace(regex, `<mark>$&</mark>`);
        });
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message-item new-message';
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-group">${message.groupName}</span>
                <span class="message-sender">От: ${message.sender || 'Неизвестно'}</span>
                <span class="message-date">${message.date}</span>
                <a href="${message.link}" target="_blank" class="message-link">Открыть в Telegram</a>
            </div>
            <div class="message-text">${highlightedText}</div>
        `;
        
        // Добавляем в начало списка результатов
        autoResults.insertBefore(messageElement, autoResults.firstChild);
        
        // Сохраняем результаты
        saveAutoResults();
    });
}

// Сохранение результатов автопоиска
function saveAutoResults() {
    const messages = Array.from(autoResults.children).map(element => ({
        html: element.outerHTML
    }));
    localStorage.setItem('autoSearchResults', JSON.stringify(messages));
}

// Загрузка сохраненных результатов
function loadAutoResults() {
    const savedResults = localStorage.getItem('autoSearchResults');
    if (savedResults) {
        try {
            const results = JSON.parse(savedResults);
            autoResults.innerHTML = results.map(result => result.html).join('');
        } catch (error) {
            console.error('Ошибка загрузки результатов:', error);
        }
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Загружаем информацию о сессии
    await loadSessionInfo();
    // Инициализация DOM элементов
    autoSearchInput = document.getElementById('autoSearchInput');
    autoKeywordsList = document.getElementById('autoKeywordsList');
    autoGroupsList = document.getElementById('autoGroupsList');
    autoGroupsCounter = document.getElementById('autoGroupsCounter');
    statusElement = document.getElementById('autoSearchStatus');
    autoResults = document.getElementById('autoResults');
    
    // Обработчик ввода ключевых слов
    autoSearchInput.addEventListener('keypress', (e) => {
        if (e.key === ' ') {
            e.preventDefault();
            const word = autoSearchInput.value.trim();
            if (word) {
                addAutoKeyword(word);
                autoSearchInput.value = '';
            }
        }
    });
    
    await loadAutoGroups();
    loadAutoResults();
    
    // Обработчики кнопок
    document.getElementById('startAutoSearch').addEventListener('click', startAutoSearch);
    document.getElementById('stopAutoSearch').addEventListener('click', stopAutoSearch);
    document.getElementById('clearAutoSelection').addEventListener('click', clearAutoSelection);
    document.getElementById('selectAllAuto').addEventListener('click', selectAllAuto);
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