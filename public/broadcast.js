// Переменные состояния
let broadcastTasks = [];

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadSessionInfo();
    // Инициализация DOM элементов
    const broadcastMessage = document.getElementById('broadcastMessage');
    const broadcastGroupsList = document.getElementById('broadcastGroupsList');
    const broadcastGroupsCounter = document.getElementById('broadcastGroupsCounter');
    const startDate = document.getElementById('startDate');
    const startTime = document.getElementById('startTime');
    const frequency = document.getElementById('frequency');
    const createBtn = document.getElementById('createBroadcast');
    const tasksList = document.getElementById('tasksList');
    
    // Устанавливаем минимальную дату - сегодня
    const today = new Date().toISOString().split('T')[0];
    startDate.value = today;
    startDate.min = today;
    
    // Устанавливаем текущее время + 5 минут
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    startTime.value = now.toTimeString().slice(0, 5);
    
    // Загружаем группы
    await loadBroadcastGroups();

    // Загружаем сохраненные настройки
    loadBroadcastSettings();
    

    // Загружаем сохраненные задания
    loadBroadcastTasks();

    // Настраиваем автосохранение
    setupAutoSave();

    // Настраиваем логику рандомной рассылки
    const randomCheckbox = document.getElementById('randomBroadcast');
    const frequencySelect = document.getElementById('frequency');
    const scheduleInputs = document.querySelector('.schedule-inputs');

    randomCheckbox.addEventListener('change', function() {
        if (this.checked) {
            // Отключаем только периодичность
            frequencySelect.value = 'once';
            frequencySelect.disabled = true;
            frequencySelect.style.background = '#f5f5f5';
            frequencySelect.style.color = '#999';
        } else {
            // Включаем периодичность
            frequencySelect.disabled = false;
            frequencySelect.style.background = '';
            frequencySelect.style.color = '';
        }
    });

    // Проверяем количество выбранных групп
    document.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.closest('#broadcastGroupsList')) {
            const selectedCount = document.querySelectorAll('#broadcastGroupsList input[type="checkbox"]:checked').length;
            
            // Показываем рандомную опцию только при выборе 2+ групп
            const randomOption = document.querySelector('.random-option');
            if (selectedCount >= 2) {
                randomOption.style.display = 'block';
            } else {
                randomOption.style.display = 'none';
                randomCheckbox.checked = false;
                frequencySelect.disabled = false;
                scheduleInputs.classList.remove('disabled');
            }
            
            updateBroadcastGroupsCounter();
            saveBroadcastSettings();
        }
    });

    // Обработчики событий
    createBtn.addEventListener('click', createBroadcastTask);

    document.getElementById('selectAllBroadcast').addEventListener('click', selectAllBroadcastGroups);
    document.getElementById('clearBroadcastSelection').addEventListener('click', clearBroadcastSelection);

    // Обработчик для добавления вариантов сообщений
    document.getElementById('addMessageVariant').addEventListener('click', addMessageVariant);
    
});

