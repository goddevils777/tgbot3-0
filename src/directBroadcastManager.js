const crypto = require('crypto');

class DirectBroadcastManager {
    constructor() {
        this.tasks = new Map(); // Хранение заданий в памяти
        this.activeTimeouts = new Map(); // Активные таймауты
        this.sendingQueues = new Map(); // Очереди отправки для каждой задачи
    }

    // Создание нового задания рассылки в личные сообщения
    createTask(taskData) {
        const taskId = crypto.randomBytes(8).toString('hex').toUpperCase();
        
        const task = {
            id: taskId,
            messages: taskData.messages,
            participants: taskData.participants.map((p, index) => ({
                ...p,
                id: index + 1,
                status: 'pending', // pending, sent, error
                sendTime: null,
                error: null
            })),
            startDateTime: taskData.startDateTime,
            dailyLimit: taskData.dailyLimit,
            status: 'pending', // pending, active, completed, paused
            createdAt: new Date().toISOString(),
            stats: {
                total: taskData.participants.length,
                sent: 0,
                errors: 0,
                remaining: taskData.participants.length
            },
            schedule: this.calculateSchedule(taskData.participants.length, taskData.dailyLimit, taskData.startDateTime),
            currentDay: 0,
            sentToday: 0
        };

        this.tasks.set(taskId, task);
        console.log(`Создано задание рассылки в личные сообщения: ${taskId}`);
        
        return task;
    }

    // Расчет расписания отправки
    calculateSchedule(totalParticipants, dailyLimit, startDateTime) {
        const schedule = [];
        const startDate = new Date(startDateTime);
        let currentDate = new Date(startDate);
        let remainingParticipants = totalParticipants;
        let participantIndex = 0;

        while (remainingParticipants > 0) {
            const todayLimit = Math.min(dailyLimit, remainingParticipants);
            const daySchedule = [];

            // Создаем случайные интервалы в течение дня
            const intervals = this.generateRandomIntervals(todayLimit);
            
            for (let i = 0; i < todayLimit; i++) {
                const sendTime = new Date(currentDate);
                sendTime.setMinutes(sendTime.getMinutes() + intervals[i]);
                
                daySchedule.push({
                    participantIndex: participantIndex++,
                    sendTime: sendTime.toISOString(),
                    dayIndex: schedule.length
                });
            }

            schedule.push({
                date: currentDate.toISOString().split('T')[0],
                participants: daySchedule,
                completed: false
            });

            remainingParticipants -= todayLimit;
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        }

        return schedule;
    }

    // Генерация случайных интервалов в течение дня
    generateRandomIntervals(count) {
        if (count === 1) return [0];
        
        const maxMinutes = 24 * 60 - 60; // 24 часа минус час запаса
        const intervals = [];
        
        // Создаем случайные точки времени
        const timePoints = [];
        for (let i = 0; i < count; i++) {
            timePoints.push(Math.random() * maxMinutes);
        }
        
        // Сортируем по времени
        timePoints.sort((a, b) => a - b);
        
        // Преобразуем в интервалы от начала дня
        return timePoints.map(point => Math.floor(point));
    }

    // Планирование выполнения задания
    scheduleTask(task, executionCallback) {
        const now = new Date();
        const startTime = new Date(task.startDateTime);
        const delay = startTime.getTime() - now.getTime();

        if (delay <= 0) {
            // Если время уже прошло, начинаем сразу
            if (executionCallback) {
                executionCallback(task.id);
            }
        } else {
            // Планируем начало выполнения
            const timeout = setTimeout(() => {
                if (executionCallback) {
                    executionCallback(task.id);
                }
            }, delay);
            
            this.activeTimeouts.set(task.id, timeout);
        }
    }

    // Выполнение задания рассылки
    async executeTask(taskId, telegramClientAPI) {
        try {
            const task = this.tasks.get(taskId);
            if (!task || task.status === 'completed') return;

            if (!telegramClientAPI) {
                task.status = 'error';
                task.error = 'Нет активного Telegram клиента';
                return;
            }

            task.status = 'active';
            console.log(`Начинаем выполнение рассылки в личные сообщения: ${taskId}`);
            
            // Запускаем обработку расписания
            await this.processSchedule(task, telegramClientAPI);
            
        } catch (error) {
            console.error(`Ошибка выполнения рассылки ${taskId}:`, error);
            const task = this.tasks.get(taskId);
            if (task) {
                task.status = 'error';
                task.error = error.message;
            }
        }
    }

