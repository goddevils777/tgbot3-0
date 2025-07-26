// Переменные состояния
let currentResults = {
    videos: [],
    telegramLinks: [],
    analysis: null
};



// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация...');
    setupEventHandlers();
    
    // Загружаем настройки с дополнительной задержкой
    setTimeout(() => {
        loadSettings();
    }, 500);
});

// Дополнительная проверка при полной загрузке окна
window.addEventListener('load', () => {
    console.log('Окно полностью загружено');
    setTimeout(() => {
        loadSettings();
    }, 100);
});

// Настройка обработчиков событий
function setupEventHandlers() {
    // Кнопка поиска
    document.getElementById('searchYouTubeBtn').addEventListener('click', searchYouTube);
    
    // Обработка ввода ключевиков
    const keywordInput = document.getElementById('youtubeKeyword');
    
    keywordInput.addEventListener('keydown', handleKeywordInput);
    keywordInput.addEventListener('input', updateKeywordTags);
}

// Массив для хранения ключевиков
let keywords = [];

// Обработка ввода ключевиков
function handleKeywordInput(e) {
    const input = e.target;
    const value = input.value.trim();
    
    // При нажатии пробела или Enter добавляем ключевик
    if ((e.key === ' ' || e.key === 'Enter') && value.length > 0) {
        e.preventDefault();
        
        // Получаем последнее слово
        const words = value.split(' ').filter(w => w.trim().length > 0);
        const lastWord = words[words.length - 1];
        
        if (lastWord && !keywords.includes(lastWord)) {
            keywords.push(lastWord);
            input.value = '';
            updateKeywordDisplay();
        
        }
    }
    
    // При нажатии Backspace на пустом поле удаляем последний ключевик
    if (e.key === 'Backspace' && input.value === '' && keywords.length > 0) {
        keywords.pop();
        updateKeywordDisplay();
        
    }
}

// Обновление отображения ключевиков
// Обновление отображения ключевиков
function updateKeywordDisplay() {
    const tagsContainer = document.getElementById('keywordTags');
    
    if (keywords.length === 0) {
        tagsContainer.innerHTML = '';
        return;
    }
    
    tagsContainer.innerHTML = keywords.map((keyword, index) => `
        <span class="keyword-tag">
            ${keyword}
            <button type="button" onclick="removeKeyword(${index})" class="remove-keyword">×</button>
        </span>
    `).join('');
    
    
}

// Удаление ключевика
// Удаление ключевика
function removeKeyword(index) {
    keywords.splice(index, 1);
    updateKeywordDisplay();
    
}

// Обновляем функцию обновления тегов при вводе
function updateKeywordTags() {
    // Функция для будущих улучшений
}

// Основная функция поиска на YouTube
async function searchYouTube() {
    const maxVideos = parseInt(document.getElementById('maxVideos').value) || 20;
    
    // Используем массив keywords вместо поля ввода
    if (keywords.length === 0) {
        notify.warning('Добавьте ключевые слова для поиска');
        return;
    }
    
    
    // Очищаем предыдущие результаты
    currentResults = {
        videos: [],
        telegramLinks: [],
        analysis: null
    };
    
    // Показываем прогресс
    showProgress(true);
    hideResults();
    try {
        notify.info(`Поиск по ${keywords.length} ключевикам: ${keywords.join(', ')}`);
        
        const allResults = [];
        
        // Делаем поиск по каждому ключевику
        for (let i = 0; i < keywords.length; i++) {
            const keyword = keywords[i];
            
            document.getElementById('progressText').textContent = 
                `Поиск по ключевику "${keyword}" (${i + 1}/${keywords.length})...`;
            
            const dateFrom = document.getElementById('dateFrom').value;
            const dateTo = document.getElementById('dateTo').value;
            
            const requestBody = {
                keyword: `"${keyword}"`,
                maxResults: maxVideos,
                timestamp: new Date().getTime()
            };
            
            // Добавляем фильтры дат если указаны
            if (dateFrom) {
                requestBody.publishedAfter = new Date(dateFrom).toISOString();
            }
            if (dateTo) {
                requestBody.publishedBefore = new Date(dateTo + 'T23:59:59').toISOString();
            }
            
            const response = await fetch('/api/youtube-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                allResults.push({
                    keyword: keyword,
                    videos: data.videos || [],
                    telegramLinks: data.telegramLinks || []
                });
                
                notify.info(`"${keyword}": найдено ${data.videosCount} видео, ${data.linksCount} ссылок`);
            } else {
                notify.warning(`Ошибка поиска по "${keyword}": ${data.error}`);
            }
            
            // Небольшая пауза между запросами
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Объединяем все результаты
        let allVideos = [];
        let allTelegramLinks = [];
        
        allResults.forEach(result => {
            allVideos = allVideos.concat(result.videos);
            allTelegramLinks = allTelegramLinks.concat(result.telegramLinks);
        });
        
        // Удаляем дубликаты ссылок
        const uniqueLinks = [];
        const seenLinks = new Set();
        
        allTelegramLinks.forEach(link => {
            if (!seenLinks.has(link.telegramLink)) {
                seenLinks.add(link.telegramLink);
                uniqueLinks.push(link);
            }
        });
        
        currentResults = {
            videos: allVideos,
            telegramLinks: uniqueLinks,
            analysis: null
        };
         console.log('Результаты установлены в currentResults:', uniqueLinks.length, 'ссылок');
        
        displayResults();
        showResults();
        
        notify.success(`Итого: ${allVideos.length} видео, ${uniqueLinks.length} уникальных Telegram ссылок!`);
        

        console.log('Поиск завершен, сохраняем результаты:', uniqueLinks.length, 'ссылок');

          saveSettings();
        
    } catch (error) {
        console.error('Ошибка YouTube поиска:', error);
        notify.error(`Ошибка соединения: ${error.message}`);
    } finally {
        showProgress(false);
      
    }
}

