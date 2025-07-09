// Элементы DOM
const searchInput = document.getElementById('searchInput');
const messageCount = document.getElementById('messageCount');
const searchBtn = document.getElementById('searchBtn');
const groupsList = document.getElementById('groupsList');
const results = document.getElementById('results');
// Массив ключевых слов
let keywords = [];

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

// Загрузка сохраненных результатов поиска
function loadLastResults() {
    const savedResults = localStorage.getItem('lastResults');
    const savedKeyword = localStorage.getItem('lastKeywordUsed');
    
    if (savedResults && savedKeyword) {
        try {
            const results = JSON.parse(savedResults);
            if (results.length > 0) {
                displayResults(results, savedKeyword);
            }
        } catch (error) {
            console.error('Ошибка загрузки сохраненных результатов:', error);
        }
    }
}

// Сохранение настроек
function saveSettings() {
    localStorage.setItem('lastKeyword', searchInput.value);
    localStorage.setItem('lastCount', messageCount.value);
    localStorage.setItem('lastSearch', searchInput.value);
}

// Загружаем при старте
loadSettings();

// Обработчик кнопки поиска
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
        alert('Добавьте хотя бы одно ключевое слово для поиска');
        return;
    }
    
    if (selectedGroups.length === 0) {
        alert('Выберите хотя бы одну группу');
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
        
        if (data.success) {
            displayResults(data.results, keywords.join(', '));
        } else {
            results.innerHTML = `<p>Ошибка: ${data.error}</p>`;
        }
    } catch (error) {
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
        alert('Сначала выполните поиск сообщений');
        return;
    }
    
    // Блокируем кнопку и показываем загрузку
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Анализирую...';
    
    try {
        const response = await fetch('/api/ai-analyze', {
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
        
        if (data.success) {
            displayResults(data.results, localStorage.getItem('lastKeywordUsed') || '');
        } else {
            alert(`Ошибка AI анализа: ${data.error}`);
        }
    } catch (error) {
        alert(`Ошибка соединения: ${error.message}`);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Анализировать через AI';
    }
});


// Вызываем при загрузке страницы
(async () => {
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

// Функция отображения результатов
function displayResults(messages, keyword) {
    if (messages.length === 0) {
        results.innerHTML = '<p>Сообщения не найдены</p>';
        return;
    }
    
    const html = messages.map(msg => {
        // Подсветка ключевого слова
        const highlightedText = msg.text.replace(
            new RegExp(keyword, 'gi'),
            `<mark>$&</mark>`
        );
        
        return `
            <div class="message-item">
                <div class="message-header">
                    <span class="message-group">${msg.groupName}</span>
                    <span class="message-sender">От: ${msg.sender || 'Неизвестно'}</span>
                    <span class="message-date">${msg.date}</span>
                    <a href="${msg.link}" target="_blank" class="message-link">Открыть в Telegram</a>
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
        } else {
            aiSection.style.display = 'none';
        }

        // Сохраняем результаты поиска
        localStorage.setItem('lastResults', JSON.stringify(messages));
        localStorage.setItem('lastKeywordUsed', keyword);

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