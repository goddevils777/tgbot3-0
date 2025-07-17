// Функции для работы с вариациями сообщений
let directMessageVariantCount = 1;

function addDirectMessageVariant() {
    directMessageVariantCount++;
    const container = document.querySelector('.messages-container');
    
    const messageItem = document.createElement('div');
    messageItem.className = 'message-item';
    messageItem.innerHTML = `
        <label>Вариант сообщения ${directMessageVariantCount}:</label>
        <textarea class="message-variant" placeholder="Введите вариант сообщения ${directMessageVariantCount}" rows="3"></textarea>
        <button class="remove-message" onclick="removeDirectMessage(this)">×</button>
    `;
    
    container.appendChild(messageItem);
    updateDirectRemoveButtons();
    updateParticipantsCalculation();
}

function removeDirectMessage(button) {
    const messageItem = button.closest('.message-item');
    messageItem.remove();
    updateDirectMessageLabels();
    updateDirectRemoveButtons();
    updateParticipantsCalculation();
}

function updateDirectMessageLabels() {
    const messageItems = document.querySelectorAll('.message-item');
    messageItems.forEach((item, index) => {
        const label = item.querySelector('label');
        const textarea = item.querySelector('textarea');
        label.textContent = `Вариант сообщения ${index + 1}:`;
        textarea.placeholder = `Введите вариант сообщения ${index + 1}`;
    });
    directMessageVariantCount = messageItems.length;
}

function updateDirectRemoveButtons() {
    const removeButtons = document.querySelectorAll('.remove-message');
    const hasMultiple = removeButtons.length > 1;
    
    removeButtons.forEach(button => {
        button.style.display = hasMultiple ? 'block' : 'none';
    });
}

function getAllDirectMessageVariants() {
    const textareas = document.querySelectorAll('.message-variant');
    return Array.from(textareas)
        .map(textarea => textarea.value.trim())
        .filter(text => text.length > 0);
}

// Функции для работы со списком участников
function parseParticipants() {
    const text = document.getElementById('participantsList').value.trim();
    if (!text) return [];
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const participants = [];
    
    lines.forEach((line, index) => {
        const participant = {
            id: index + 1,
            input: line,
            type: detectParticipantType(line),
            status: 'pending'
        };
        participants.push(participant);
    });
    
    return participants;
}

function detectParticipantType(input) {
    // Обработка ссылок t.me
    if (input.includes('t.me/')) {
        const username = input.split('t.me/')[1];
        return 'username';
    }
    
    if (input.startsWith('@')) return 'username';
    if (input.startsWith('+') && /^\+\d+$/.test(input)) return 'phone';
    if (/^\d+$/.test(input)) return 'id';
    return 'name';
}

function updateParticipantsCount() {
    const participants = parseParticipants();
    document.getElementById('participantsCount').textContent = `Участников: ${participants.length}`;
    return participants.length;
}

// Функции расчета интервалов
function calculateSendingSchedule() {
    const participants = parseParticipants();
    const dailyLimit = parseInt(document.getElementById('dailyLimit').value) || 10;
    const startDate = document.getElementById('directStartDate').value;
    const startTime = document.getElementById('directStartTime').value;
    
    if (!startDate || !startTime || participants.length === 0) {
        document.getElementById('calculationResult').textContent = 'Заполните все поля для расчета';
        return null;
    }
    
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const totalParticipants = participants.length;
    const totalDays = Math.ceil(totalParticipants / dailyLimit);
    
    // Рассчитываем интервалы в минутах (24 часа = 1440 минут)
    const minutesPerDay = 24 * 60;
    const intervalMinutes = Math.floor(minutesPerDay / dailyLimit);
    
    const result = {
        totalParticipants,
        dailyLimit,
        totalDays,
        intervalMinutes,
        intervalHours: Math.floor(intervalMinutes / 60),
        intervalRemainingMinutes: intervalMinutes % 60,
        endDate: new Date(startDateTime.getTime() + (totalDays - 1) * 24 * 60 * 60 * 1000)
    };
    
    return result;
}

