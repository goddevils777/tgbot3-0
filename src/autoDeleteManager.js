const { Api } = require('telegram');

class AutoDeleteManager {
    constructor() {
        this.tasks = new Map(); // Хранение заданий в памяти
        this.activeTimeouts = new Map(); // Активные таймауты
    }

    // Создание нового задания автоудаления
    createTask(taskData) {
        const taskId = Date.now().toString();
        
        const task = {
            id: taskId,
            users: taskData.users.map((user, index) => ({
                ...user,
                id: index + 1,
                status: 'pending', // pending, completed, error, skipped
                processTime: null,
                error: null
            })),
            deleteTimer: taskData.deleteTimer,
            startDateTime: taskData.startDateTime,
            settings: taskData.settings,
            status: 'pending', // pending, scheduled, executing, completed
            createdAt: new Date().toISOString(),
            stats: {
                total: taskData.users.length,
                completed: 0,
                errors: 0,
                skipped: 0
            }
        };

        this.tasks.set(taskId, task);
        console.log(`Создано задание автоудаления: ${taskId}`);
        
        return task;
    }

    // Планирование выполнения задания
    scheduleTask(task, executionCallback) {
        const now = new Date();
        const startTime = new Date(task.startDateTime);
        const delay = startTime.getTime() - now.getTime();

        if (delay <= 0) {
            // Если время уже прошло, выполняем сразу
            if (executionCallback) {
                executionCallback(task.id);
            }
        } else {
            // Планируем выполнение
            const timeout = setTimeout(() => {
                if (executionCallback) {
                    executionCallback(task.id);
                }
            }, delay);
            
            this.activeTimeouts.set(task.id, timeout);
            task.status = 'scheduled';
            
            console.log(`Задание ${task.id} запланировано на ${startTime.toLocaleString('ru-RU')}`);
        }
    }

    // Выполнение задания автоудаления
    async executeTask(taskId, telegramClientAPI) {
        try {
            const task = this.tasks.get(taskId);
            if (!task) return;

            if (!telegramClientAPI) {
                console.log('AutoDeleteManager: отсутствует Telegram клиент');
                task.status = 'failed';
                task.error = 'Нет активного Telegram клиента';
                return;
            }

            task.status = 'executing';
            console.log(`Выполнение задания автоудаления: ${taskId}`);
            
            await this.executeAutoDeleteOperations(task, telegramClientAPI);
            
        } catch (error) {
            console.error(`Ошибка выполнения задания ${taskId}:`, error);
            const task = this.tasks.get(taskId);
            if (task) {
                task.status = 'failed';
                task.error = error.message;
            }
        }
    }

