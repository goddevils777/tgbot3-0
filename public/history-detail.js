// Управление детальным просмотром записей истории
class HistoryDetailManager {
    constructor() {
        this.storageKey = 'telegram_bot_history';
        this.init();
    }

    async init() {
        await this.loadRecordDetails();
    }

    // Получение параметров из URL
    getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            type: params.get('type'),
            id: params.get('id')
        };
    }

    // Загрузка деталей записи
   // Загрузка деталей записи
async loadRecordDetails() {
    const { type, id } = this.getUrlParams();
    
    if (!type || !id) {
        this.showError('Некорректные параметры');
        return;
    }

    // Сначала пытаемся загрузить из sessionStorage (при переходе с истории)
    const sessionData = sessionStorage.getItem('historyDetailData');
    if (sessionData) {
        const record = JSON.parse(sessionData);
        sessionStorage.removeItem('historyDetailData');
        this.displayRecordDetails(record, type);
        return;
    }

    // Если нет данных в sessionStorage - загружаем с сервера (при прямом заходе или обновлении)
    if (type === 'search') {
        try {
            const response = await fetch(`/api/get-search-history/${id}`);
            const data = await response.json();
            
            if (data.success) {
                this.displayRecordDetails(data.history, type);
                return;
            } else {
                this.showError(`Ошибка загрузки с сервера: ${data.error}`);
                return;
            }
        } catch (error) {
            console.error('Ошибка загрузки с сервера:', error);
            this.showError('Ошибка соединения с сервером');
            return;
        }
    }

    // Fallback к localStorage для старых записей других типов
    const history = this.getHistory();
    const record = history[type]?.find(item => item.id === id);

    if (!record) {
        this.showError('Запись не найдена');
        return;
    }

    this.displayRecordDetails(record, type);
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

    // Отображение деталей записи
    displayRecordDetails(record, type) {
        const detailTitle = document.getElementById('detailTitle');
        const recordInfo = document.getElementById('recordInfo');
        const contentTitle = document.getElementById('contentTitle');
        const detailData = document.getElementById('detailData');

        // Устанавливаем заголовок
        const typeNames = {
            'search': 'Поиск сообщений',
            'livestream': 'Live Stream',
            'autosearch': 'Автопоиск'
        };
        
        detailTitle.textContent = `📊 ${typeNames[type]} - Детали`;

        // Отображаем информацию о записи
        recordInfo.innerHTML = this.generateRecordInfo(record, type);

        // Отображаем детальные данные
        if (type === 'search') {
            this.displaySearchDetails(record, contentTitle, detailData);
        } else if (type === 'livestream') {
            this.displayLivestreamDetails(record, contentTitle, detailData);
        } else if (type === 'autosearch') {
            this.displayAutosearchDetails(record, contentTitle, detailData);
        }
    }

    // Генерация общей информации о записи
    generateRecordInfo(record, type) {
        const date = new Date(record.timestamp).toLocaleString('ru-RU');
        
        let specificInfo = '';
        if (type === 'search') {
            specificInfo = `
                <p><strong>Ключевые слова:</strong> ${record.keywords?.join(', ') || 'Не указаны'}</p>
                <p><strong>Групп выбрано:</strong> ${record.groupsCount || 0}</p>
                <p><strong>Найдено сообщений:</strong> ${record.messagesCount || 0}</p>
            `;
        } else if (type === 'livestream') {
            specificInfo = `
                <p><strong>Канал:</strong> ${record.channelName || 'Неизвестно'}</p>
                <p><strong>ID канала:</strong> ${record.channelId || 'Неизвестно'}</p>
                <p><strong>Найдено участников:</strong> ${record.participantsCount || 0}</p>
            `;
        } else if (type === 'autosearch') {
            specificInfo = `
                <p><strong>Ключевые слова:</strong> ${record.keywords?.join(', ') || 'Не указаны'}</p>
                <p><strong>Групп отслеживалось:</strong> ${record.groupsCount || 0}</p>
                <p><strong>Найдено сообщений:</strong> ${record.messagesCount || 0}</p>
            `;
        }

        return `
            <div class="record-header">
                <h3>Информация о записи</h3>
                <span class="record-date">Сохранено: ${date}</span>
            </div>
            <div class="record-details">
                ${specificInfo}
            </div>
        `;
    }

    // Отображение деталей поиска сообщений
// Отображение деталей поиска сообщений
displaySearchDetails(record, contentTitle, detailData) {
    contentTitle.textContent = `Найденные сообщения (${record.messagesCount || 0})`;
    
    if (!record.messages || record.messages.length === 0) {
        detailData.innerHTML = '<p class="no-data">Сообщения не сохранены</p>';
        return;
    }

    // Сохраняем сообщения глобально для копирования никнеймов
    window.currentMessages = record.messages;

    // Кнопка копирования ВВЕРХУ
    const copyButtonHtml = `
        <div class="detail-actions-top">
            <button onclick="copyNicknamesFromDetail()" class="btn-copy-nicknames">
                📋 Скопировать никнеймы (${this.getUniqueNicknames(record.messages).length})
            </button>
        </div>
    `;

    const messagesHtml = record.messages.map((message, index) => {
        let highlightedText = message.text || 'Текст недоступен';
        
        // Подсвечиваем ключевые слова
        if (record.keywords && record.keywords.length > 0) {
            record.keywords.forEach(keyword => {
                const keywordLower = keyword.toLowerCase().trim();
                
                // Для фраз из нескольких слов ищем точное совпадение
                if (keywordLower.includes(' ')) {
                    const regex = new RegExp(`(${keywordLower})`, 'gi');
                    highlightedText = highlightedText.replace(regex, '<mark class="keyword-highlight">$1</mark>');
                } else {
                    // Для одного слова ищем как отдельное слово
                    const regex = new RegExp(`(^|[\\s\\n\\r\\t.,!?;:'"(){}\\[\\]<>«»""\\/\\-])(${keywordLower})($|[\\s\\n\\r\\t.,!?;:'"(){}\\[\\]<>«»""\\/\\-])`, 'gi');
                    highlightedText = highlightedText.replace(regex, '$1<mark class="keyword-highlight">$2</mark>$3');
                }
            });
        }
        
        return `
            <div class="message-detail-item">
                <div class="message-detail-header">
                    <span class="message-number">#${index + 1}</span>
                    <span class="message-group">${message.groupName || 'Неизвестная группа'}</span>
                    <span class="message-sender">${message.sender || 'Неизвестный отправитель'}</span>
                    <span class="message-date">${message.date || 'Неизвестная дата'}</span>
                </div>
                <div class="message-detail-text">${highlightedText}</div>
                ${message.link ? `<div class="telegram-link-container"><a href="${message.link}" target="_blank" class="btn-telegram-link">Открыть в Telegram</a></div>` : ''}
            </div>
        `;
    }).join('');

    detailData.innerHTML = copyButtonHtml + messagesHtml;
}

    // Отображение деталей Live Stream
    displayLivestreamDetails(record, contentTitle, detailData) {
        contentTitle.textContent = `Участники стрима (${record.participantsCount || 0})`;
        
        if (!record.participants || record.participants.length === 0) {
            detailData.innerHTML = '<p class="no-data">Участники не сохранены</p>';
            return;
        }

        const participantsHtml = record.participants.map((participant, index) => `
            <div class="participant-detail-item">
                <div class="participant-detail-header">
                    <span class="participant-number">#${index + 1}</span>
                    <span class="participant-name">${participant.name || 'Без имени'}</span>
                    <span class="participant-contact">
                        ${participant.username ? `@${participant.username}` : 
                          participant.phone ? participant.phone : 'Контакт скрыт'}
                    </span>
                </div>
                <div class="participant-detail-meta">
                    <span class="first-seen">Замечен: ${participant.firstSeen || 'Неизвестно'}</span>
                    ${participant.id ? `<span class="participant-id">ID: ${participant.id}</span>` : ''}
                </div>
            </div>
        `).join('');

        detailData.innerHTML = participantsHtml;
    }

    // Отображение деталей автопоиска
    displayAutosearchDetails(record, contentTitle, detailData) {
        contentTitle.textContent = `Результаты автопоиска (${record.messagesCount || 0})`;
        
        if (!record.results || record.results.length === 0) {
            detailData.innerHTML = '<p class="no-data">Результаты не сохранены</p>';
            return;
        }

        const resultsHtml = record.results.map((result, index) => `
            <div class="autosearch-detail-item">
                <div class="autosearch-detail-header">
                    <span class="result-number">#${index + 1}</span>
                    <span class="result-group">${result.groupName || 'Неизвестная группа'}</span>
                    <span class="result-sender">${result.sender || 'Неизвестный отправитель'}</span>
                </div>
                <div class="autosearch-detail-text">${result.text || 'Текст недоступен'}</div>
            </div>
        `).join('');

        detailData.innerHTML = resultsHtml;
    }

    showError(message) {
        document.getElementById('recordInfo').innerHTML = `
            <div class="error-message">
                <h3>Ошибка</h3>
                <p>${message}</p>
                <a href="history.html">← Вернуться к истории</a>
            </div>
        `;
    }

    // Получение уникальных никнеймов из сообщений
    getUniqueNicknames(messages) {
        const nicknames = messages
            .map(message => message.sender)
            .filter(sender => sender && sender !== 'Неизвестный отправитель')
            .filter((value, index, self) => self.indexOf(value) === index); // Убираем дубликаты
        
        return nicknames;
    }
}

// Глобальная функция копирования никнеймов из детального просмотра
function copyNicknamesFromDetail() {
    if (!window.currentMessages) {
        notify.error('Сообщения не загружены');
        return;
    }
    
    const nicknames = window.currentMessages
        .map(message => message.sender)
        .filter(sender => sender && sender !== 'Неизвестный отправитель')
        .filter((value, index, self) => self.indexOf(value) === index) // Убираем дубликаты
        .join('\n');
    
    if (!nicknames) {
        notify.warning('Никнеймы не найдены');
        return;
    }
    
    // Копируем в буфер обмена
    navigator.clipboard.writeText(nicknames).then(() => {
        const count = nicknames.split('\n').length;
        notify.success(`Скопировано ${count} уникальных никнеймов`);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        notify.error('Ошибка копирования в буфер обмена');
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new HistoryDetailManager();
});