// Отображение результатов
function displayResults() {
    updateStats();

    displayTelegramLinks();
}




// Функция для отображения ключевиков в результатах
function displaySearchKeywords() {
    // Добавляем блок с ключевиками в начало результатов
    const resultsHeader = document.querySelector('.results-header');
    
    // Удаляем предыдущий блок ключевиков если есть
    const existingKeywords = document.querySelector('.search-keywords');
    if (existingKeywords) {
        existingKeywords.remove();
    }
    
    if (keywords.length === 0) return;
    
    const keywordsHtml = keywords.map(keyword => 
        `<span class="search-keyword">${keyword}</span>`
    ).join('');
    
    // Добавляем новый блок после заголовка
    const keywordsBlock = document.createElement('div');
    keywordsBlock.className = 'search-keywords';
    keywordsBlock.innerHTML = `
        <div class="keywords-label">Поиск по ключевикам:</div>
        <div class="keywords-list">${keywordsHtml}</div>
    `;
    
    resultsHeader.appendChild(keywordsBlock);
}

// Обновление статистики
function updateStats() {
    document.getElementById('videosCount').textContent = `Видео: ${currentResults.videos.length}`;
    document.getElementById('linksCount').textContent = `Ссылок: ${currentResults.telegramLinks.length}`;
    
    const uniqueLinks = [...new Set(currentResults.telegramLinks.map(link => link.identifier))];
    document.getElementById('uniqueCount').textContent = `Уникальных: ${uniqueLinks.length}`;
}

// Отображение Telegram ссылок
function displayTelegramLinks() {
    const linksList = document.getElementById('linksList');
    const links = currentResults.telegramLinks;
    
    if (links.length === 0) {
        linksList.innerHTML = '<p class="no-results">Нет ссылок для отображения</p>';
        return;
    }
    
    linksList.innerHTML = links.map(link => `
        <div class="link-item ${link.isInviteLink ? 'invite-link' : 'public-link'}">
            <div class="link-content">
                <div class="link-info">
                    <a href="${link.telegramLink}" target="_blank" class="link-url">
                        ${link.isInviteLink ? '🔒' : '📢'} ${link.telegramLink}
                    </a>
                    <span class="link-type">${link.isInviteLink ? 'Приватная группа' : 'Публичный канал'}</span>
                </div>
                <div class="link-actions">
                    <button onclick="openVideo('${link.videoId}')" class="watch-btn">🎬 Видео</button>
                    ${generateCheckButton(link.telegramLink)}
                </div>
            </div>
            <div class="video-source">
                <span>📺 Канал: ${link.channelTitle}</span>
            </div>
        </div>
    `).join('');

    // Добавляем кнопки и предупреждение
        // В конце функции displayTelegramLinks, после export-section добавь:
        linksList.innerHTML += `
            <div class="export-section">
                <div class="warning-note">
                    ⚠️ <strong>Важно:</strong> Invite-ссылки могут истекать в любой момент. 
                    Проверка показывает только доступность на момент запроса.
                </div>
                <div class="status-management">
                    <button onclick="viewSavedStatuses()" class="small-btn">📊 Статистика проверок</button>
                    <button onclick="clearAllStatuses()" class="small-btn">🗑️ Очистить статусы</button>
                </div>
            </div>
        `;

}

