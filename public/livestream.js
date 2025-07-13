// Переменные состояния
let isStreamParsing = false;
let streamParsingInterval = null;
let participants = new Map(); // Для хранения уникальных участников
let selectedChannelId = null;
let selectedChannelName = null;
let waitingInterval = null;
let monitoringInterval = null;

// DOM элементы
let channelsList, streamStatus, streamInfo, participantsList;

// Сохранение состояния Live Stream
function saveLiveStreamState() {
    const state = {
        selectedChannelId: selectedChannelId,
        selectedChannelName: selectedChannelName,
        isStreamParsing: isStreamParsing,
        participants: Array.from(participants.entries()),
        timestamp: new Date().toISOString()
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
    
  
    
    // Загружаем каналы
    await loadChannels();
    
    // Обработчики событий
    document.getElementById('startStreamParsing').addEventListener('click', startStreamParsing);
    document.getElementById('stopStreamParsing').addEventListener('click', stopStreamParsing);

    const saveLivestreamButton = document.getElementById('saveLivestreamToHistory');
    if (saveLivestreamButton) {
        saveLivestreamButton.addEventListener('click', saveLivestreamToHistory);
    }
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

// Запуск поиска участников стрима
async function startStreamParsing() {
    if (!selectedChannelId) {
        alert('Выберите канал для мониторинга');
        return;
    }
    
    try {
        // Сначала проверяем есть ли активный стрим
        streamStatus.textContent = 'Проверка наличия стрима...';
        streamStatus.className = 'status checking';
        
        const streamCheckResponse = await fetch('/api/check-livestream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: selectedChannelId })
        });
        
        const streamData = await streamCheckResponse.json();
        
        if (!streamData.success) {
            streamStatus.textContent = 'Ошибка проверки стрима';
            streamStatus.className = 'status error';
            alert('Ошибка при проверке стрима: ' + streamData.error);
            return;
        }
        
        // Запускаем мониторинг независимо от текущего статуса стрима
        isStreamParsing = true;
        
        // Обновляем интерфейс
        document.getElementById('startStreamParsing').disabled = true;
        document.getElementById('stopStreamParsing').disabled = false;
        
        if (streamData.isStreamActive) {
            streamStatus.textContent = 'Стрим найден! Запуск мониторинга...';
            streamStatus.className = 'status running';
            showStreamInfo(streamData.streamInfo);
        } else {
            streamStatus.textContent = 'Стрим не найден. Ожидание появления...';
            streamStatus.className = 'status waiting';
        }
        
        // Сохраняем состояние
        saveLiveStreamState();
        
        // Запускаем периодическую проверку
        streamParsingInterval = setInterval(checkStreamStatus, 5000);
        
        // Первая проверка
        checkStreamStatus();
        
    } catch (error) {
        console.error('Ошибка запуска мониторинга:', error);
        streamStatus.textContent = 'Ошибка запуска';
        streamStatus.className = 'status error';
        alert('Ошибка запуска мониторинга: ' + error.message);
    }
}

function resetStartButton() {
    const startBtn = document.getElementById('startStreamParsing');
    const statusSpan = document.getElementById('streamStatus');
    
    startBtn.disabled = false;
    startBtn.textContent = 'Начать поиск участников';
    statusSpan.textContent = 'Остановлен';
    statusSpan.className = 'status stopped';
}

// Мониторинг ожидания начала стрима
function startWaitingForStream(channel) {
    if (waitingInterval) {
        clearInterval(waitingInterval);
    }
    
    waitingInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/check-livestream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    channelId: channel.id
                })
            });

            const data = await response.json();
            
            if (data.success && data.isLive) {
                console.log('Стрим начался! Запускаем поиск участников');
                clearInterval(waitingInterval);
                
                // Обновляем интерфейс
                const startBtn = document.getElementById('startStreamParsing');
                const stopBtn = document.getElementById('stopStreamParsing');
                const statusSpan = document.getElementById('streamStatus');
                
                startBtn.textContent = 'Поиск запущен';
                stopBtn.disabled = false;
                statusSpan.textContent = 'Активен';
                statusSpan.className = 'status active';
                
                // Запускаем регулярный мониторинг
                startRegularMonitoring(channel);
            }
        } catch (error) {
            console.error('Ошибка мониторинга ожидания:', error);
        }
    }, 30000); // Проверяем каждые 30 секунд
}

