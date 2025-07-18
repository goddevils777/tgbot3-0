// Переменные состояния
let currentResults = {
    videos: [],
    telegramLinks: [],
    analysis: null
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    setupEventHandlers();
    loadSettings();
});

// Настройка обработчиков событий
function setupEventHandlers() {
    // Кнопка поиска
    document.getElementById('searchYouTubeBtn').addEventListener('click', searchYouTube);
    
    // Enter в поле поиска
    document.getElementById('youtubeKeyword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchYouTube();
        }
    });
    
    // Табы
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });
    
    // Фильтры ссылок
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterLinks(e.target.dataset.filter);
        });
    });
}

// Основная функция поиска на YouTube
async function searchYouTube() {
    const keyword = document.getElementById('youtubeKeyword').value.trim();
    const maxVideos = parseInt(document.getElementById('maxVideos').value) || 20;
    
    if (!keyword) {
        notify.warning('Введите ключевое слово для поиска');
        return;
    }
    
    // Показываем прогресс
    showProgress(true);
    hideResults();
    
    try {
        const response = await fetch('/api/youtube-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                keyword: keyword,
                maxResults: maxVideos
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentResults = {
                videos: data.videos,
                telegramLinks: data.telegramLinks,
                analysis: await analyzeLinks(data.telegramLinks)
            };
            
            displayResults();
            showResults();
            
            notify.success(`Найдено ${data.videosCount} видео и ${data.linksCount} Telegram ссылок!`);
        } else {
            notify.error(`Ошибка поиска: ${data.error}`);
        }
        
    } catch (error) {
        console.error('Ошибка YouTube поиска:', error);
        notify.error(`Ошибка соединения: ${error.message}`);
    } finally {
        showProgress(false);
        saveSettings();
    }
}

// Анализ найденных ссылок
async function analyzeLinks(links) {
    try {
        const response = await fetch('/api/analyze-telegram-links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ links: links })
        });
        
        const data = await response.json();
        return data.success ? data.analysis : null;
        
    } catch (error) {
        console.error('Ошибка анализа ссылок:', error);
        return null;
    }
}

// Отображение результатов
function displayResults() {
    updateStats();
    displayTelegramLinks();
    displayVideosList();
    displayAnalysis();
}

// Обновление статистики
function updateStats() {
    document.getElementById('videosCount').textContent = `Видео: ${currentResults.videos.length}`;
    document.getElementById('linksCount').textContent = `Ссылок: ${currentResults.telegramLinks.length}`;
    
    const uniqueLinks = [...new Set(currentResults.telegramLinks.map(link => link.identifier))];
    document.getElementById('uniqueCount').textContent = `Уникальных: ${uniqueLinks.length}`;
}

// Отображение Telegram ссылок
function displayTelegramLinks(filter = 'all') {
    const linksList = document.getElementById('linksList');
    let links = currentResults.telegramLinks;
    
    // Применяем фильтр
    if (filter === 'invite') {
        links = links.filter(link => link.isInviteLink);
    } else if (filter === 'public') {
        links = links.filter(link => !link.isInviteLink);
    }
    
    if (links.length === 0) {
        linksList.innerHTML = '<p class="no-results">Нет ссылок для отображения</p>';
        return;
    }
    
    linksList.innerHTML = links.map(link => `
        <div class="link-item ${link.isInviteLink ? 'invite-link' : 'public-link'}">
            <div class="link-header">
                <a href="${link.telegramLink}" target="_blank" class="link-url">
                    ${link.isInviteLink ? '🔒' : '📢'} ${link.telegramLink}
                </a>
                <span class="link-type">${link.isInviteLink ? 'Приватная' : 'Публичная'}</span>
            </div>
            <div class="link-source">
                <span class="video-title">📹 ${link.videoTitle}</span>
                <span class="channel-title">👤 ${link.channelTitle}</span>
            </div>
            <div class="link-actions">
                <button onclick="copyToClipboard('${link.telegramLink}')" class="copy-btn">📋 Копировать</button>
                <button onclick="openVideo('${link.videoId}')" class="view-btn">🎬 Смотреть видео</button>
            </div>
        </div>
    `).join('');
}