// Загрузка групп для рассылки
async function loadBroadcastGroups() {
    try {
        const response = await fetch('/api/groups');
        const data = await response.json();
        
        if (data.success) {
            const broadcastGroupsList = document.getElementById('broadcastGroupsList');
            broadcastGroupsList.innerHTML = data.groups.map(group => `
                <div class="group-item">
                    <input type="checkbox" id="broadcast-group-${group.id}" value="${group.id}">
                    <label for="broadcast-group-${group.id}">
                        <span class="group-name">${group.name}</span>
                        <span class="group-username">${group.type} • ${group.participantsCount || 0} участников</span>
                    </label>
                </div>
            `).join('');
            
            // Скрываем рандомную опцию по умолчанию
            const randomOption = document.querySelector('.random-option');
            if (randomOption) {
                randomOption.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
    }
}

// Обновление счетчика выбранных групп
function updateBroadcastGroupsCounter() {
    const checkedCount = document.querySelectorAll('#broadcastGroupsList input[type="checkbox"]:checked').length;
    document.getElementById('broadcastGroupsCounter').textContent = `Выбрано: ${checkedCount}`;
}

// Выбрать все группы
function selectAllBroadcastGroups() {
    const checkboxes = document.querySelectorAll('#broadcastGroupsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateBroadcastGroupsCounter();
}

// Снять выбор всех групп
function clearBroadcastSelection() {
    const checkboxes = document.querySelectorAll('#broadcastGroupsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateBroadcastGroupsCounter();
}

// Создание задания рассылки
async function createBroadcastTask() {
    const messages = getAllMessageVariants();
    const selectedGroups = Array.from(document.querySelectorAll('#broadcastGroupsList input[type="checkbox"]:checked'));
    const startDate = document.getElementById('startDate').value;
    const startTime = document.getElementById('startTime').value;
    const frequency = document.getElementById('frequency').value;
    const isRandomBroadcast = document.getElementById('randomBroadcast').checked;
    
    // Валидация
    if (messages.length === 0) {
        notify.warning('Введите хотя бы один вариант сообщения');
        return;
    }
    
    if (selectedGroups.length === 0) {
       notify.warning('Выберите хотя бы одну группу');
        return;
    }
    
    if (!startDate || !startTime) {
        notify.warning('Укажите дату и время начала');
        return;
    }
    
    // Проверяем, что время не в прошлом
    const scheduledTime = new Date(`${startDate}T${startTime}`);
    if (scheduledTime <= new Date()) {
        notify.warning('Время начала должно быть в будущем');
        return;
    }
    
    // Собираем данные групп
    const groups = selectedGroups.map(checkbox => {
        const label = checkbox.nextElementSibling;
        return {
            id: checkbox.value,
            name: label.querySelector('.group-name').textContent
        };
    });
    
    try {
        const response = await fetch('/api/create-broadcast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: messages,
                groups: groups,
                startDateTime: scheduledTime.toISOString(),
                frequency: isRandomBroadcast ? 'random24h' : frequency,
                isRandomBroadcast: isRandomBroadcast
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            notify.success('Задание рассылки создано успешно!');
            
            // Очищаем форму
        
            document.querySelectorAll('.message-variant').forEach(textarea => textarea.value = '');
            // Оставляем только первый вариант сообщения
            const messagesContainer = document.querySelector('.messages-container');
            const firstMessage = messagesContainer.querySelector('.message-item');
            messagesContainer.innerHTML = '';
            messagesContainer.appendChild(firstMessage);
            firstMessage.querySelector('.message-variant').value = '';
            messageVariantCount = 1;
            updateRemoveButtons();
            clearBroadcastSelection();
            
            // Обновляем список заданий
            loadBroadcastTasks();
        } else {
            alert(`Ошибка создания задания: ${data.error}`);
        }
    } catch (error) {
       notify.error(`Ошибка соединения: ${error.message}`);
    }
}

// Загрузка списка заданий рассылки
async function loadBroadcastTasks() {
    try {
        const response = await fetch('/api/broadcast-tasks');
        const data = await response.json();
        
        if (data.success) {
            displayBroadcastTasks(data.tasks);
        }
    } catch (error) {
        console.error('Ошибка загрузки заданий:', error);
    }
}

// Отображение заданий рассылки
function displayBroadcastTasks(tasks) {
    const tasksList = document.getElementById('tasksList');
    
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p>Нет активных заданий рассылки</p>';
        return;
    }
    
    tasksList.innerHTML = tasks.map(task => `
        <div class="task-item">
            <div class="task-header">
                <div class="task-info">
                    <span class="task-status status-${task.status}">${getStatusText(task.status)}</span>
                    <span>Начало: ${new Date(task.startDateTime).toLocaleString('ru-RU')}</span>
                    <span>Периодичность: ${getFrequencyText(task.frequency)}</span>
                </div>
                <button class="delete-task" onclick="deleteBroadcastTask('${task.id}')">Удалить</button>
            </div>
            <div class="task-message">
                ${task.messages ? 
                    task.messages.map((msg, index) => `<div class="message-variant-display">Вариант ${index + 1}: ${msg}</div>`).join('') 
                    : 
                    `<div class="message-variant-display">${task.message || 'Сообщение не указано'}</div>`
                }
            </div>
            <div class="task-groups">Группы: ${task.groups.map(g => g.name).join(', ')}</div>
        </div>
    `).join('');
}

// Получение текста статуса
function getStatusText(status) {
    const statusTexts = {
        'pending': 'Ожидает',
        'active': 'Активно',
        'completed': 'Завершено'
    };
    return statusTexts[status] || status;
}

// Получение текста периодичности
function getFrequencyText(frequency) {
    const frequencyTexts = {
        'once': 'Один раз',
        'hourly': 'Каждый час',
        '2hourly': 'Каждые 2 часа',
        '4hourly': 'Каждые 4 часа',
        'daily': 'Каждый день',
        'random24h': 'Рандомно в течение 24 часов'
    };
    return frequencyTexts[frequency] || frequency;
}

// Удаление задания рассылки
async function deleteBroadcastTask(taskId) {
    
    showConfirm('Вы уверены, что хотите удалить это задание?', async () => {
    
        try {
            const response = await fetch(`/api/broadcast-tasks/${taskId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                loadBroadcastTasks(); // Обновляем список
            } else {
                notify.success(`Ошибка удаления: ${data.error}`);
            }
        } catch (error) {
            notify.success(`Ошибка соединения: ${error.message}`);
        }
    });
}

// Сохранение настроек рассылки
function saveBroadcastSettings() {
    const messages = getAllMessageVariants();
    const selectedGroups = Array.from(document.querySelectorAll('#broadcastGroupsList input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
    
    localStorage.setItem('broadcastMessages', JSON.stringify(messages));
    localStorage.setItem('broadcastSelectedGroups', JSON.stringify(selectedGroups));
}

// Загрузка настроек рассылки
function loadBroadcastSettings() {
    const savedMessages = localStorage.getItem('broadcastMessages');
    const savedGroups = localStorage.getItem('broadcastSelectedGroups');
    
    if (savedMessages) {
        const messages = JSON.parse(savedMessages);
        const textareas = document.querySelectorAll('.message-variant');
        
        // Загружаем сохраненные сообщения
        messages.forEach((message, index) => {
            if (index === 0 && textareas[0]) {
                textareas[0].value = message;
            } else if (index > 0) {
                addMessageVariant();
                const newTextarea = document.querySelectorAll('.message-variant')[index];
                if (newTextarea) newTextarea.value = message;
            }
        });
    }
    
    if (savedGroups) {
        const groupIds = JSON.parse(savedGroups);
        groupIds.forEach(groupId => {
            const checkbox = document.querySelector(`#broadcast-group-${groupId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        updateBroadcastGroupsCounter();
        
        const selectedCount = groupIds.length;
        const randomOption = document.querySelector('.random-option');
        if (randomOption && selectedCount >= 2) {
            randomOption.style.display = 'block';
        }
    }
}

// Обработчики для автосохранения
function setupAutoSave() {
    // Сохранение при изменении текста сообщений
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('message-variant')) {
            saveBroadcastSettings();
        }
    });
    
    // Сохранение при изменении выбора групп
    document.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.closest('#broadcastGroupsList')) {
            saveBroadcastSettings();
        }
    });
}

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