// Регулярный мониторинг активного стрима
function startRegularMonitoring(channel) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    monitoringInterval = setInterval(() => {
        checkStreamStatus();
    }, 15000); // Проверяем каждые 15 секунд
}

// Остановка поиска участников стрима
function stopStreamParsing() {
    // Останавливаем мониторинг
    isStreamParsing = false;
    
    // Очищаем интервалы
    if (streamParsingInterval) {
        clearInterval(streamParsingInterval);
        streamParsingInterval = null;
    }
    
    if (waitingInterval) {
        clearInterval(waitingInterval);
        waitingInterval = null;
    }
    
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    
    // Обновляем интерфейс
    document.getElementById('startStreamParsing').disabled = false;
    document.getElementById('stopStreamParsing').disabled = true;
    streamStatus.textContent = 'Мониторинг остановлен';
    streamStatus.className = 'status stopped';
    
    // Скрываем информацию о стриме
    document.getElementById('streamInfo').style.display = 'none';
    
    // Сохраняем состояние
    saveLiveStreamState();
    
    console.log('Мониторинг Live Stream остановлен');
}

// Проверка статуса стрима
async function checkStreamStatus() {
    if (!selectedChannelId || !isStreamParsing) {
        return;
    }
    
    try {
        // Проверяем активен ли стрим
        const streamCheckResponse = await fetch('/api/check-livestream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: selectedChannelId })
        });
        
        const streamData = await streamCheckResponse.json();
        
        if (!streamData.success) {
            streamStatus.textContent = 'Ошибка проверки стрима';
            streamStatus.className = 'status error';
            return;
        }
        
        // Если стрим не активен
        if (!streamData.isStreamActive) {
            streamStatus.textContent = 'Стрим не найден. Ожидание...';
            streamStatus.className = 'status waiting';
            return;
        }
        
        // Если стрим активен - получаем участников
        streamStatus.textContent = 'Стрим найден! Получение участников...';
        streamStatus.className = 'status running';
        
        // Показываем информацию о стриме
        showStreamInfo(streamData.streamInfo);
        
        // Добавь логирование после получения streamData
        console.log('Полный ответ API:', streamData);
        console.log('Участники из API:', streamData.participants);
        console.log('Длина массива участников:', streamData.participants ? streamData.participants.length : 'undefined');

        // Получаем участников
        if (streamData.participants && streamData.participants.length > 0) {
            // Добавляем новых участников
            streamData.participants.forEach(participant => {
                console.log('Добавляем участника:', participant);
                if (!participants.has(participant.id)) {
                    participants.set(participant.id, {
                        ...participant,
                        firstSeen: new Date().toLocaleString('ru-RU')
                    });
                }
            });
            
            // Обновляем отображение
            displayParticipants();
            
            // Сохраняем состояние
            saveLiveStreamState();
            
            streamStatus.textContent = `Найдено участников: ${participants.size}`;
            streamStatus.className = 'status running';
        } else {
            console.log('Участники не найдены или пустой массив');
            streamStatus.textContent = 'Стрим найден, но участники не получены';
            streamStatus.className = 'status running';
        }

        // Проверяем завершение стрима
        if (streamData.streamEnded && isStreamParsing) {
            console.log('Стрим завершен, останавливаем мониторинг');
            streamStatus.textContent = 'Стрим завершен. Мониторинг остановлен.';
            streamStatus.className = 'status stopped';
            
            // Автоматически останавливаем мониторинг
            stopStreamParsing();
            return;
        }

        } catch (error) {
            console.error('Ошибка проверки стрима:', error);
            streamStatus.textContent = 'Ошибка соединения';
            streamStatus.className = 'status error';
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
                displayParticipants(); // ← Эта функция показывает кнопку
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

// Очистка сохраненного состояния
function clearLiveStreamState() {
    localStorage.removeItem('liveStreamState');
}



// Отображение участников
function displayParticipants() {
    const participantsList = document.getElementById('participantsList');
    
    if (!participantsList) {
        console.error('Элемент participantsList не найден');
        return;
    }
    
    console.log('Отображаем участников, размер Map:', participants.size);
    console.log('Участники из Map:', Array.from(participants.values()));
    
    if (participants.size === 0) {
        participantsList.innerHTML = '<p>Участники не найдены</p>';
        return;
    }
    
    // Преобразуем Map в массив
    const participantsArray = Array.from(participants.values());
    
    const html = participantsArray.map(participant => `
        <div class="participant-item">
            <div class="participant-info">
                <span class="participant-name">${participant.name || 'Без имени'}</span>
                <span class="participant-contact">${
                    participant.username ? `@${participant.username}` : 
                    participant.phone ? participant.phone : 'Контакт скрыт'
                }</span>
            </div>
            <div class="participant-meta">
                <span class="first-seen">Замечен: ${participant.firstSeen}</span>
            </div>
        </div>
    `).join('');
    
    participantsList.innerHTML = html;
    
    // Обновляем счетчик
    const participantsStats = document.querySelector('.participants-stats');
    if (participantsStats) {
        participantsStats.innerHTML = `<span>Всего участников: ${participants.size}</span>`;
    }


    // Показываем кнопку сохранения если есть участники
    const saveLivestreamButton = document.getElementById('saveLivestreamToHistory');
    if (saveLivestreamButton) {
        if (participants.size > 0) {
            saveLivestreamButton.style.display = 'block';
        } else {
            saveLivestreamButton.style.display = 'none';
        }
    }
}

// Добавь функцию обновления статистики:
function updateParticipantsStats(participants) {
    const totalElement = document.getElementById('totalParticipants');
    const uniqueElement = document.getElementById('uniqueParticipants');
    
    if (totalElement) {
        totalElement.textContent = `Всего найдено: ${participants.length}`;
    }
    
    if (uniqueElement) {
        // Считаем уникальных по ID
        const uniqueCount = new Set(participants.map(p => p.id)).size;
        uniqueElement.textContent = `Уникальных: ${uniqueCount}`;
    }
}

// Функция для сохранения участников Live Stream в историю
function saveLivestreamToHistory() {
    if (participants.size === 0) {
        alert('Нет участников для сохранения');
        return;
    }
    
    // Создаем объект истории если его нет
    if (!window.historyManager) {
        window.historyManager = {
            addToHistory: function(type, data) {
                const history = JSON.parse(localStorage.getItem('telegram_bot_history') || '{"search":[],"livestream":[],"autosearch":[]}');
                const record = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    ...data
                };
                history[type].unshift(record);
                if (history[type].length > 50) {
                    history[type] = history[type].slice(0, 50);
                }
                localStorage.setItem('telegram_bot_history', JSON.stringify(history));
                return record.id;
            }
        };
    }
    
    // Подготавливаем данные для сохранения
    const participantsArray = Array.from(participants.values());
    const historyData = {
        channelName: selectedChannelName || 'Неизвестный канал',
        channelId: selectedChannelId,
        participantsCount: participants.size,
        participants: participantsArray,
        streamInfo: {
            monitoringStarted: new Date().toISOString(),
            uniqueParticipants: participants.size
        }
    };
    
    // Сохраняем в историю
    const savedId = window.historyManager.addToHistory('livestream', historyData);
    
    // Показываем уведомление
    alert(`Участники Live Stream сохранены в историю!\nКанал: ${selectedChannelName}\nУчастников: ${participants.size}`);
    
    console.log('Участники Live Stream сохранены с ID:', savedId);
}




