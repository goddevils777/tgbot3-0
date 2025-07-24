class BroadcastManager {
    constructor(telegramClient) {
        this.telegramClient = telegramClient;
        this.tasks = new Map(); // Хранение заданий в памяти
        this.activeIntervals = new Map(); // Активные интервалы
    }

    // Создание нового задания рассылки
    createTask(taskData) {
        const taskId = Date.now().toString();
        const task = {
            id: taskId,
            messages: taskData.messages,
            groups: taskData.groups,
            startDateTime: taskData.startDateTime,
            frequency: taskData.frequency,
            isRandomBroadcast: taskData.isRandomBroadcast || false,
            status: 'pending',
            createdAt: new Date().toISOString(),
            nextRun: taskData.startDateTime
        };

        this.tasks.set(taskId, task);
        
        // Убираем автоматическое планирование - это будет делать UserSessionManager
        console.log(`Задание ${task.id} создано, ожидает планирования через UserSessionManager`);
        
        return task;
    }

    // Планирование выполнения задания
    scheduleTask(task, executionCallback) {
        const now = new Date();
        const startTime = new Date(task.startDateTime);
        const delay = startTime.getTime() - now.getTime();

        if (delay <= 0) {
            // Если время уже прошло, выполняем сразу через callback
            if (executionCallback) {
                executionCallback(task.id);
            }
        } else {
            // Планируем выполнение через callback
            setTimeout(() => {
                if (executionCallback) {
                    executionCallback(task.id);
                }
            }, delay);
        }
    }

    // Найди метод executeTask и обнови его:
   async executeTask(taskId, telegramClientAPI) {
    try {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // Проверяем наличие клиента
        if (!telegramClientAPI) {
            console.log('BroadcastManager: отсутствует Telegram клиент');
            task.status = 'failed';
            task.error = 'Нет активного Telegram клиента';
            return;
        }

        task.status = 'executing';
        console.log(`Выполнение задания: ${taskId}`);
        
        if (task.isRandomBroadcast) {
            await this.executeRandomBroadcast(task, telegramClientAPI);
        } else {
            await this.executeNormalBroadcast(task, telegramClientAPI);
            // Для обычной рассылки сразу завершаем
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            console.log(`Задание ${taskId} завершено`);
        }
        
    } catch (error) {
        console.error(`Ошибка выполнения задания ${taskId}:`, error);
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = 'failed';
            task.error = error.message;
        }
    }
}

    // Обнови executeNormalBroadcast:
    async executeNormalBroadcast(task, telegramClientAPI) {
        for (const group of task.groups) {
            try {
                // Выбираем случайное сообщение из массива
                const randomMessage = task.messages[Math.floor(Math.random() * task.messages.length)];
                await this.sendMessage(group, randomMessage, telegramClientAPI);

                await this.delay(2000); // Задержка между сообщениями
            } catch (error) {
                console.error(`Ошибка отправки в группу ${group.name}:`, error);
                task.failedGroups = task.failedGroups || [];
                task.failedGroups.push({
                    group: group.name,
                    error: error.message
                });
            }
        }
    }