// Отображение списка видео
function displayVideosList() {
    const videosList = document.getElementById('videosList');
    
    if (currentResults.videos.length === 0) {
        videosList.innerHTML = '<p class="no-results">Видео не найдены</p>';
        return;
    }
    
    videosList.innerHTML = currentResults.videos.map(video => {
        const videoLinks = currentResults.telegramLinks.filter(link => link.videoId === video.videoId);
        
        return `
            <div class="video-item">
                <div class="video-thumbnail">
                    <img src="${video.thumbnails.medium?.url || video.thumbnails.default.url}" 
                         alt="${video.title}" loading="lazy">
                    <div class="links-badge">${videoLinks.length} ссылок</div>
                </div>
                <div class="video-info">
                    <h3 class="video-title">${video.title}</h3>
                    <p class="channel-name">👤 ${video.channelTitle}</p>
                    <p class="publish-date">📅 ${new Date(video.publishedAt).toLocaleDateString('ru-RU')}</p>
                    <div class="video-description">
                        ${video.description.substring(0, 150)}${video.description.length > 150 ? '...' : ''}
                    </div>
                    <div class="video-actions">
                        <button onclick="openVideo('${video.videoId}')" class="watch-btn">🎬 Смотреть</button>
                        <button onclick="showVideoLinks('${video.videoId}')" class="links-btn">
                            📱 Ссылки (${videoLinks.length})
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Отображение анализа
function displayAnalysis() {
    const analysisData = document.getElementById('analysisData');
    
    if (!currentResults.analysis) {
        analysisData.innerHTML = '<p class="no-results">Анализ недоступен</p>';
        return;
    }
    
    const analysis = currentResults.analysis;
    
    analysisData.innerHTML = `
        <div class="analysis-grid">
            <div class="analysis-card">
                <h3>📊 Общая статистика</h3>
                <div class="stat-row">
                    <span>Всего ссылок:</span>
                    <strong>${analysis.totalLinks}</strong>
                </div>
                <div class="stat-row">
                    <span>Уникальных каналов:</span>
                    <strong>${analysis.uniqueChannels}</strong>
                </div>
            </div>
            
            <div class="analysis-card">
                <h3>🔒 Приватные группы</h3>
                <div class="stat-row">
                    <span>Invite-ссылки:</span>
                    <strong>${analysis.inviteLinks.length}</strong>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(analysis.inviteLinks.length / analysis.totalLinks) * 100}%"></div>
                </div>
            </div>
            
            <div class="analysis-card">
                <h3>📢 Публичные каналы</h3>
                <div class="stat-row">
                    <span>Открытые каналы:</span>
                    <strong>${analysis.publicChannels.length}</strong>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(analysis.publicChannels.length / analysis.totalLinks) * 100}%"></div>
                </div>
            </div>
        </div>
        
        <div class="export-section">
            <h3>📤 Экспорт результатов</h3>
            <div class="export-buttons">
                <button onclick="exportLinks('all')" class="export-btn">Экспорт всех ссылок</button>
                <button onclick="exportLinks('invite')" class="export-btn">Только invite-ссылки</button>
                <button onclick="exportLinks('public')" class="export-btn">Только публичные</button>
            </div>
        </div>
    `;
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

// Фильтрация ссылок
function filterLinks(filter) {
    // Обновляем активные кнопки фильтра
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    
    // Перерисовываем список с фильтром
    displayTelegramLinks(filter);
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

// Открытие видео на YouTube
function openVideo(videoId) {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
}

// Показ ссылок конкретного видео
function showVideoLinks(videoId) {
    const videoLinks = currentResults.telegramLinks.filter(link => link.videoId === videoId);
    
    if (videoLinks.length === 0) {
        notify.info('В этом видео нет Telegram ссылок');
        return;
    }
    
    // Переключаемся на таб ссылок и применяем фильтр
    switchTab('telegram-links');
    
    // Временно показываем только ссылки этого видео
    const linksList = document.getElementById('linksList');
    linksList.innerHTML = videoLinks.map(link => `
        <div class="link-item ${link.isInviteLink ? 'invite-link' : 'public-link'} highlighted">
            <div class="link-header">
                <a href="${link.telegramLink}" target="_blank" class="link-url">
                    ${link.isInviteLink ? '🔒' : '📢'} ${link.telegramLink}
                </a>
                <span class="link-type">${link.isInviteLink ? 'Приватная' : 'Публичная'}</span>
            </div>
            <div class="link-actions">
                <button onclick="copyToClipboard('${link.telegramLink}')" class="copy-btn">📋 Копировать</button>
            </div>
        </div>
    `).join('');
    
    notify.info(`Показаны ссылки из выбранного видео (${videoLinks.length})`);
}

// Экспорт ссылок
function exportLinks(type) {
    let linksToExport = currentResults.telegramLinks;
    
    if (type === 'invite') {
        linksToExport = linksToExport.filter(link => link.isInviteLink);
    } else if (type === 'public') {
        linksToExport = linksToExport.filter(link => !link.isInviteLink);
    }
    
    if (linksToExport.length === 0) {
        notify.warning('Нет ссылок для экспорта');
        return;
    }
    
    const exportData = {
        exportDate: new Date().toISOString(),
        keyword: document.getElementById('youtubeKeyword').value,
        totalVideos: currentResults.videos.length,
        linksType: type,
        links: linksToExport
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
    });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telegram-links-${type}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    notify.success(`Экспортировано ${linksToExport.length} ссылок`);
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
    localStorage.setItem('youtubeKeyword', document.getElementById('youtubeKeyword').value);
    localStorage.setItem('maxVideos', document.getElementById('maxVideos').value);
}

// Загрузка настроек
function loadSettings() {
    const savedKeyword = localStorage.getItem('youtubeKeyword');
    const savedMaxVideos = localStorage.getItem('maxVideos');
    
    if (savedKeyword) {
        document.getElementById('youtubeKeyword').value = savedKeyword;
    }
    if (savedMaxVideos) {
        document.getElementById('maxVideos').value = savedMaxVideos;
    }
}