// Функции для работы с вариациями сообщений
let messageVariantCount = 1;

function addMessageVariant() {
    messageVariantCount++;
    const container = document.querySelector('.messages-container');
    
    const messageItem = document.createElement('div');
    messageItem.className = 'message-item';
    messageItem.innerHTML = `
        <label>Вариант сообщения ${messageVariantCount}:</label>
        <textarea class="message-variant" placeholder="Введите вариант сообщения ${messageVariantCount}" rows="3"></textarea>
        <button class="remove-message" onclick="removeMessage(this)">×</button>
    `;
    
    container.appendChild(messageItem);
    updateRemoveButtons();
}

function removeMessage(button) {
    const messageItem = button.closest('.message-item');
    messageItem.remove();
    updateMessageLabels();
    updateRemoveButtons();
}

function updateMessageLabels() {
    const messageItems = document.querySelectorAll('.message-item');
    messageItems.forEach((item, index) => {
        const label = item.querySelector('label');
        const textarea = item.querySelector('textarea');
        label.textContent = `Вариант сообщения ${index + 1}:`;
        textarea.placeholder = `Введите вариант сообщения ${index + 1}`;
    });
    messageVariantCount = messageItems.length;
}

function updateRemoveButtons() {
    const removeButtons = document.querySelectorAll('.remove-message');
    const hasMultiple = removeButtons.length > 1;
    
    removeButtons.forEach(button => {
        button.style.display = hasMultiple ? 'block' : 'none';
    });
}

function getAllMessageVariants() {
    const textareas = document.querySelectorAll('.message-variant');
    return Array.from(textareas)
        .map(textarea => textarea.value.trim())
        .filter(text => text.length > 0);
}