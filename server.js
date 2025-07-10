const express = require('express');
const TelegramClient = require('./src/telegram.js');
const TelegramClientAPI = require('./src/telegramClient');
const AIAnalyzer = require('./src/aiAnalyzer');
const BroadcastManager = require('./src/broadcastManager');
const SessionManager = require('./src/sessionManager');

const app = express();
const PORT = 3000;


app.use(express.json());
app.use(express.static('public'));
app.use('/src', express.static('src'));

const telegram = new TelegramClient();
const sessionManager = new SessionManager();
const aiAnalyzer = new AIAnalyzer();

// Создаем TelegramClientAPI с поддержкой SessionManager
let telegramClientAPI = null;

// Инициализируем с текущей сессией или создаем пустой
async function initializeTelegramClient() {
    const activeClient = sessionManager.getActiveClient();
    console.log('Активный клиент после автоподключения:', activeClient ? 'найден' : 'не найден');
    
    if (activeClient) {
        // Создаем объект с методами из TelegramClientAPI
        const TelegramClientAPI = require('./src/telegramClient');
        const tempInstance = new TelegramClientAPI();
        
        telegramClientAPI = {
            client: activeClient,
            isConnected: true,
            // Привязываем методы к нашему объекту
            searchMessages: tempInstance.searchMessages.bind({ client: activeClient, isConnected: true }),
            autoSearchMessages: tempInstance.autoSearchMessages.bind({ client: activeClient, isConnected: true }),
            getChats: tempInstance.getChats.bind({ client: activeClient, isConnected: true }),
            getChannels: tempInstance.getChannels.bind({ client: activeClient, isConnected: true }),
            checkLiveStream: tempInstance.checkLiveStream.bind({ client: activeClient, isConnected: true }),
            getLastMessageId: tempInstance.getLastMessageId.bind({ client: activeClient, isConnected: true })
        };
        
        console.log('TelegramClientAPI инициализирован с активной сессией');
        console.log('Клиент подключен:', telegramClientAPI.isConnected);
    } else {
        // Создаем пустую заглушку
        telegramClientAPI = {
            client: null,
            isConnected: false,
            searchMessages: async () => [],
            autoSearchMessages: async () => [],
            getChats: async () => [],
            getChannels: async () => [],
            checkLiveStream: async () => ({ isLive: false, streamInfo: null, participants: [] }),
            getLastMessageId: async () => 0
        };
        
        console.log('Нет активной сессии, используйте страницу управления сессиями');
    }
}

const broadcastManager = new BroadcastManager(telegramClientAPI);

// Инициализируем клиент при запуске
sessionManager.loadSavedSessions(); // Сначала загружаем сессии и автоподключаемся

// Инициализируем телеграм клиент ПОСЛЕ автоподключения
setTimeout(async () => {
    await initializeTelegramClient();
    console.log('Telegram Client API готов к работе');
}, 2000); // Даем 2 секунды на автоподключение

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

// API для получения краткой информации о сессии для главной страницы
app.get('/api/session-info', async (req, res) => {
    try {
        const currentSession = sessionManager.getCurrentSession();
        if (currentSession) {
            res.json({ 
                success: true, 
                session: {
                    name: currentSession.name,
                    phone: currentSession.phone,
                    isConnected: currentSession.isConnected
                }
            });
        } else {
            res.json({ success: false, session: null });
        }
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

// API для получения каналов (для Live Stream)
app.get('/api/channels', async (req, res) => {
    try {
        const channels = await telegramClientAPI.getChannels();
        res.json({ success: true, channels: channels });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API для проверки статуса стрима и получения участников
app.post('/api/check-stream', async (req, res) => {
    try {
        const { channelId, channelName } = req.body;
        
        if (!channelId) {
            return res.json({ 
                success: false, 
                error: 'Не указан ID канала' 
            });
        }
        
        // Проверяем статус стрима и получаем участников
        const streamData = await telegramClientAPI.checkLiveStream(channelId, channelName);
        
        res.json({ 
            success: true, 
            isLive: streamData.isLive,
            streamInfo: streamData.streamInfo,
            participants: streamData.participants || []
        });
    } catch (error) {
        console.error('Ошибка проверки стрима:', error);
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
        const { message, groups, startDateTime, frequency, isRandomBroadcast } = req.body;
        
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
            frequency: frequency || 'once',
            isRandomBroadcast: isRandomBroadcast || false
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


// API для получения текущей сессии
app.get('/api/current-session', async (req, res) => {
    try {
        const currentSession = sessionManager.getCurrentSession();
        if (currentSession) {
            res.json({ success: true, session: currentSession });
        } else {
            res.json({ success: false, error: 'Нет активной сессии' });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка всех сессий
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = sessionManager.getAllSessions();
        res.json({ success: true, sessions });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API для добавления новой сессии
app.post('/api/add-session', async (req, res) => {
    try {
        const { name, phone } = req.body;
        
        if (!name || !phone) {
            return res.json({ 
                success: false, 
                error: 'Введите название и номер телефона' 
            });
        }
        
        console.log(`Создание новой сессии: ${name} (${phone})`);
        const result = await sessionManager.createSession(name, phone);
        
        if (result.success) {
            // Обновляем telegramClientAPI для новой сессии
            await initializeTelegramClient();
            res.json({ success: true, message: 'Сессия успешно создана' });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Ошибка создания сессии:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для переключения сессии
app.post('/api/switch-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        console.log(`Переключение на сессию: ${sessionId}`);
        const result = await sessionManager.switchToSession(sessionId);
        
        if (result.success) {
            // Обновляем telegramClientAPI для новой сессии
            await initializeTelegramClient();
            res.json({ success: true, message: 'Сессия успешно переключена' });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Ошибка переключения сессии:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для удаления сессии
app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        console.log(`Удаление сессии: ${sessionId}`);
        const result = await sessionManager.deleteSession(sessionId);
        
        if (result.success) {
            // Если удалили текущую сессию, нужно переинициализировать клиент
            await initializeTelegramClient();
            res.json({ success: true, message: 'Сессия успешно удалена' });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Ошибка удаления сессии:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для генерации QR-кода
app.post('/api/generate-qr', async (req, res) => {
    try {
        const { sessionName } = req.body;
        
        if (!sessionName || sessionName.trim().length < 3) {
            return res.json({ 
                success: false, 
                error: 'Название сессии должно быть не менее 3 символов' 
            });
        }
        
        const result = await sessionManager.generateQRCode(sessionName.trim());
        
        if (result.success) {
            res.json({ 
                success: true, 
                token: result.token,
                qrCodeUrl: result.qrCodeUrl
            });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Ошибка генерации QR-кода:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для проверки статуса QR авторизации
app.post('/api/check-qr-status', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.json({ 
                success: false, 
                error: 'Не указан токен' 
            });
        }
        
        const result = await sessionManager.checkQRStatus(token);
        
        res.json({ 
            success: true, 
            status: result.status,
            sessionId: result.sessionId || null
        });
    } catch (error) {
        console.error('Ошибка проверки статуса QR:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для отмены QR авторизации
app.post('/api/cancel-qr', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (token) {
            await sessionManager.cancelQRCode(token);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отмены QR-кода:', error);
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});