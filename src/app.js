// Элементы DOM
const searchInput = document.getElementById('searchInput');
const messageCount = document.getElementById('messageCount');
const searchBtn = document.getElementById('searchBtn');
const groupsList = document.getElementById('groupsList');
const results = document.getElementById('results');

// Загрузка сохранённых настроек
function loadSettings() {
    const savedKeyword = localStorage.getItem('lastKeyword');
    const savedCount = localStorage.getItem('lastCount');
    
    if (savedKeyword) searchInput.value = savedKeyword;
    if (savedCount) messageCount.value = savedCount;
}

// Сохранение настроек
function saveSettings() {
    localStorage.setItem('lastKeyword', searchInput.value);
    localStorage.setItem('lastCount', messageCount.value);
}

// Загружаем при старте
loadSettings();

// Обработчик кнопки поиска
searchBtn.addEventListener('click', async () => {
    const keyword = searchInput.value.trim();
    const count = parseInt(messageCount.value) || 100;
    const selectedGroups = getSelectedGroups();
    
    if (!keyword) {
        alert('Введите ключевое слово для поиска');
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
                keyword: keyword,
                groups: selectedGroups,
                limit: count
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayResults(data.results, keyword);
        } else {
            results.innerHTML = `<p>Ошибка: ${data.error}</p>`;
        }
    } catch (error) {
        results.innerHTML = `<p>Ошибка соединения: ${error.message}</p>`;
    }
});

// Поиск по нажатию Enter
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
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
function displayGroups() {
    groupsList.innerHTML = testGroups.map(group => `
        <div class="group-item">
            <input type="checkbox" id="group-${group.id}" value="${group.id}">
            <label for="group-${group.id}">
                <span class="group-name">${group.name}</span>
                <span class="group-username">${group.username}</span>
            </label>
        </div>
    `).join('');
}

// Вызываем при загрузке страницы
displayGroups();

// Функция получения выбранных групп
function getSelectedGroups() {
    const checkboxes = document.querySelectorAll('.group-item input[type="checkbox"]:checked');
    const selectedGroups = [];
    
    checkboxes.forEach(checkbox => {
        const groupId = parseInt(checkbox.value);
        const group = testGroups.find(g => g.id === groupId);
        if (group) {
            selectedGroups.push(group);
        }
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
                    <span class="message-date">${msg.date}</span>
                </div>
                <div class="message-text">${highlightedText}</div>
            </div>
        `;
    }).join('');
    
    results.innerHTML = `
        <p style="margin-bottom: 20px;">Найдено сообщений: ${messages.length}</p>
        ${html}
    `;
}

// Функция обновления счётчика групп
function updateGroupsCounter() {
    const checkedCount = document.querySelectorAll('.group-item input[type="checkbox"]:checked').length;
    document.getElementById('groupsCounter').textContent = `Выбрано: ${checkedCount}`;
}


// Добавляем слушатель на изменение чекбоксов
document.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' && e.target.closest('.group-item')) {
        updateGroupsCounter();
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