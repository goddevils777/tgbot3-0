// Переменные состояния
let isStreamParsing = false;
let streamParsingInterval = null;
let participants = new Map(); // Для хранения уникальных участников
let selectedChannelId = null;
let selectedChannelName = null;

// DOM элементы
let channelsList, streamStatus, streamInfo, participantsList;

// Сохранение состояния Live Stream
function saveLiveStreamState() {
    const state = {
        selectedChannelId: selectedChannelId,
        selectedChannelName: selectedChannelName,
        isStreamParsing: isStreamParsing,
        participants: Array.from(participants.entries())
    };
    localStorage.setItem('liveStreamState', JSON.stringify(state));
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация DOM элементов
    channelsList = document.getElementById('channelsList');
    streamStatus = document.getElementById('streamStatus');
    streamInfo = document.getElementById('streamInfo');
    participantsList = document.getElementById('participantsList');
    
    // Загружаем информацию о сессии
    await loadSessionInfo();
    
    // Загружаем каналы
    await loadChannels();
    
    // Обработчики событий
    document.getElementById('startStreamParsing').addEventListener('click', startStreamParsing);
    document.getElementById('stopStreamParsing').addEventListener('click', stopStreamParsing);
});

// Загрузка каналов
async function loadChannels() {
    try {
        const response = await fetch('/api/channels');
        const data = await response.json();
        
        if (data.success) {
            displayChannels(data.channels);
        } else {
            channelsList.innerHTML = '<div class="channel-loading">Ошибка загрузки каналов</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки каналов:', error);
        channelsList.innerHTML = '<div class="channel-loading">Ошибка соединения</div>';
    }
}

// Отображение каналов
function displayChannels(channels) {
    const channelsCount = document.getElementById('channelsCounter');
    
    if (channels.length === 0) {
        channelsList.innerHTML = '<div class="channel-loading">Каналы не найдены</div>';
        channelsCount.textContent = 'Каналов: 0';
        return;
    }
    
    channelsCount.textContent = `Каналов: ${channels.length}`;
    
    channelsList.innerHTML = channels.map(channel => `
        <div class="channel-item">
            <input type="radio" id="channel-${channel.id}" name="selectedChannel" value="${channel.id}">
            <label for="channel-${channel.id}">
                <span class="channel-name">${channel.name}</span>
                <span class="channel-username">${channel.type} • ${channel.subscribersCount || 0} подписчиков</span>
            </label>
        </div>
    `).join('');
    
    // Обработчик выбора канала
    document.addEventListener('change', (e) => {
        if (e.target.name === 'selectedChannel') {
            selectedChannelId = e.target.value;
            const label = e.target.nextElementSibling;
            selectedChannelName = label.querySelector('.channel-name').textContent;
            saveLiveStreamState();
        }
    });
    // Добавь эту строку в самый конец функции:
    loadLiveStreamState();
}

// Функция старта парсинга стрима
async function startStreamParsing() {
    if (!selectedChannelId) {
        alert('Выберите канал для мониторинга');
        return;
    }
    
    isStreamParsing = true;
    saveLiveStreamState(); // Добавь эту строку

    document.getElementById('startStreamParsing').disabled = true;
    document.getElementById('stopStreamParsing').disabled = false;
    streamStatus.textContent = 'Поиск стрима...';
    streamStatus.className = 'status running';
    
    // Очищаем предыдущие результаты
    participants.clear();
    updateParticipantsDisplay();
    
    console.log(`Начинаем мониторинг канала: ${selectedChannelName}`);
    
    // Запускаем первую проверку
    checkStreamStatus();
    
    // Запускаем проверку каждые 5 секунд
    streamParsingInterval = setInterval(() => {
        if (isStreamParsing) {
            checkStreamStatus();
        }
    }, 5000);
}

// Функция остановки парсинга
function stopStreamParsing() {
    console.log('Останавливаем парсинг стрима...');
    
    isStreamParsing = false;
    
    if (streamParsingInterval) {
        clearInterval(streamParsingInterval);
        streamParsingInterval = null;
    }
    
    document.getElementById('startStreamParsing').disabled = false;
    document.getElementById('stopStreamParsing').disabled = true;
    streamStatus.textContent = 'Остановлен';
    streamStatus.className = 'status stopped';
    
    streamInfo.style.display = 'none';
    
    clearLiveStreamState(); // Добавь эту строку
    console.log('Парсинг стрима остановлен');
}

