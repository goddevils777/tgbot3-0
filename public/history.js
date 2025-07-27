// Управление историей результатов
class HistoryManager {
    constructor() {
        this.storageKey = 'telegram_bot_history';
        this.init();
    }

    init() {
        console.log('Инициализация HistoryManager');
        this.loadHistory();
        this.setupEventListeners();
    }

    getHistory() {
        let allHistory = JSON.parse(localStorage.getItem('telegram_bot_history') || '[]');
        
        // Если это старый формат объекта - конвертируем в массив
        if (!Array.isArray(allHistory) && allHistory.search) {
            console.log('Конвертируем старый формат истории');
            const converted = [
                ...allHistory.search || [],
                ...allHistory.livestream || [],
                ...allHistory.autosearch || []
            ];
            localStorage.setItem('telegram_bot_history', JSON.stringify(converted));
            allHistory = converted;
        }
        
        // Если всё ещё не массив - создаём пустой
        if (!Array.isArray(allHistory)) {
            allHistory = [];
            localStorage.setItem('telegram_bot_history', JSON.stringify([]));
        }
        
        return allHistory;
    }

    // Сохранение истории в localStorage
    saveHistory(history) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(history));
        } catch (error) {
            console.error('Ошибка сохранения истории:', error);
        }
    }

    // Добавление записи в историю
    addToHistory(type, data) {
        const history = this.getHistory();
        const record = {
            id: Date.now().toString(),
            type: type,
            timestamp: Date.now(),
            ...data
        };
        
        history.unshift(record); // Добавляем в начало массива
        
        // Ограничиваем количество записей (максимум 50)
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        localStorage.setItem('telegram_bot_history', JSON.stringify(history));
        this.loadHistory(); // Обновляем отображение
        
        return record.id;
    }

    // Удаление записи из истории
    removeFromHistory(type, id) {
        if (confirm('Удалить эту запись из истории?')) {
            let allHistory = this.getHistory();
            const filteredHistory = allHistory.filter(item => item.id !== id);
            localStorage.setItem('telegram_bot_history', JSON.stringify(filteredHistory));
            this.loadHistory();
        }
    }

    // Настройка обработчиков событий
    setupEventListeners() {
        console.log('=== Настройка обработчиков событий ===');
        
        document.addEventListener('click', async (e) => {
            console.log('Клик зарегистрирован:', e.target);
            
            // Если клик по кнопке удаления - только удаляем
            if (e.target.classList.contains('btn-delete')) {
                console.log('Клик по кнопке удаления');
                e.stopPropagation();
                e.preventDefault();
                return; // onclick в HTML уже обрабатывает удаление
            }
            
            // Если клик по карточке истории - показываем результаты
            if (e.target.closest('.history-item')) {
                console.log('Клик по карточке истории');
                const historyItem = e.target.closest('.history-item');
                const historyId = historyItem.dataset.id;
                console.log('ID истории:', historyId);
                
                // Загружаем полную историю с сервера
                try {
                    const response = await fetch(`/api/get-search-history/${historyId}`);
                    const data = await response.json();
                    
                    if (data.success) {
                        this.displayHistoryResults(data.history);
                    } else {
                        alert('Ошибка загрузки истории: ' + data.error);
                    }
                } catch (error) {
                    console.error('Ошибка загрузки истории:', error);
                    alert('Ошибка соединения с сервером');
                }
            }
        });
    }

    // Загрузка и отображение истории
    loadHistory() {
        const history = this.getHistory();
        console.log('Загружаем историю:', history.length, 'записей');
        
        this.displaySearchHistory(history);
        this.displayLivestreamHistory(history);
        this.displayAutosearchHistory(history);
    }

    // Отображение истории поиска
    displaySearchHistory(history) {
        const container = document.getElementById('searchHistory');
        
        if (!history || !Array.isArray(history)) {
            container.innerHTML = '<p>История поиска пуста</p>';
            return;
        }
        
        const searchHistory = history.filter(item => item.type === 'search');
        
        if (searchHistory.length === 0) {
            container.innerHTML = '<p>История поиска пуста</p>';
            return;
        }

        container.innerHTML = searchHistory.map(item => `
            <div class="history-item" data-id="${item.id}" style="cursor: pointer;">
                <div class="history-header">
                    <span class="history-title">Поиск: ${item.keywords?.join(', ') || 'Без ключевых слов'}</span>
                    <span class="history-date">${new Date(item.timestamp).toLocaleString('ru-RU')}</span>
                </div>
                <div class="history-details">
                    <p><strong>Ключевые слова:</strong> ${item.keywords?.join(', ') || 'Не указаны'}</p>
                    <p><strong>Группы:</strong> ${item.groupsList && item.groupsList.length > 0 
                                ? item.groupsList.map(group => group.name).join(', ') 
                                : `Выбрано групп: ${item.groupsCount || 0}`}</p>
                    <p><strong>Найдено сообщений:</strong> ${item.messagesCount || 0}</p>
                </div>
                <div class="history-actions">
                    <button onclick="historyManager.removeFromHistory('search', '${item.id}')" class="btn-delete">🗑️ Удалить</button>
                </div>
            </div>
        `).join('');
    }

    // Отображение истории Live Stream
    displayLivestreamHistory(history) {
        const container = document.getElementById('livestreamHistory');
        
        if (!history || !Array.isArray(history)) {
            container.innerHTML = '<p>История Live Stream пуста</p>';
            return;
        }
        
        const livestreamHistory = history.filter(item => item.type === 'livestream');
        
        if (livestreamHistory.length === 0) {
            container.innerHTML = '<p>История Live Stream пуста</p>';
            return;
        }

        container.innerHTML = livestreamHistory.map(item => `
            <div class="history-item" data-id="${item.id}" style="cursor: pointer;">
                <div class="history-header">
                    <span class="history-title">Live Stream: ${item.channelName || 'Неизвестный канал'}</span>
                    <span class="history-date">${new Date(item.timestamp).toLocaleString('ru-RU')}</span>
                </div>
                <div class="history-details">
                    <p><strong>Канал:</strong> ${item.channelName || 'Неизвестно'}</p>
                    <p><strong>Участников:</strong> ${item.participantsCount || 0}</p>
                </div>
                <div class="history-actions">
                    <button onclick="historyManager.removeFromHistory('livestream', '${item.id}')" class="btn-delete">🗑️ Удалить</button>
                </div>
            </div>
        `).join('');
    }

    // Отображение истории автопоиска
    displayAutosearchHistory(history) {
        const container = document.getElementById('autosearchHistory');
        
        if (!history || !Array.isArray(history)) {
            container.innerHTML = '<p>История автопоиска пуста</p>';
            return;
        }
        
        const autosearchHistory = history.filter(item => item.type === 'autosearch');
        
        if (autosearchHistory.length === 0) {
            container.innerHTML = '<p>История автопоиска пуста</p>';
            return;
        }

        container.innerHTML = autosearchHistory.map(item => `
            <div class="history-item" data-id="${item.id}" style="cursor: pointer;">
                <div class="history-header">
                    <span class="history-title">Автопоиск: ${item.keywords?.join(', ') || 'Без ключевых слов'}</span>
                    <span class="history-date">${new Date(item.timestamp).toLocaleString('ru-RU')}</span>
                </div>
                <div class="history-details">
                    <p><strong>Группы:</strong> ${item.groupsCount || 0}</p>
                    <p><strong>Найдено:</strong> ${item.messagesCount || 0} сообщений</p>
                </div>
                <div class="history-actions">
                    <button onclick="historyManager.removeFromHistory('autosearch', '${item.id}')" class="btn-delete">🗑️ Удалить</button>
                </div>
            </div>
        `).join('');
    }

    // Отображение результатов истории
    // Отображение результатов истории
    // Отображение результатов истории
    displayHistoryResults(historyData) {
        // Сохраняем полные данные для history-detail.html
        sessionStorage.setItem('historyDetailData', JSON.stringify(historyData));
        
        // Переходим на страницу детального просмотра
        window.location.href = `history-detail.html?type=search&id=${historyData.id}`;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.historyManager = new HistoryManager();
});