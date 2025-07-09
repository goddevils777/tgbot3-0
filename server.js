const express = require('express');
const TelegramClient = require('./src/telegram.js');
const TelegramClientAPI = require('./src/telegramClient');
const AIAnalyzer = require('./src/aiAnalyzer');
const BroadcastManager = require('./src/broadcastManager');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/src', express.static('src'));

const telegram = new TelegramClient();
const telegramClientAPI = new TelegramClientAPI();
const aiAnalyzer = new AIAnalyzer();
const broadcastManager = new BroadcastManager(telegramClientAPI);

// Подключение к Telegram Client при старте
telegramClientAPI.connect().then(() => {
    console.log('Telegram Client API готов к работе');
}).catch(error => {
    console.log('Ошибка:', error.message);
});

// API для поиска сообщений
app.post('/api/search', async (req, res) => {
    try {
        const { keywords, groups, limit } = req.body;

        // Валидация
        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Добавьте хотя бы одно ключевое слово' 
            });
        }
        
        if (!groups || groups.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Выберите хотя бы одну группу' 
            });
        }
        
        if (limit < 1 || limit > 10000) {
            return res.json({ 
                success: false, 
                error: 'Количество сообщений должно быть от 1 до 1000' 
            });
        }
        
        // Реальный поиск сообщений
        const results = await telegramClientAPI.searchMessages(keywords, groups, limit);
        res.json({ success: true, results: results });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API для получения групп
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await telegramClientAPI.getChats();
        res.json({ success: true, groups: groups });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API для AI анализа сообщений
app.post('/api/ai-analyze', async (req, res) => {
    try {
        const { messages, prompt } = req.body;
        
        // Валидация
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Нет сообщений для анализа' 
            });
        }
        
        if (!prompt || prompt.trim().length === 0) {
            return res.json({ 
                success: false, 
                error: 'Введите промпт для анализа' 
            });
        }
        
        // Анализируем сообщения через AI
        const filteredMessages = await aiAnalyzer.analyzeMessages(messages, prompt);
        
        res.json({ success: true, results: filteredMessages });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});


// API для автопоиска новых сообщений
app.post('/api/autosearch', async (req, res) => {
    try {
        const { keywords, groupId, groupName, lastMessageId } = req.body;
        
        // Валидация
        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Добавьте хотя бы одно ключевое слово' 
            });
        }
        
        if (!groupId) {
            return res.json({ 
                success: false, 
                error: 'Выберите группу для мониторинга' 
            });
        }
        
        // Получаем новые сообщения из группы
        const group = { id: groupId, name: groupName };
        const allMessages = await telegramClientAPI.searchMessages(keywords, [group], 50);
        
        // Получаем новые сообщения из группы
        const newMessages = await telegramClientAPI.autoSearchMessages(keywords, groupId, groupName, lastMessageId);
        
        res.json({ success: true, results: newMessages });
    } catch (error) {
        console.error('Ошибка автопоиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для инициализации автопоиска (получение последнего ID сообщения)
app.post('/api/init-autosearch', async (req, res) => {
    try {
        const { groupId, groupName } = req.body;
        
        if (!groupId) {
            return res.json({ 
                success: false, 
                error: 'Не указан ID группы' 
            });
        }
        
        // Получаем последнее сообщение из группы
        const lastMessageId = await telegramClientAPI.getLastMessageId(groupId);
        
        res.json({ 
            success: true, 
            lastMessageId: lastMessageId,
            groupName: groupName 
        });
    } catch (error) {
        console.error('Ошибка инициализации автопоиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для создания задания рассылки
app.post('/api/create-broadcast', async (req, res) => {
    try {
        const { message, groups, startDateTime, frequency } = req.body;
        
        // Валидация
        if (!message || message.trim().length === 0) {
            return res.json({ 
                success: false, 
                error: 'Введите текст сообщения' 
            });
        }
        
        if (!groups || groups.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Выберите хотя бы одну группу' 
            });
        }
        
        if (!startDateTime) {
            return res.json({ 
                success: false, 
                error: 'Укажите дату и время начала' 
            });
        }
        
        // Проверяем, что время в будущем
        const scheduledTime = new Date(startDateTime);
        if (scheduledTime <= new Date()) {
            return res.json({ 
                success: false, 
                error: 'Время начала должно быть в будущем' 
            });
        }
        
        // Создаем задание
        const task = broadcastManager.createTask({
            message: message.trim(),
            groups: groups,
            startDateTime: startDateTime,
            frequency: frequency || 'once'
        });
        
        res.json({ success: true, task: task });
    } catch (error) {
        console.error('Ошибка создания задания рассылки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка заданий рассылки
app.get('/api/broadcast-tasks', async (req, res) => {
    try {
        const tasks = broadcastManager.getAllTasks();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        console.error('Ошибка получения заданий:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для удаления задания рассылки
app.delete('/api/broadcast-tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const deleted = broadcastManager.deleteTask(taskId);
        
        if (deleted) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Задание не найдено' });
        }
    } catch (error) {
        console.error('Ошибка удаления задания:', error);
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});