// Генерация кнопки проверки с учетом сохраненного статуса
function generateCheckButton(telegramLink) {
    const savedStatus = getGroupStatus(telegramLink);
    
    if (savedStatus) {
        if (savedStatus.status === 'valid') {
            return `<button onclick="resetLinkStatus('${telegramLink}')" class="check-btn status-available" style="background: #28a745;">✅ Доступна</button>`;
        } else {
            return `<button onclick="resetLinkStatus('${telegramLink}')" class="check-btn status-unavailable" style="background: #dc3545;">❌ Недоступна</button>`;
        }
    } else {
        return `<button onclick="checkLinkValidity('${telegramLink}')" class="check-btn">✅ Проверить</button>`;
    }
}

// Также добавь функцию очистки статусов (для админки)
function clearAllStatuses() {
    localStorage.removeItem('groupStatuses');
    notify.success('Все статусы очищены');
    
    // Перерисовываем ссылки
    if (currentResults && currentResults.telegramLinks) {
        displayTelegramLinks();
    }
}

// Функция для просмотра всех сохраненных статусов
function viewSavedStatuses() {
    const savedStatuses = JSON.parse(localStorage.getItem('groupStatuses') || '{}');
    const statusCount = Object.keys(savedStatuses).length;
    
    if (statusCount === 0) {
        notify.info('Нет сохраненных статусов');
        return;
    }
    
    const validCount = Object.values(savedStatuses).filter(s => s.status === 'valid').length;
    const invalidCount = statusCount - validCount;
    
    notify.info(`Сохранено статусов: ${statusCount} (✅ ${validCount} доступных, ❌ ${invalidCount} недоступных)`);
}

// Сброс статуса ссылки (возврат к "Проверить")
function resetLinkStatus(telegramLink) {
    // Удаляем сохраненный статус
    const savedStatuses = JSON.parse(localStorage.getItem('groupStatuses') || '{}');
    delete savedStatuses[telegramLink];
    localStorage.setItem('groupStatuses', JSON.stringify(savedStatuses));
    
    // Находим кнопку и обновляем её
    const button = document.querySelector(`button[onclick*="${telegramLink}"]`);
    if (button) {
        button.textContent = '✅ Проверить';
        button.style.background = '';
        button.disabled = false;
        button.className = 'check-btn';
        button.onclick = () => checkLinkValidity(telegramLink);
    }
    
    notify.info('Статус сброшен, можно проверить заново');
}

// Переключение табов
function switchTab(tabName) {
    // Обновляем активные кнопки
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Переключаем контент
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
}

// Открытие видео на YouTube
function openVideo(videoId) {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
}



// Показ/скрытие прогресса
function showProgress(show) {
    const progressSection = document.getElementById('searchProgress');
    const searchBtn = document.getElementById('searchYouTubeBtn');
    
    if (show) {
        progressSection.style.display = 'block';
        searchBtn.disabled = true;
        searchBtn.textContent = '⏳ Поиск...';
    } else {
        progressSection.style.display = 'none';
        searchBtn.disabled = false;
        searchBtn.textContent = '🔍 Искать на YouTube';
    }
}

// Показ/скрытие результатов
function showResults() {
    document.querySelector('.results-section').style.display = 'block';
}

function hideResults() {
    document.querySelector('.results-section').style.display = 'none';
}

// Сохранение настроек
function saveSettings() {
    console.log('=== СОХРАНЕНИЕ НАСТРОЕК ===');
    console.log('Сохраняем keywords:', keywords);
    console.log('Сохраняем results с ссылками:', currentResults.telegramLinks?.length || 0);
    
    localStorage.setItem('youtubeKeywords', JSON.stringify(keywords));
    localStorage.setItem('maxVideos', document.getElementById('maxVideos').value);
    localStorage.setItem('currentResults', JSON.stringify(currentResults));
    
    console.log('Данные сохранены в localStorage');
    
    // Проверяем что сохранилось
    console.log('Проверка сохранения:');
    console.log('- keywords:', localStorage.getItem('youtubeKeywords'));
    console.log('- results length:', localStorage.getItem('currentResults')?.length || 0);
}