// // Рандомная рассылка в течение 24 часов с умными интервалами и проверкой групп
async executeRandomBroadcast(task, telegramClientAPI) {
    console.log(`Начинаем умную рассылку для ${task.groups.length} групп`);
    
    task.status = 'scheduled';
    task.totalGroups = task.groups.length;
    task.completedGroups = [];
    task.failedGroups = [];
    task.skippedGroups = []; // Новое поле для пропущенных групп
    task.scheduledTimes = {};
    
    const now = new Date();
    
    // Сначала проверяем все группы
    console.log('🔍 Проверяем статус групп...');
    
    for (const group of task.groups) {
        const status = await this.checkGroupStatus(group, telegramClientAPI);
        
        if (!status.canSend) {
            console.log(`❌ Пропускаем группу ${group.name}: ${status.reason}`);
            task.skippedGroups.push({
                group: group.name,
                reason: status.reason
            });
            continue;
        }
        
        if (status.warning) {
            console.log(`⚠️  Группа ${group.name}: ${status.reason}`);
        } else {
            console.log(`✅ Группа ${group.name}: ${status.reason}`);
        }
        
        // Рассчитываем умный интервал для каждой группы
        // Рассчитываем умный интервал для каждой группы
        let smartDelay = this.calculateSmartInterval();

        // Для первых отправок добавляем базовую задержку
        const groupIndex = task.groups.indexOf(group);
        const baseDelay = groupIndex * (20 + Math.random() * 10) * 60 * 1000; // 20-30 минут между группами
        smartDelay = Math.max(smartDelay, baseDelay);

        const scheduledTime = new Date(now.getTime() + smartDelay);
        
        // Сохраняем время планирования
        task.scheduledTimes[group.name] = scheduledTime.toISOString();
        
        console.log(`📅 Группа ${group.name} запланирована на ${scheduledTime.toLocaleString('ru-RU')} (через ${Math.round(smartDelay / (1000 * 60))} минут)`);
        
        setTimeout(async () => {
            try {
                // Повторная проверка перед отправкой
                const finalCheck = await this.checkGroupStatus(group, telegramClientAPI);
                
                if (!finalCheck.canSend) {
                    console.log(`❌ Финальная проверка: пропускаем ${group.name} - ${finalCheck.reason}`);
                    task.skippedGroups.push({
                        group: group.name,
                        reason: `Финальная проверка: ${finalCheck.reason}`
                    });
                    return;
                }
                
                const randomMessage = task.messages[Math.floor(Math.random() * task.messages.length)];
                await this.sendMessage(group, randomMessage, telegramClientAPI);
                
                // Отмечаем группу как выполненную
                task.completedGroups.push(group.name);
                
                console.log(`✅ Отправлено в ${group.name}. Прогресс: ${task.completedGroups.length}/${task.totalGroups}`);
                
                // Проверяем завершение
                const totalProcessed = task.completedGroups.length + task.failedGroups.length + task.skippedGroups.length;
                if (totalProcessed === task.totalGroups) {
                    task.status = 'completed';
                    task.completedAt = new Date().toISOString();
                    console.log(`🎉 Задание ${task.id} завершено! Отправлено: ${task.completedGroups.length}, Ошибок: ${task.failedGroups.length}, Пропущено: ${task.skippedGroups.length}`);
                }
                
            } catch (error) {
                console.error(`❌ Ошибка отправки в группу ${group.name}:`, error);
                task.failedGroups.push({ 
                    group: group.name, 
                    error: error.message 
                });
            }
        }, smartDelay);
    }
    
    console.log(`📋 Планирование завершено. Отправка запланирована в ${task.groups.length - task.skippedGroups.length} групп, пропущено: ${task.skippedGroups.length}`);
}

    // Планирование следующего выполнения
    scheduleNextRun(task) {
        const intervals = {
            'hourly': 60 * 60 * 1000,           // 1 час
            '2hourly': 2 * 60 * 60 * 1000,     // 2 часа
            '4hourly': 4 * 60 * 60 * 1000,     // 4 часа
            'daily': 24 * 60 * 60 * 1000       // 24 часа
        };

        const intervalMs = intervals[task.frequency];
        if (!intervalMs) return;

        const nextRun = new Date(Date.now() + intervalMs);
        task.nextRun = nextRun.toISOString();
        task.status = 'pending';

        console.log(`Следующий запуск задания ${task.id}: ${nextRun.toLocaleString('ru-RU')}`);

        // Планируем следующее выполнение
        setTimeout(() => {
            this.executeTask(task);
        }, intervalMs);
    }

    // Обнови sendMessage:
    async sendMessage(group, message, telegramClientAPI) {
        if (!telegramClientAPI || !telegramClientAPI.client) {
            throw new Error('TelegramClientAPI не подключен');
        }
        
        try {
            console.log(`Отправка сообщения в ${group.name}`);
            
            await telegramClientAPI.client.sendMessage(group.id, {
                message: message
            });
            
            console.log(`Сообщение успешно отправлено в ${group.name}`);
        } catch (error) {
            console.error(`Ошибка отправки в группу ${group.name}:`, error);
            throw error;
        }
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
            // Останавливаем активные интервалы если есть
            if (this.activeIntervals.has(taskId)) {
                clearInterval(this.activeIntervals.get(taskId));
                this.activeIntervals.delete(taskId);
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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Умный расчет интервалов
    calculateSmartInterval() {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Определяем "хорошие" часы для отправки (избегаем ночь)
        const goodHours = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21];
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        
        console.log(`🕐 Текущий час: ${currentHour}, выходной: ${isWeekend}`);
        
        // Базовый интервал: 15-45 минут
        let baseInterval = (15 + Math.random() * 30) * 60 * 1000;
        
        // Если сейчас "плохое" время, откладываем до следующего хорошего времени
        if (!goodHours.includes(currentHour)) {
            let nextGoodHour;
            if (currentHour < 8) {
                nextGoodHour = 8; // До утра
            } else if (currentHour > 21) {
                nextGoodHour = 8 + 24; // До завтра
            } else {
                nextGoodHour = 14; // После обеда
            }
            
            const hoursUntilGoodTime = nextGoodHour - currentHour;
            const delayUntilGoodTime = hoursUntilGoodTime * 60 * 60 * 1000;
            
            console.log(`⏰ Плохое время! Откладываем на ${hoursUntilGoodTime} часов до ${nextGoodHour % 24}:00`);
            
            return delayUntilGoodTime + baseInterval;
        }
        
        // Увеличиваем интервалы в выходные
        const weekendMultiplier = isWeekend ? 1.5 : 1;
        
        // Добавляем случайность ±50%
        const randomness = 0.5 + Math.random();
        
        const finalInterval = Math.floor(baseInterval * weekendMultiplier * randomness);
        
        console.log(`⏱️ Рассчитан интервал: ${Math.round(finalInterval / (60 * 1000))} минут`);
        
        return finalInterval;
    }

    // Проверка статуса группы перед отправкой
    async checkGroupStatus(group, telegramClientAPI) {
        try {
            if (!telegramClientAPI || !telegramClientAPI.client) {
                return { canSend: false, reason: 'Нет подключения к Telegram' };
            }

            console.log(`Проверяем статус группы: ${group.name}`);

            // Пытаемся получить информацию о группе
            const entity = await telegramClientAPI.client.getEntity(group.id);
            
            if (!entity) {
                return { canSend: false, reason: 'Группа не найдена' };
            }

            // Проверяем, не заблокированы ли мы
            if (entity.left) {
                return { canSend: false, reason: 'Мы исключены из группы' };
            }

            // Проверяем права на отправку сообщений
            if (entity.defaultBannedRights && entity.defaultBannedRights.sendMessages) {
                return { canSend: false, reason: 'Нет прав на отправку сообщений' };
            }

            // Проверяем активность группы (есть ли новые сообщения за последние 7 дней)
            try {
                const messages = await telegramClientAPI.client.getMessages(entity, { limit: 10 });
                
                if (messages.length === 0) {
                    return { canSend: true, reason: 'Группа пустая, но доступна', warning: true };
                }

                const lastMessage = messages[0];
                const lastMessageDate = new Date(lastMessage.date * 1000);
                const daysSinceLastMessage = (Date.now() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24);

                if (daysSinceLastMessage > 30) {
                    return { canSend: true, reason: 'Группа неактивная (30+ дней без сообщений)', warning: true };
                }

                return { canSend: true, reason: 'Группа активна и доступна' };

            } catch (messagesError) {
                console.log(`Не удалось проверить сообщения в ${group.name}:`, messagesError.message);
                return { canSend: true, reason: 'Группа доступна (не удалось проверить активность)', warning: true };
            }

        } catch (error) {
            console.error(`Ошибка проверки группы ${group.name}:`, error.message);
            
            // Если группа не найдена или нет доступа
            if (error.message.includes('No entity') || error.message.includes('CHANNEL_INVALID')) {
                return { canSend: false, reason: 'Группа недоступна или удалена' };
            }
            
            if (error.message.includes('CHAT_ADMIN_REQUIRED')) {
                return { canSend: false, reason: 'Нет прав доступа к группе' };
            }

            // В остальных случаях разрешаем отправку
            return { canSend: true, reason: 'Неизвестный статус, пробуем отправить', warning: true };
        }
    }
}

module.exports = BroadcastManager;