function updateParticipantsCalculation() {
    const calculation = calculateSendingSchedule();
    const resultElement = document.getElementById('calculationResult');
    
    if (!calculation) {
        resultElement.textContent = 'Заполните все поля для расчета';
        return;
    }
    
    const { totalParticipants, dailyLimit, totalDays, intervalHours, intervalRemainingMinutes, endDate } = calculation;
    
    resultElement.innerHTML = `
        <div class="calculation-details">
            <div>📊 Всего участников: <strong>${totalParticipants}</strong></div>
            <div>📅 Дней рассылки: <strong>${totalDays}</strong></div>
            <div>⏰ Интервал между сообщениями: <strong>${intervalHours}ч ${intervalRemainingMinutes}мин</strong></div>
            <div>🏁 Завершение: <strong>${endDate.toLocaleDateString('ru-RU')} ${endDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}</strong></div>
        </div>
    `;
}

// Функция создания рассылки
async function createDirectBroadcast() {

        // Проверяем активные Telegram операции
    try {
        const statusResponse = await fetch('/api/telegram-status');
        const statusData = await statusResponse.json();
        
        if (statusData.success && statusData.hasActiveOperation) {
            notify.error(`⚠️ Операция "${statusData.operationType}" уже выполняется! Остановите её перед запуском рассылки в директ.`);
            return;
        }
    } catch (error) {
        console.log('Не удалось проверить статус операций');
    }
    const messages = getAllDirectMessageVariants();
    const participants = parseParticipants();
    const startDate = document.getElementById('directStartDate').value;
    const startTime = document.getElementById('directStartTime').value;
    const dailyLimit = parseInt(document.getElementById('dailyLimit').value);
    
    // Валидация
    if (messages.length === 0) {
        notify.warning('Введите хотя бы один вариант сообщения');
        return;
    }
    
    if (participants.length === 0) {
        notify.warning('Добавьте хотя бы одного участника');
        return;
    }
    
    if (!startDate || !startTime) {
        notify.warning('Укажите дату и время начала');
        return;
    }
    
    if (dailyLimit < 1 || dailyLimit > 15) {
        notify.warning('Лимит сообщений должен быть от 1 до 15');
        return;
    }
    
    const scheduledTime = new Date(`${startDate}T${startTime}`);
    if (scheduledTime <= new Date()) {
        notify.warning('Время начала должно быть в будущем');
        return;
    }
    
    try {
        const response = await fetch('/api/create-direct-broadcast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: messages,
                participants: participants,
                startDateTime: scheduledTime.toISOString(),
                dailyLimit: dailyLimit
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.success('Рассылка создана успешно!');
            clearDirectBroadcastForm();
            loadDirectBroadcasts();
        } else {
            notify.error(`Ошибка создания рассылки: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Функция предпросмотра
function previewCalculation() {
    const calculation = calculateSendingSchedule();
    if (!calculation) {
        notify.warning('Заполните все поля для предпросмотра');
        return;
    }
    
    updateParticipantsCalculation();
    notify.info('Расчет обновлен! Проверьте детали ниже');
}

// Очистка формы
function clearDirectBroadcastForm() {
    // Очищаем сообщения
    const messagesContainer = document.querySelector('.messages-container');
    messagesContainer.innerHTML = `
        <div class="message-item">
            <label>Вариант сообщения 1:</label>
            <textarea class="message-variant" placeholder="Введите первый вариант сообщения" rows="3"></textarea>
            <button class="remove-message" onclick="removeDirectMessage(this)" style="display: none;">×</button>
        </div>
    `;
    directMessageVariantCount = 1;
    
    // Очищаем участников
    document.getElementById('participantsList').value = '';
    updateParticipantsCount();
    
    // Сбрасываем расчет
    document.getElementById('calculationResult').textContent = 'Расчет интервалов появится после ввода участников';
}

// Функции копирования в буфер обмена
async function copyToClipboard(listType) {
    let text = '';
    let elementId = '';
    
    switch (listType) {
        case 'sent':
            elementId = 'sentList';
            break;
        case 'errors':
            elementId = 'errorsList';
            break;
        case 'remaining':
            elementId = 'remainingList';
            break;
    }
    
    const element = document.getElementById(elementId);
    if (element) {
        text = element.textContent;
    }
    
    if (text.trim()) {
        try {
            await navigator.clipboard.writeText(text);
            notify.success('Скопировано в буфер обмена');
        } catch (err) {
            notify.error('Ошибка копирования');
        }
    } else {
        notify.warning('Нет данных для копирования');
    }
}

// Установка времени по умолчанию
function setDefaultDirectDateTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    document.getElementById('directStartDate').value = `${year}-${month}-${day}`;
    document.getElementById('directStartTime').value = `${hours}:${minutes}`;
}

// Загрузка списка рассылок
async function loadDirectBroadcasts() {
    try {
        const response = await fetch('/api/direct-broadcast-tasks');
        const data = await response.json();
        
        if (data.success) {
            displayDirectBroadcasts(data.tasks);
        }
    } catch (error) {
        console.error('Ошибка загрузки рассылок:', error);
    }
}

function displayDirectBroadcasts(broadcasts) {
    const listElement = document.getElementById('directBroadcastsList');
    
    if (broadcasts.length === 0) {
        listElement.innerHTML = '<p>Нет активных рассылок</p>';
        return;
    }
    
    listElement.innerHTML = broadcasts.map(broadcast => `
        <div class="broadcast-item">
            <div class="broadcast-header">
                <div class="broadcast-info">
                    <span class="broadcast-status status-${broadcast.status}">${getDirectStatusText(broadcast.status)}</span>
                    <span>Начало: ${new Date(broadcast.startDateTime).toLocaleString('ru-RU')}</span>
                    <span>Участников: ${broadcast.participants.length}</span>
                    <span>Лимит/день: ${broadcast.dailyLimit}</span>
                </div>
                <div class="broadcast-actions">
                    <button onclick="showBroadcastDetails('${broadcast.id}')">Детали</button>
                    <button onclick="deleteDirectBroadcast('${broadcast.id}')" class="delete-btn">Удалить</button>
                </div>
            </div>
            <div class="broadcast-messages">
                ${broadcast.messages.map((msg, index) => `<div class="message-preview">Вариант ${index + 1}: ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}</div>`).join('')}
            </div>
        </div>
    `).join('');
}

function getDirectStatusText(status) {
    const statusTexts = {
        'pending': 'Ожидает',
        'active': 'Активна',
        'completed': 'Завершена',
        'paused': 'Приостановлена'
    };
    return statusTexts[status] || status;
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Обработчики событий
    document.getElementById('addDirectMessageVariant').addEventListener('click', addDirectMessageVariant);
    document.getElementById('createDirectBroadcast').addEventListener('click', createDirectBroadcast);
    document.getElementById('previewCalculation').addEventListener('click', previewCalculation);
    
    // Обработчики для автообновления
    document.getElementById('participantsList').addEventListener('input', () => {
        updateParticipantsCount();
        updateParticipantsCalculation();
    });
    
    document.getElementById('dailyLimit').addEventListener('input', updateParticipantsCalculation);
    document.getElementById('directStartDate').addEventListener('change', updateParticipantsCalculation);
    document.getElementById('directStartTime').addEventListener('change', updateParticipantsCalculation);
    
    // Установка времени по умолчанию
    setDefaultDirectDateTime();
    
    // Загрузка существующих рассылок
    loadDirectBroadcasts();
});

// Показать детали рассылки
async function showBroadcastDetails(broadcastId) {
    try {
        const response = await fetch(`/api/direct-broadcast-details/${broadcastId}`);
        const data = await response.json();
        
        if (data.success) {
            displayBroadcastDetails(data.details);
        } else {
            notify.error(`Ошибка загрузки деталей: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Отображение деталей рассылки
function displayBroadcastDetails(details) {
    const detailsElement = document.getElementById('broadcastDetails');
    const { task, lists } = details;
    
    // Обновляем статистику
    document.getElementById('sentCount').textContent = task.stats.sent;
    document.getElementById('errorCount').textContent = task.stats.errors;
    document.getElementById('remainingCount').textContent = task.stats.remaining;
    
    // Обновляем списки
    document.getElementById('sentList').textContent = lists.sent.join('\n');
    document.getElementById('errorsList').textContent = lists.errors.join('\n');
    document.getElementById('remainingList').textContent = lists.remaining.join('\n');
    
    // Показываем блок деталей
    detailsElement.style.display = 'block';
    detailsElement.scrollIntoView({ behavior: 'smooth' });
}

// Удаление рассылки
async function deleteDirectBroadcast(broadcastId) {
    if (!confirm('Вы уверены, что хотите удалить эту рассылку?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/direct-broadcast-tasks/${broadcastId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.success('Рассылка удалена');
            loadDirectBroadcasts();
            
            // Скрываем детали если они были открыты
            document.getElementById('broadcastDetails').style.display = 'none';
        } else {
            notify.error(`Ошибка удаления: ${data.error}`);
        }
    } catch (error) {
        notify.error(`Ошибка соединения: ${error.message}`);
    }
}