    // Обработка расписания отправки
    async processSchedule(task, telegramClientAPI) {
        const now = new Date();
        
        for (const daySchedule of task.schedule) {
            if (daySchedule.completed) continue;
            
            const dayDate = new Date(daySchedule.date);
            if (dayDate.toDateString() !== now.toDateString() && dayDate > now) {
                // Планируем выполнение на следующий день
                const nextDayStart = new Date(dayDate);
                const delay = nextDayStart.getTime() - now.getTime();
                
                setTimeout(() => {
                    this.processSchedule(task, telegramClientAPI);
                }, delay);
                return;
            }
            
            // Обрабатываем участников текущего дня
            for (const scheduleItem of daySchedule.participants) {
                const participant = task.participants[scheduleItem.participantIndex];
                if (participant.status !== 'pending') continue;
                
                const sendTime = new Date(scheduleItem.sendTime);
                const delay = sendTime.getTime() - Date.now();
                
                if (delay > 0) {
                    // Планируем отправку
                    setTimeout(async () => {
                        await this.sendMessageToParticipant(task, participant, telegramClientAPI);
                    }, delay);
                } else {
                    // Отправляем сразу если время уже прошло
                    await this.sendMessageToParticipant(task, participant, telegramClientAPI);
                }
            }
            
            daySchedule.completed = true;
        }
    }

    // Отправка сообщения участнику
    async sendMessageToParticipant(task, participant, telegramClientAPI) {
        try {
            // Выбираем случайное сообщение
            const randomMessage = task.messages[Math.floor(Math.random() * task.messages.length)];
            
            // Определяем получателя
            let recipient = null;
            switch (participant.type) {
                case 'username':
                    recipient = participant.input; // @username
                    break;
                case 'phone':
                    recipient = participant.input; // +79001234567
                    break;
                case 'id':
                    recipient = parseInt(participant.input); // числовой ID
                    break;
                case 'name':
                    // Для имени нужно искать пользователя
                    recipient = await this.findUserByName(participant.input, telegramClientAPI);
                    break;
            }

            if (!recipient) {
                throw new Error(`Не удалось определить получателя: ${participant.input}`);
            }

            // Отправляем сообщение
            await telegramClientAPI.client.sendMessage(recipient, {
                message: randomMessage
            });

            // Обновляем статус
            participant.status = 'sent';
            participant.sendTime = new Date().toISOString();
            
            task.stats.sent++;
            task.stats.remaining--;
            task.sentToday++;

            console.log(`Сообщение отправлено: ${participant.input}`);

            // Проверяем завершение
            if (task.stats.remaining === 0) {
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
                console.log(`Рассылка ${task.id} завершена`);
            }

        } catch (error) {
            console.error(`Ошибка отправки сообщения ${participant.input}:`, error);
            
            participant.status = 'error';
            participant.error = error.message;
            participant.sendTime = new Date().toISOString();
            
            task.stats.errors++;
            task.stats.remaining--;
        }
    }

    // Поиск пользователя по имени (упрощенная версия)
    async findUserByName(name, telegramClientAPI) {
        try {
            // Здесь можно реализовать поиск по имени через API Telegram
            // Пока возвращаем null - нужно доработать в зависимости от возможностей API
            return null;
        } catch (error) {
            console.error('Ошибка поиска пользователя по имени:', error);
            return null;
        }
    }

    // Получение всех заданий
    getAllTasks() {
        return Array.from(this.tasks.values()).sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    // Получение деталей задания
    getTaskDetails(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return null;

        const sentParticipants = task.participants.filter(p => p.status === 'sent');
        const errorParticipants = task.participants.filter(p => p.status === 'error');
        const remainingParticipants = task.participants.filter(p => p.status === 'pending');

        return {
            task: task,
            lists: {
                sent: sentParticipants.map(p => p.input),
                errors: errorParticipants.map(p => `${p.input} (${p.error})`),
                remaining: remainingParticipants.map(p => p.input)
            }
        };
    }

    // Удаление задания
    deleteTask(taskId) {
        if (this.tasks.has(taskId)) {
            // Останавливаем активные таймауты
            if (this.activeTimeouts.has(taskId)) {
                clearTimeout(this.activeTimeouts.get(taskId));
                this.activeTimeouts.delete(taskId);
            }
            
            // Очищаем очереди отправки
            if (this.sendingQueues.has(taskId)) {
                this.sendingQueues.delete(taskId);
            }
            
            this.tasks.delete(taskId);
            console.log(`Задание рассылки ${taskId} удалено`);
            return true;
        }
        return false;
    }

    // Получение задания по ID
    getTask(taskId) {
        return this.tasks.get(taskId);
    }

    // Приостановка задания
    pauseTask(taskId) {
        const task = this.tasks.get(taskId);
        if (task && task.status === 'active') {
            task.status = 'paused';
            // Здесь можно добавить логику приостановки отправки
            return true;
        }
        return false;
    }

    // Возобновление задания
    resumeTask(taskId, telegramClientAPI) {
        const task = this.tasks.get(taskId);
        if (task && task.status === 'paused') {
            task.status = 'active';
            // Возобновляем обработку расписания
            this.processSchedule(task, telegramClientAPI);
            return true;
        }
        return false;
    }
}

module.exports = DirectBroadcastManager;