// Проверка статуса стрима
async function checkStreamStatus() {
    try {
        const response = await fetch('/api/check-stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                channelId: selectedChannelId,
                channelName: selectedChannelName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.isLive) {
                streamStatus.textContent = 'Стрим активен - собираем участников';
                showStreamInfo(data.streamInfo);
                
                // Получаем участников
                if (data.participants && data.participants.length > 0) {
                    processParticipants(data.participants);
                }
            } else {
                streamStatus.textContent = 'Ожидаем начала стрима...';
                streamInfo.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Ошибка проверки стрима:', error);
        streamStatus.textContent = 'Ошибка соединения';
    }
}

// Обработка участников
function processParticipants(newParticipants) {
    newParticipants.forEach(participant => {
        const key = participant.id || participant.phone || participant.username;
        if (key && !participants.has(key)) {
            participants.set(key, {
                ...participant,
                firstSeen: new Date().toLocaleString('ru-RU')
            });
        }
    });
    
    updateParticipantsDisplay();
    saveLiveStreamState(); 
}

// Обновление отображения участников
function updateParticipantsDisplay() {
    const totalCount = participants.size;
    document.getElementById('totalParticipants').textContent = `Всего найдено: ${totalCount}`;
    document.getElementById('uniqueParticipants').textContent = `Уникальных: ${totalCount}`;
    
    if (totalCount === 0) {
        participantsList.innerHTML = '<p>Участники не найдены</p>';
        return;
    }
    
    const participantsArray = Array.from(participants.values());
    participantsList.innerHTML = participantsArray.map(participant => `
        <div class="participant-item">
            <div class="participant-info">
                <span class="participant-name">${participant.name || 'Без имени'}</span>
                <span class="participant-contact">${participant.username ? `@${participant.username}` : participant.phone || 'Контакт скрыт'}</span>
            </div>
            <div class="participant-meta">
                <span class="first-seen">Замечен: ${participant.firstSeen}</span>
            </div>
        </div>
    `).join('');
}

// Показать информацию о стриме
function showStreamInfo(streamInfo) {
    const streamInfoDiv = document.getElementById('streamInfo');
    const streamDetailsDiv = document.getElementById('streamDetails');
    
    streamDetailsDiv.innerHTML = `
        <div class="stream-detail">
            <span>Канал: ${selectedChannelName}</span>
        </div>
        <div class="stream-detail">
            <span>Статус: Стрим активен</span>
        </div>
        <div class="stream-detail">
            <span>Время мониторинга: ${new Date().toLocaleString('ru-RU')}</span>
        </div>
    `;
    
    streamInfoDiv.style.display = 'block';
}

// Экспорт участников в CSV
function exportParticipants() {
    if (participants.size === 0) {
        alert('Нет данных для экспорта');
        return;
    }
    
    const csvContent = "data:text/csv;charset=utf-8,Name,Username,Phone,First Seen\n" + 
        Array.from(participants.values()).map(p => 
            `"${p.name || ''}","${p.username || ''}","${p.phone || ''}","${p.firstSeen}"`
        ).join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `stream_participants_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

// Загрузка состояния Live Stream
function loadLiveStreamState() {
    const savedState = localStorage.getItem('liveStreamState');
    
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            
            // Восстанавливаем выбранный канал СНАЧАЛА
            if (state.selectedChannelId && state.selectedChannelName) {
                selectedChannelId = state.selectedChannelId; // Восстанавливаем сразу
                selectedChannelName = state.selectedChannelName; // Восстанавливаем сразу
                
                // Отмечаем радиокнопку
                setTimeout(() => {
                    const radioButton = document.querySelector(`input[value="${selectedChannelId}"]`);
                    if (radioButton) {
                        radioButton.checked = true;
                    }
                }, 100);
            }
            
            // Восстанавливаем участников
            if (state.participants && state.participants.length > 0) {
                participants = new Map(state.participants);
                updateParticipantsDisplay();
            }
            
            // ТЕПЕРЬ проверяем восстановление поиска
            console.log('Проверяем восстановление поиска:', state.isStreamParsing, selectedChannelId);
            
            if (state.isStreamParsing && selectedChannelId) {
                console.log('Условие выполнено, запускаем восстановление');
                setTimeout(() => {
                    console.log('Восстанавливаем активный поиск...');
                    
                    // Обновляем состояние переменных
                    isStreamParsing = true;
                    
                    // Обновляем интерфейс
                    document.getElementById('startStreamParsing').disabled = true;
                    document.getElementById('stopStreamParsing').disabled = false;
                    streamStatus.textContent = 'Поиск восстановлен...';
                    streamStatus.className = 'status running';
                    
                    // Запускаем первую проверку
                    checkStreamStatus();
                    
                    // Запускаем интервал проверки
                    streamParsingInterval = setInterval(() => {
                        if (isStreamParsing) {
                            checkStreamStatus();
                        }
                    }, 5000);
                    
                }, 1000);
            } else {
                console.log('Условие НЕ выполнено, восстановление пропущено');
            }
            
            console.log('Состояние Live Stream восстановлено');
        } catch (error) {
            console.error('Ошибка загрузки состояния:', error);
        }
    }
}

// Загрузка состояния Live Stream
function loadLiveStreamState() {
    const savedState = localStorage.getItem('liveStreamState');
    
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            
            // Восстанавливаем выбранный канал
            if (state.selectedChannelId && state.selectedChannelName) {
                selectedChannelId = state.selectedChannelId;
                selectedChannelName = state.selectedChannelName;
                
                // Отмечаем радиокнопку
                setTimeout(() => {
                    const radioButton = document.querySelector(`input[value="${selectedChannelId}"]`);
                    if (radioButton) {
                        radioButton.checked = true;
                    }
                }, 100);
                
                // Восстанавливаем поиск если он был активен
                if (state.isStreamParsing) {
                    setTimeout(() => {
                        console.log('Восстанавливаем активный поиск...');
                        
                        isStreamParsing = true;
                        document.getElementById('startStreamParsing').disabled = true;
                        document.getElementById('stopStreamParsing').disabled = false;
                        streamStatus.textContent = 'Поиск восстановлен...';
                        streamStatus.className = 'status running';
                        
                        checkStreamStatus();
                        streamParsingInterval = setInterval(() => {
                            if (isStreamParsing) {
                                checkStreamStatus();
                            }
                        }, 5000);
                    }, 1000);
                }
            }
            
            // Восстанавливаем участников
            if (state.participants && state.participants.length > 0) {
                participants = new Map(state.participants);
                updateParticipantsDisplay();
            }
            
            console.log('Состояние Live Stream восстановлено');
        } catch (error) {
            console.error('Ошибка загрузки состояния:', error);
        }
    }
}

// Очистка сохраненного состояния
function clearLiveStreamState() {
    localStorage.removeItem('liveStreamState');
}