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


// Рандомная рассылка в течение 24 часов
async executeRandomBroadcast(task, telegramClientAPI) {
    console.log(`Начинаем рандомную рассылку на 24 часа для ${task.groups.length} групп`);
    
    // Меняем статус на 'scheduled' вместо 'completed'
    task.status = 'scheduled';
    task.totalGroups = task.groups.length;
    task.completedGroups = [];
    task.failedGroups = [];
    task.scheduledTimes = {}; // Добавляем объект для хранения времени планирования
    
    const now = new Date();
    
    // Планируем отправки
    task.groups.forEach(group => {
        const randomDelay = Math.random() * 24 * 60 * 60 * 1000; // 0-24 часа
        const scheduledTime = new Date(now.getTime() + randomDelay);
        
        // Сохраняем время планирования для каждой группы
        task.scheduledTimes[group.name] = scheduledTime.toISOString();
        
        console.log(`Группа ${group.name} запланирована на ${scheduledTime.toLocaleString('ru-RU')}`);
        
        setTimeout(async () => {
            try {
                const randomMessage = task.messages[Math.floor(Math.random() * task.messages.length)];
                await this.sendMessage(group, randomMessage, telegramClientAPI);
                
                // Отмечаем группу как выполненную
                task.completedGroups.push(group.name);
                
                console.log(`Отправлено в ${group.name}. Прогресс: ${task.completedGroups.length}/${task.totalGroups}`);
                
                // Проверяем, все ли группы выполнены
                if (task.completedGroups.length === task.totalGroups) {
                    task.status = 'completed';
                    task.completedAt = new Date().toISOString();
                    console.log(`Задание ${task.id} завершено`);
                }
                
            } catch (error) {
                console.error(`Ошибка отправки в группу ${group.name}:`, error);
                task.failedGroups.push({ group: group.name, error: error.message });
            }
        }, randomDelay);
    });
    
    // Выводим сообщение о планировании вместо завершения
    console.log(`Задание ${task.id} запланировано`);
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
}

module.exports = BroadcastManager;