// Загрузка настроек
// Загрузка настроек
function loadSettings() {
    // Загружаем ключевики
    const savedKeywords = localStorage.getItem('youtubeKeywords');
    if (savedKeywords) {
        try {
            keywords = JSON.parse(savedKeywords);
            updateKeywordDisplay();
        } catch (e) {
            keywords = [];
        }
    }
    
    // Загружаем количество видео
    const savedMaxVideos = localStorage.getItem('maxVideos');
    if (savedMaxVideos) {
        document.getElementById('maxVideos').value = savedMaxVideos;
    }
    
    // Загружаем результаты поиска с задержкой
    setTimeout(() => {
        const savedResults = localStorage.getItem('currentResults');
        if (savedResults) {
            try {
                const parsedResults = JSON.parse(savedResults);
                if (parsedResults.telegramLinks && parsedResults.telegramLinks.length > 0) {
                    currentResults = parsedResults;
                    
                    // Проверяем что элементы существуют
                    if (document.querySelector('.results-section')) {
                        displayResults();
                        showResults();
                        console.log('Результаты восстановлены:', currentResults.telegramLinks.length, 'ссылок');
                    }
                }
            } catch (e) {
                console.log('Ошибка восстановления результатов:', e);
            }
        }
    }, 100); // Небольшая задержка для полной загрузки DOM
}


// Отладочная функция для проверки localStorage
function debugStorage() {
    console.log('=== DEBUG STORAGE ===');
    console.log('Keywords:', localStorage.getItem('youtubeKeywords'));
    console.log('Results:', localStorage.getItem('currentResults'));
    console.log('MaxVideos:', localStorage.getItem('maxVideos'));
    console.log('Current keywords array:', keywords);
    console.log('Current results:', currentResults);
}

// Копирование в буфер обмена
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        notify.success('Ссылка скопирована!');
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        notify.error('Ошибка копирования');
    });
}

// Проверка валидности Telegram ссылки с сохранением статуса
async function checkLinkValidity(telegramLink, event = null) {
    const button = event ? event.target : document.querySelector(`button[onclick*="${telegramLink}"]`);
    
    if (!button) {
        console.error('Кнопка не найдена для ссылки:', telegramLink);
        return;
    }
    
    const originalText = button.textContent;
    
    // Проверяем сохраненный статус
    const savedStatus = getGroupStatus(telegramLink);
    if (savedStatus) {
        if (savedStatus.status === 'valid') {
            button.textContent = '✅ Доступна';
            button.style.background = '#28a745';
            button.onclick = () => resetLinkStatus(telegramLink); // Делаем кликабельной
            notify.success('Статус загружен из сохраненных данных (нажмите для сброса)');
        } else {
            button.textContent = '❌ Недоступна';
            button.style.background = '#dc3545';
            button.onclick = () => resetLinkStatus(telegramLink); // Делаем кликабельной
            notify.warning('Статус загружен: недоступна (нажмите для сброса)');
        }
        return;
    }
    
    button.textContent = 'Проверяю...';
    button.disabled = true;
    
    try {
        const response = await fetch('/api/check-telegram-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ link: telegramLink })
        });
        
        const data = await response.json();
        
        if (data.valid) {
            // Сохраняем положительный статус
            saveGroupStatus(telegramLink, 'valid');
            
            button.textContent = '✅ Доступна';
            button.style.background = '#28a745';
            button.disabled = false;
            button.onclick = () => resetLinkStatus(telegramLink); // Делаем кликабельной для сброса
            
            if (telegramLink.includes('joinchat/') || telegramLink.includes('+')) {
                notify.info('Invite-ссылка работает! Нажмите кнопку для повторной проверки');
            } else {
                notify.success('Публичный канал доступен! Нажмите для сброса статуса');
            }
        } else {
            // Сохраняем отрицательный статус
            saveGroupStatus(telegramLink, 'invalid');
            
            button.textContent = '❌ Недоступна';
            button.style.background = '#dc3545';
            button.disabled = false;
            button.onclick = () => resetLinkStatus(telegramLink); // Делаем кликабельной для сброса
            notify.warning('Ссылка недоступна. Нажмите для повторной проверки');
        }
        
    } catch (error) {
        console.error('Ошибка проверки ссылки:', error);
        notify.error('Ошибка проверки');
        
        button.textContent = '❌ Ошибка';
        button.disabled = false;
    }
}

// Добавляем функции для работы с localStorage
function saveGroupStatus(groupId, status) {
    const savedStatuses = JSON.parse(localStorage.getItem('groupStatuses') || '{}');
    savedStatuses[groupId] = {
        status: status,
        checkedAt: new Date().toISOString()
    };
    localStorage.setItem('groupStatuses', JSON.stringify(savedStatuses));
}

function getGroupStatus(groupId) {
    const savedStatuses = JSON.parse(localStorage.getItem('groupStatuses') || '{}');
    return savedStatuses[groupId] || null;
}

