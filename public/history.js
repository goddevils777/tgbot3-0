// Управление историей результатов
class HistoryManager {
    constructor() {
        this.storageKey = 'telegram_bot_history';
        this.init();
    }

    init() {
        this.loadHistory();
        this.setupEventListeners();
    }

    // Получение истории из localStorage
    getHistory() {
        try {
            const history = localStorage.getItem(this.storageKey);
            return history ? JSON.parse(history) : {
                search: [],
                livestream: [],
                autosearch: []
            };
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            return { search: [], livestream: [], autosearch: [] };
        }
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
            timestamp: new Date().toISOString(),
            ...data
        };
        
        history[type].unshift(record); // Добавляем в начало
        
        // Ограничиваем количество записей (максимум 50 на тип)
        if (history[type].length > 50) {
            history[type] = history[type].slice(0, 50);
        }
        
        this.saveHistory(history);
        this.loadHistory(); // Обновляем отображение
        
        return record.id;
    }


    // Удаление записи из истории
    removeFromHistory(type, id) {
        showConfirm('Удалить эту запись из истории?', () => {
        
            const history = this.getHistory();
            history[type] = history[type].filter(item => item.id !== id);
            this.saveHistory(history);
            this.loadHistory(); // Обновляем отображение
        });
    }

    // Добавить новый метод для обработки событий
    setupEventListeners() {
        // Только обработчик удаления, никаких переходов
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-delete')) {
                e.stopPropagation();
                e.preventDefault();
                
                const type = e.target.dataset.type;
                const id = e.target.dataset.id;
                
                if (confirm('Удалить эту запись из истории?')) {
                    const history = this.getHistory();
                    history[type] = history[type].filter(item => item.id !== id);
                    this.saveHistory(history);
                    this.loadHistory();
                }
                return false;
            }
        });
    }

    // Загрузка и отображение истории
    loadHistory() {
        const history = this.getHistory();
        
        this.displaySearchHistory(history.search);
        this.displayLivestreamHistory(history.livestream);
        this.displayAutosearchHistory(history.autosearch);
    }


    // Отображение истории поиска
    displaySearchHistory(items) {
        const container = document.getElementById('searchHistory');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="empty-history">История поиска пуста</p>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="history-item" data-id="${item.id}" style="cursor: pointer;">
                <div class="history-header">
                    <span class="history-title">Поиск: ${item.keywords?.join(', ') || 'Без ключевых слов'}</span>
                    <span class="history-date">${new Date(item.timestamp).toLocaleString('ru-RU')}</span>
                </div>
                <div class="history-details">
                    <p><strong>Ключевые слова:</strong> ${item.keywords?.join(', ') || 'Не указаны'}</p>
                    <p><strong>Групп выбрано:</strong> ${item.groupsCount || 0}</p>
                    <p><strong>Найдено сообщений:</strong> ${item.messagesCount || 0}</p>
                </div>
                <div class="history-actions">
                    <button onclick="historyManager.removeFromHistory('search', '${item.id}')" class="btn-delete">🗑️ Удалить</button>
                </div>
            </div>
        `).join('');
    }

    // Отображение истории Live Stream
    displayLivestreamHistory(items) {
        const container = document.getElementById('livestreamHistory');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="empty-history">История Live Stream пуста</p>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="history-item" data-id="${item.id}" onclick="viewDetails('livestream', '${item.id}')" style="cursor: pointer;">
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
    displayAutosearchHistory(items) {
        const container = document.getElementById('autosearchHistory');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<p class="empty-history">История автопоиска пуста</p>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="history-item" data-id="${item.id}" onclick="viewDetails('autosearch', '${item.id}')" style="cursor: pointer;">
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

setupEventListeners() {
        document.addEventListener('click', (e) => {
            // Если клик по кнопке удаления - только удаляем
            if (e.target.classList.contains('btn-delete')) {
                e.stopPropagation();
                e.preventDefault();
                
                const type = e.target.dataset.type;
                const id = e.target.dataset.id;
                
                if (confirm('Удалить эту запись из истории?')) {
                    const history = this.getHistory();
                    history[type] = history[type].filter(item => item.id !== id);
                    this.saveHistory(history);
                    this.loadHistory();
                }
                return false;
            }
            
            // Если клик НЕ по кнопке удаления и НЕ по actions контейнеру
            if (!e.target.closest('.history-actions')) {
                const historyItem = e.target.closest('.history-item');
                if (historyItem) {
                    const id = historyItem.dataset.id;
                    const container = historyItem.closest('[id$="History"]');
                    if (container) {
                        const type = container.id.replace('History', '').toLowerCase();
                        window.location.href = `history-detail.html?type=${type}&id=${id}`;
                    }
                }
            }
        });
    }

    // Обновить метод removeFromHistory (убрать confirm так как он уже в setupEventListeners)
    removeFromHistory(type, id) {
        const history = this.getHistory();
        history[type] = history[type].filter(item => item.id !== id);
        this.saveHistory(history);
        this.loadHistory(); // Обновляем отображение
    }
}



// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.historyManager = new HistoryManager();
});