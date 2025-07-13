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
            message: taskData.message,
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
            }
            
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            console.log(`Задание ${taskId} завершено`);
            
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
                await this.sendMessage(group, task.message, telegramClientAPI);
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
        
        // Создаем копию массива групп для перемешивания
        const shuffledGroups = [...task.groups];
        
        // Перемешиваем группы
        for (let i = shuffledGroups.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledGroups[i], shuffledGroups[j]] = [shuffledGroups[j], shuffledGroups[i]];
        }
        
        // Вычисляем случайные интервалы в течение 24 часов
        const totalDuration = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
        const intervals = [];
        
        for (let i = 0; i < shuffledGroups.length; i++) {
            intervals.push(Math.random() * totalDuration);
        }
        
        // Сортируем интервалы по возрастанию
        intervals.sort((a, b) => a - b);
        
        // Планируем отправку каждой группе
        for (let i = 0; i < shuffledGroups.length; i++) {
            const group = shuffledGroups[i];
            const delay = intervals[i];
            const sendTime = new Date(Date.now() + delay);
            
            console.log(`Группа ${group.name} запланирована на ${sendTime.toLocaleString('ru-RU')}`);
            
            setTimeout(async () => {
                try {
                    await this.sendMessage(group, task.message, telegramClientAPI);
                    console.log(`Рандомная отправка: сообщение отправлено в группу ${group.name}`);
                } catch (error) {
                    console.error(`Ошибка рандомной отправки в группу ${group.name}:`, error);
                }
            }, delay);
        }
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