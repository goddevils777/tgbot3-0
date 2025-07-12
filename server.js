const express = require('express');
const TelegramClient = require('./src/telegram.js');
const TelegramClientAPI = require('./src/telegramClient');
const AIAnalyzer = require('./src/aiAnalyzer');
const BroadcastManager = require('./src/broadcastManager');
const SessionManager = require('./src/sessionManager');
const UserManager = require('./src/userManager');

const app = express();
const PORT = 3000;


app.use(express.json());
app.use(express.static('public'));
app.use('/src', express.static('src'));

const userManager = new UserManager();


// Middleware для проверки пользователя  
app.use((req, res, next) => {
    // Правильное извлечение cookie
    const cookies = req.headers.cookie;
    let userId = null;
    
    if (cookies) {
        const userIdCookie = cookies.split(';').find(cookie => cookie.trim().startsWith('userId='));
        if (userIdCookie) {
            userId = userIdCookie.split('=')[1];
        }
    }
    
    // Проверяем есть ли userId и существует ли пользователь в users.json
    if (!userId || !userManager.userExists(userId)) {
        // Если нет авторизации - перенаправляем на страницу входа
        if (req.url.startsWith('/api/') && req.url !== '/api/register' && req.url !== '/api/login') {
            return res.json({ success: false, error: 'Необходима авторизация', redirect: '/login.html' });
        }
        
        // Для обычных страниц перенаправляем на login
        if (!req.url.includes('login') && !req.url.includes('register') && !req.url.includes('auth.js') && !req.url.includes('style.css')) {
            return res.redirect('/login.html');
        }
        
        req.userId = null;
        req.userSessionsDir = null;  // НЕ вызываем getUserSessionsDir для null
    } else {
        userManager.updateLastActive(userId);
        req.userId = userId;
        req.userSessionsDir = userManager.getUserSessionsDir(userId);  // Только для авторизованных
    }
    
    next();
});



const telegram = new TelegramClient();
let sessionManager = new SessionManager();
const aiAnalyzer = new AIAnalyzer();



// Инициализируем телеграм клиент ПОСЛЕ автоподключения
setTimeout(async () => {
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
        const results = await req.telegramClientAPI.searchMessages(keywords, groups, limit);
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
// API для получения групп
app.get('/api/groups', async (req, res) => {
    try {
        console.log('Запрос групп, telegramClientAPI:', req.telegramClientAPI ? 'есть' : 'нет');
        
        if (!req.telegramClientAPI) {
            return res.json({ success: false, error: 'Нет активной сессии' });
        }
        
        console.log('Получаем группы...');
        const groups = await req.telegramClientAPI.getChats();
        console.log(`Найдено групп: ${groups.length}`);
        
        res.json({ success: true, groups: groups });
    } catch (error) {
        console.error('Ошибка получения групп:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения каналов (для Live Stream)
app.get('/api/channels', async (req, res) => {
    try {
        const channels = await req.telegramClientAPI.getChannels();
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
        const streamData = await req.telegramClientAPI.checkLiveStream(channelId, channelName);
        
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
        const allMessages = await req.telegramClientAPI.searchMessages(keywords, [group], 50);
        
        // Получаем новые сообщения из группы
        const newMessages = await req.telegramClientAPI.autoSearchMessages(keywords, groupId, groupName, lastMessageId);
        
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
        const lastMessageId = await req.telegramClientAPI.getLastMessageId(groupId);
        
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
        const task = req.broadcastManager.createTask({
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
        const tasks = req.broadcastManager.getAllTasks();
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
        
        const deleted = req.broadcastManager.deleteTask(taskId);
        
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



// API для переключения сессии
app.post('/api/switch-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        console.log(`Переключение на сессию: ${sessionId}`);
        const result = await sessionManager.switchToSession(sessionId);
        
        if (result.success) {
            // Обновляем telegramClientAPI для новой сессии
            
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
           
           
            res.json({ success: true, message: 'Сессия успешно удалена' });
        } else {
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Ошибка удаления сессии:', error);
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
        
        res.json(result);
    } catch (error) {
        console.error('Ошибка создания сессии:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для регистрации
app.post('/api/register', (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.json({ 
                success: false, 
                error: 'Введите логин и пароль' 
            });
        }
        
        if (login.length < 3 || password.length < 6) {
            return res.json({ 
                success: false, 
                error: 'Логин от 3 символов, пароль от 6 символов' 
            });
        }
        
        const result = userManager.registerUser(login, password);
        res.json(result);
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для авторизации
app.post('/api/login', (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.json({ 
                success: false, 
                error: 'Введите логин и пароль' 
            });
        }
        
        const result = userManager.loginUser(login, password);
        
        if (result.success) {
            // Устанавливаем cookie с userId
            res.setHeader('Set-Cookie', `userId=${result.userId}; Path=/; HttpOnly; Max-Age=31536000`);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});