    // Выполнение операций автоудаления с умными интервалами
    async executeAutoDeleteOperations(task, telegramClientAPI) {
        console.log(`Начинаем настройку автоудаления для ${task.users.length} пользователей`);
        
        task.totalUsers = task.users.length;
        task.completedUsers = [];
        task.failedUsers = [];
        task.skippedUsers = [];
        
        const now = new Date();
        
        for (let i = 0; i < task.users.length; i++) {
            const user = task.users[i];
            
            // Рассчитываем умный интервал
            const delay = this.calculateSmartInterval(i, task.settings);
            const scheduledTime = new Date(now.getTime() + delay);
            
            console.log(`Пользователь ${user.input} запланирован на ${scheduledTime.toLocaleString('ru-RU')} (через ${Math.round(delay / (60 * 1000))} минут)`);
            
            setTimeout(async () => {
                try {
                    const result = await this.setAutoDeleteTimer(user, task.deleteTimer, telegramClientAPI, task.settings);
                    
                    if (result.success) {
                        task.completedUsers.push(user.input);
                        task.stats.completed++;
                        user.status = 'completed';
                        user.processTime = new Date().toISOString();
                        
                        console.log(`✅ Автоудаление настроено для ${user.input}`);
                    } else if (result.skipped) {
                        task.skippedUsers.push({
                            user: user.input,
                            reason: result.reason
                        });
                        task.stats.skipped++;
                        user.status = 'skipped';
                        user.error = result.reason;
                        
                        console.log(`⏭️ Пропущен ${user.input}: ${result.reason}`);
                    } else {
                        task.failedUsers.push({
                            user: user.input,
                            error: result.error
                        });
                        task.stats.errors++;
                        user.status = 'error';
                        user.error = result.error;
                        
                        console.log(`❌ Ошибка для ${user.input}: ${result.error}`);
                    }
                    
                    // Проверяем завершение
                    const totalProcessed = task.completedUsers.length + task.failedUsers.length + task.skippedUsers.length;
                    if (totalProcessed === task.totalUsers) {
                        task.status = 'completed';
                        task.completedAt = new Date().toISOString();
                        console.log(`🎉 Задание ${task.id} завершено! Выполнено: ${task.stats.completed}, Ошибок: ${task.stats.errors}, Пропущено: ${task.stats.skipped}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Ошибка обработки ${user.input}:`, error);
                    task.failedUsers.push({
                        user: user.input,
                        error: error.message
                    });
                    task.stats.errors++;
                    user.status = 'error';
                    user.error = error.message;
                }
            }, delay);
        }
        
        console.log(`📋 Планирование автоудаления завершено для ${task.users.length} пользователей`);
    }

    // Расчет умного интервала
    calculateSmartInterval(index, settings) {
        let baseInterval;
        
        if (settings.smartIntervals) {
            // Умные интервалы: 15-45 минут
            baseInterval = (15 + Math.random() * 30) * 60 * 1000;
        } else {
            // Обычные интервалы: 1-3 минуты
            baseInterval = (1 + Math.random() * 2) * 60 * 1000;
        }
        
        // Добавляем базовую задержку для каждого следующего пользователя
        const sequentialDelay = index * baseInterval;
        
        // Если включено избежание ночных часов
        if (settings.avoidNightHours) {
            const scheduledTime = new Date(Date.now() + sequentialDelay);
            const hour = scheduledTime.getHours();
            
            // Если попадаем на ночь (22:00 - 08:00), откладываем до утра
            if (hour >= 22 || hour < 8) {
                const hoursUntilMorning = hour >= 22 ? (32 - hour) : (8 - hour); // До 8 утра
                const nightDelay = hoursUntilMorning * 60 * 60 * 1000;
                return sequentialDelay + nightDelay;
            }
        }
        
        return sequentialDelay;
    }

    // Установка таймера автоудаления для пользователя
    // Установка таймера автоудаления для пользователя
    async setAutoDeleteTimer(user, deleteTimer, telegramClientAPI, settings) {
        try {
            if (!telegramClientAPI || !telegramClientAPI.client) {
                throw new Error('Telegram клиент не подключен');
            }

            console.log(`Ищем пользователя: ${user.input} (тип: ${user.type})`);

            // Находим пользователя
            let targetUser;
            try {
                let searchValue = user.input;
                
                // Обработка ссылок t.me
                if (searchValue.includes('t.me/')) {
                    const username = searchValue.split('t.me/')[1];
                    searchValue = username;
                    console.log(`Извлечен username из ссылки: ${username}`);
                }
                
                // Убираем @ если есть
                if (searchValue.startsWith('@')) {
                    searchValue = searchValue.substring(1);
                }
                
                if (user.type === 'username' || searchValue.match(/^[a-zA-Z0-9_]+$/)) {
                    // Поиск по username
                    console.log(`Поиск по username: ${searchValue}`);
                    
                    try {
                        const result = await telegramClientAPI.client.invoke(
                            new Api.contacts.ResolveUsername({ username: searchValue })
                        );
                        targetUser = result.users[0];
                        console.log(`Найден через ResolveUsername: ${targetUser.firstName || targetUser.username}`);
                    } catch (resolveError) {
                        console.log(`ResolveUsername не сработал: ${resolveError.message}`);
                        
                        // Альтернативный поиск в диалогах
                        console.log('Ищем в диалогах...');
                        const dialogs = await telegramClientAPI.client.getDialogs({});
                        
                        for (const dialog of dialogs) {
                            if (dialog.entity && dialog.entity.username === searchValue) {
                                targetUser = dialog.entity;
                                console.log(`Найден в диалогах по username: ${targetUser.firstName || targetUser.username}`);
                                break;
                            }
                        }
                    }
                } else if (user.type === 'phone') {
                    // Поиск по телефону
                    console.log(`Поиск по телефону: ${searchValue}`);
                    const contacts = await telegramClientAPI.client.invoke(new Api.contacts.GetContacts({ hash: 0 }));
                    targetUser = contacts.users.find(u => u.phone === searchValue.replace('+', ''));
                    
                    if (targetUser) {
                        console.log(`Найден по телефону: ${targetUser.firstName || targetUser.username}`);
                    }
                } else if (user.type === 'id') {
                    // Поиск по ID
                    console.log(`Поиск по ID: ${searchValue}`);
                    const users = await telegramClientAPI.client.invoke(
                        new Api.users.GetUsers({ id: [parseInt(searchValue)] })
                    );
                    targetUser = users[0];
                    
                    if (targetUser) {
                        console.log(`Найден по ID: ${targetUser.firstName || targetUser.username}`);
                    }
                } else {
                    // Поиск по имени в диалогах
                    console.log(`Поиск по имени: ${searchValue}`);
                    const dialogs = await telegramClientAPI.client.getDialogs({});
                    
                    for (const dialog of dialogs) {
                        if (dialog.entity && dialog.entity.firstName && 
                            dialog.entity.firstName.toLowerCase().includes(searchValue.toLowerCase())) {
                            targetUser = dialog.entity;
                            console.log(`Найден по имени: ${targetUser.firstName}`);
                            break;
                        }
                    }
                }
                
                if (!targetUser) {
                    console.log(`Пользователь ${user.input} не найден ни одним способом`);
                    return {
                        success: false,
                        skipped: true,
                        reason: 'Пользователь не найден. Убедитесь что у вас есть диалог с этим пользователем.'
                    };
                }
            } catch (error) {
                console.error(`Ошибка поиска пользователя ${user.input}:`, error);
                return {
                    success: false,
                    error: `Ошибка поиска пользователя: ${error.message}`
                };
            }

            const userName = targetUser.firstName || targetUser.username || 'Пользователь';
            console.log(`Найден пользователь: ${userName} (ID: ${targetUser.id})`);

            // Проверяем существующий таймер если включена опция
            if (settings.checkExistingTimer) {
                try {
                    const peerSettings = await telegramClientAPI.client.invoke(
                        new Api.messages.GetPeerSettings({ peer: targetUser })
                    );
                    
                    if (peerSettings.settings && peerSettings.settings.autoDeleteTimer) {
                        console.log(`У ${userName} уже установлен таймер`);
                        return {
                            success: false,
                            skipped: true,
                            reason: 'Таймер уже установлен'
                        };
                    }
                } catch (error) {
                    // Игнорируем ошибки проверки, продолжаем установку
                    console.log(`Не удалось проверить существующий таймер: ${error.message}`);
                }
            }

            // Конвертируем таймер в секунды
            const timerSeconds = this.convertTimerToSeconds(deleteTimer);
            
            console.log(`Устанавливаем таймер ${deleteTimer} (${timerSeconds} секунд) для ${userName}`);

            if (timerSeconds === 0) {
                // Отключаем автоудаление
                await telegramClientAPI.client.invoke(
                    new Api.messages.SetHistoryTTL({
                        peer: targetUser,
                        period: 0
                    })
                );
                console.log(`Автоудаление отключено для ${userName}`);
            } else {
                // Устанавливаем таймер автоудаления
                await telegramClientAPI.client.invoke(
                    new Api.messages.SetHistoryTTL({
                        peer: targetUser,
                        period: timerSeconds
                    })
                );
                console.log(`Таймер автоудаления установлен для ${userName}`);
            }

            return {
                success: true,
                message: `Таймер ${deleteTimer} установлен для ${userName}`
            };

        } catch (error) {
            console.error(`Ошибка установки таймера для ${user.input}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Конвертация таймера в секунды
    convertTimerToSeconds(timer) {
        const timers = {
            '1day': 24 * 60 * 60,      // 1 день
            '1week': 7 * 24 * 60 * 60, // 1 неделя
            '1month': 30 * 24 * 60 * 60, // 1 месяц
            'disable': 0                // Отключить
        };
        
        return timers[timer] || 0;
    }

    // Получение всех заданий
    getAllTasks() {
        return Array.from(this.tasks.values()).sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    // Удаление задания
    deleteTask(taskId) {
        if (this.tasks.has(taskId)) {
            // Останавливаем активные таймауты если есть
            if (this.activeTimeouts.has(taskId)) {
                clearTimeout(this.activeTimeouts.get(taskId));
                this.activeTimeouts.delete(taskId);
            }
            
            this.tasks.delete(taskId);
            return true;
        }
        return false;
    }

    // Получение задания по ID
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
}

module.exports = AutoDeleteManager;