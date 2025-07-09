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
            status: 'pending',
            createdAt: new Date().toISOString(),
            nextRun: taskData.startDateTime
        };

        this.tasks.set(taskId, task);
        this.scheduleTask(task);
        
        return task;
    }

    // Планирование выполнения задания
    scheduleTask(task) {
        const now = new Date();
        const startTime = new Date(task.startDateTime);
        const delay = startTime.getTime() - now.getTime();

        if (delay <= 0) {
            // Если время уже прошло, выполняем сразу
            this.executeTask(task);
        } else {
            // Планируем выполнение
            setTimeout(() => {
                this.executeTask(task);
            }, delay);
        }
    }

    // Выполнение задания рассылки
    async executeTask(task) {
        try {
            console.log(`Выполняем рассылку для задания ${task.id}`);
            
            // Обновляем статус
            task.status = 'active';
            
            // Отправляем сообщения во все группы с паузами 5 минут
            for (let i = 0; i < task.groups.length; i++) {
                const group = task.groups[i];
                
                try {
                    await this.sendMessage(group.id, task.message);
                    console.log(`Сообщение отправлено в группу: ${group.name} (${i + 1}/${task.groups.length})`);
                    
                    // Пауза 5 минут между группами (кроме последней)
                    if (i < task.groups.length - 1) {
                        console.log(`Ожидание 5 минут до отправки в следующую группу...`);
                        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // 5 минут
                    }
                } catch (error) {
                    console.error(`Ошибка отправки в группу ${group.name}:`, error);
                }
            }

            // Планируем следующее выполнение или завершаем
            if (task.frequency === 'once') {
                task.status = 'completed';
                console.log(`Задание ${task.id} завершено`);
            } else {
                this.scheduleNextRun(task);
            }
            
        } catch (error) {
            console.error(`Ошибка выполнения задания ${task.id}:`, error);
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

    // Отправка сообщения в группу
    async sendMessage(groupId, message) {
        if (!this.telegramClient.isConnected) {
            throw new Error('Telegram клиент не подключен');
        }

        try {
            await this.telegramClient.client.sendMessage(groupId, {
                message: message
            });
        } catch (error) {
            throw new Error(`Ошибка отправки сообщения: ${error.message}`);
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
}

module.exports = BroadcastManager;