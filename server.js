// В начале файла замени импорты:
require('dotenv').config();
const express = require('express');
const TelegramClient = require('./src/telegram.js');
const TelegramClientAPI = require('./src/telegramClient');
const AIAnalyzer = require('./src/aiAnalyzer');
const BroadcastManager = require('./src/broadcastManager');
const UserManager = require('./src/userManager');
const RequestManager = require('./src/requestManager');
const UserSessionManager = require('./src/userSessionManager'); 
const session = require('express-session');
const passport = require('passport');
const GoogleAuthManager = require('./src/googleAuth');
const GoogleAuthRoutes = require('./src/googleAuthRoutes');

// Замени инициализацию менеджеров:
const userManager = new UserManager();
const requestManager = new RequestManager();
const userSessionManager = new UserSessionManager(); // Главный менеджер изоляции



const app = express();
const PORT = 3000;

// Настройка сессий для Google OAuth
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // В продакшене поставить true для HTTPS
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
    }
}));

// Инициализация Passport
app.use(passport.initialize());
app.use(passport.session());

// Инициализация Google авторизации
const googleAuthManager = new GoogleAuthManager(userManager);
const googleAuthRoutes = new GoogleAuthRoutes(userManager, googleAuthManager);

// Подключение Google роутов
app.use(googleAuthRoutes.getRouter());

app.use(express.json());
app.use(express.static('public'));
app.use('/src', express.static('src'));






// Middleware для проверки пользователя (обновленный с Google OAuth)
app.use((req, res, next) => {
    let userId = null;
    
    // Сначала проверяем Google авторизацию через Passport
    if (req.isAuthenticated && req.isAuthenticated()) {
        userId = req.user.id;
        req.userId = userId;
        req.userSessionsDir = userManager.getUserSessionsDir(userId);
        userManager.updateLastActive(userId);
        return next();
    }
    
    // Затем проверяем обычную авторизацию через cookie
    const cookies = req.headers.cookie;
    if (cookies) {
        const userIdCookie = cookies.split(';').find(cookie => cookie.trim().startsWith('userId='));
        if (userIdCookie) {
            userId = userIdCookie.split('=')[1];
        }
    }
    
    // Проверяем есть ли userId и существует ли пользователь в users.json
    if (!userId || !userManager.userExists(userId)) {
        // Если нет авторизации - перенаправляем на страницу входа
        if (req.url.startsWith('/api/') && 
            req.url !== '/api/register' && 
            req.url !== '/api/login' &&
            req.url !== '/api/google-user') {
            return res.json({ 
                success: false, 
                error: 'Необходима авторизация', 
                redirect: '/login.html' 
            });
        }
        
        // Для обычных страниц перенаправляем на login (исключая Google auth роуты)
        if (!req.url.includes('login') && 
            !req.url.includes('register') && 
            !req.url.includes('auth.js') && 
            !req.url.includes('style.css') &&
            !req.url.startsWith('/auth/google')) {
            return res.redirect('/login.html');
        }
        
        req.userId = null;
        req.userSessionsDir = null;
    } else {
        userManager.updateLastActive(userId);
        req.userId = userId;
        req.userSessionsDir = userManager.getUserSessionsDir(userId);
    }
    
    next();
});




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

        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);

        if (!telegramClientAPI) {
            return res.json({ success: false, error: 'Нет активной Telegram сессии' });
        }
        // ДОБАВЬ эту строку:
        telegramClientAPI.userId = req.userId;

        const messages = await telegramClientAPI.searchMessages(keywords, groups, limit || 100);
        res.json({ success: true, messages, count: messages.length });

    } catch (error) {
        console.error('Ошибка поиска сообщений:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения информации о сессии для главной страницы
app.get('/api/session-info', async (req, res) => {
    try {
        // Получаем изолированный SessionManager пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        
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

// API для получения списка групп
app.get('/api/groups', async (req, res) => {
    try {
        // Получаем изолированный SessionManager пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        
        // Получаем активный клиент
        const activeClient = sessionManager.getActiveClient();
        console.log('Запрос групп, activeClient:', activeClient ? 'есть' : 'нет');
        
        if (!activeClient) {
            return res.json({ 
                success: false, 
                error: 'Нет активной Telegram сессии. Создайте сессию в разделе "Сессии".' 
            });
        }
        
        // Создаем telegramClientAPI для пользователя
        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);
        
        if (!telegramClientAPI) {
            return res.json({ 
                success: false, 
                error: 'Не удалось создать Telegram клиент' 
            });
        }
        
        const groups = await telegramClientAPI.getChats();
        res.json({ success: true, groups });
    } catch (error) {
        console.error('Ошибка получения групп:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка каналов
app.get('/api/channels', async (req, res) => {
    try {
        // Получаем изолированный SessionManager пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        
        // Получаем активный клиент
        const activeClient = sessionManager.getActiveClient();
        console.log('Запрос каналов, activeClient:', activeClient ? 'есть' : 'нет');
        
        if (!activeClient) {
            return res.json({ 
                success: false, 
                error: 'Нет активной Telegram сессии. Создайте сессию в разделе "Сессии".' 
            });
        }
        
        // Создаем telegramClientAPI для пользователя
        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);
        
        if (!telegramClientAPI) {
            return res.json({ 
                success: false, 
                error: 'Не удалось создать Telegram клиент' 
            });
        }
        
        const channels = await telegramClientAPI.getChannels();
        res.json({ success: true, channels });
    } catch (error) {
        console.error('Ошибка получения каналов:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для проверки live stream
app.post('/api/check-livestream', async (req, res) => {
    try {
        const { channelId } = req.body;
        
        if (!channelId) {
            return res.json({ 
                success: false, 
                error: 'Не указан ID канала' 
            });
        }
        
        // Получаем изолированный TelegramClientAPI пользователя
        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);
        
        if (!telegramClientAPI) {
            return res.json({ 
                success: false, 
                error: 'Нет активной Telegram сессии' 
            });
        }
        
        // ИСПРАВЬ установку userId - добавь проверку:
        if (req.userId) {
            telegramClientAPI.userId = req.userId;
        } else {
            console.error('req.userId is undefined');
            return res.json({ success: false, error: 'Пользователь не авторизован' });
        }
        
    const result = await telegramClientAPI.checkLiveStream(channelId, 'Выбранный канал');
    res.json({ 
        success: true, 
        isStreamActive: result.isLive,
        streamInfo: result.streamInfo,
        participants: result.participants || [],
        streamEnded: result.streamEnded
    });
    } catch (error) {
        console.error('Ошибка проверки стрима:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для AI анализа сообщений
app.post('/api/analyze', async (req, res) => {
    try {
        const { messages, prompt } = req.body;
        
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
        
        const aiAnalyzer = new AIAnalyzer();
        const analysisResult = await aiAnalyzer.analyzeMessages(messages, prompt);
        
        res.json({ 
            success: true, 
            analysis: analysisResult // Теперь это объект с filteredMessages и summary
        });
    } catch (error) {
        console.error('Ошибка AI анализа:', error);
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
        
        // Получаем изолированный BroadcastManager пользователя
        const broadcastManager = await userSessionManager.getUserBroadcastManager(req.userId, req.userSessionsDir);
        
        // Создаем задание
        const task = broadcastManager.createTask({
            message: message.trim(),
            groups: groups,
            startDateTime: startDateTime,
            frequency: frequency || 'once',
            isRandomBroadcast: isRandomBroadcast || false
        });
        
        // Планируем выполнение задания через UserSessionManager
        const executionCallback = (taskId) => {
            userSessionManager.executeBroadcastTask(req.userId, req.userSessionsDir, taskId);
        };
        broadcastManager.scheduleTask(task, executionCallback);
        
        res.json({ success: true, task: task });
    } catch (error) {
        console.error('Ошибка создания задания рассылки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка заданий рассылки
app.get('/api/broadcast-tasks', async (req, res) => {
    try {
        // Получаем изолированный BroadcastManager пользователя
        const broadcastManager = await userSessionManager.getUserBroadcastManager(req.userId, req.userSessionsDir);
        
        const tasks = broadcastManager.getAllTasks();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        console.error('Ошибка получения заданий:', error);
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/broadcast-tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        // Получаем broadcastManager через userSessionManager (как в других местах)
        const broadcastManager = await userSessionManager.getUserBroadcastManager(req.userId, req.userSessionsDir);
        
        if (!broadcastManager) {
            return res.json({ success: false, error: 'Менеджер рассылки не доступен' });
        }
        
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
      
     
        
        // Получаем изолированный SessionManager пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        
    
        const currentSession = sessionManager.getCurrentSession();
 
        
        if (currentSession) {
            res.json({ success: true, session: currentSession });
        } else {
            res.json({ success: false, error: 'Нет активной сессии' });
        }
    } catch (error) {
        console.error(`Ошибка получения сессии для ${req.userId}:`, error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка всех сессий
app.get('/api/sessions', async (req, res) => {
    try {
        // Получаем изолированный SessionManager пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        
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
        
        console.log(`Переключение на сессию: ${sessionId} для пользователя ${req.userId}`);
        
        // Получаем изолированные менеджеры пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        const autoSearchManager = await userSessionManager.getUserAutoSearchManager(req.userId, req.userSessionsDir);
        
        // Останавливаем автопоиск при переключении сессии
        autoSearchManager.stopAutoSearch(req.userId);
        console.log(`Остановлен автопоиск для пользователя ${req.userId}`);
        
        const result = await sessionManager.switchToSession(sessionId);
        
        if (result.success) {
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
        
        // Создаем SessionManager для текущего пользователя
        if (!sessionManager) {
            sessionManager = new SessionManager();
        }
        await sessionManager.setUserSessionsDir(req.userSessionsDir);
        
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

// API для получения информации о пользователе
app.get('/api/user-info', (req, res) => {
    try {
        if (!req.userId) {
            return res.json({ success: false, error: 'Не авторизован' });
        }
        
        const userInfo = userManager.getUserInfo(req.userId);
        res.json({ success: true, user: userInfo });
    } catch (error) {
        console.error('Ошибка получения информации о пользователе:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для создания заявки на подключение аккаунта
app.post('/api/create-request', (req, res) => {
    try {
        const { sessionName, phoneNumber } = req.body;
        
        if (!sessionName || !phoneNumber) {
            return res.json({ 
                success: false, 
                error: 'Введите название сессии и номер телефона' 
            });
        }
        
        const result = requestManager.createRequest(req.userId, sessionName, phoneNumber);
        res.json(result);
    } catch (error) {
        console.error('Ошибка создания заявки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения заявок пользователя
app.get('/api/my-requests', (req, res) => {
    try {
        const requests = requestManager.getUserRequests(req.userId);
        res.json({ success: true, requests });
    } catch (error) {
        console.error('Ошибка получения заявок:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для админки - получение всех заявок
app.get('/api/admin/requests', (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const requests = requestManager.getAllRequests();
        res.json({ success: true, requests });
    } catch (error) {
        console.error('Ошибка получения заявок для админа:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для обновления статуса заявки (только для админов)
app.post('/api/admin/update-request', (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { requestId, status, notes } = req.body;
        
        if (!requestId || !status) {
            return res.json({ 
                success: false, 
                error: 'Не указан ID заявки или статус' 
            });
        }
        
        const result = requestManager.updateRequestStatus(requestId, status, notes);
        res.json(result);
    } catch (error) {
        console.error('Ошибка обновления статуса заявки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для создания сессии по заявке (только для админов)
app.post('/api/admin/create-session', async (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { requestId, sessionName, phoneNumber, userId } = req.body;
        
        if (!requestId || !sessionName || !phoneNumber || !userId) {
            return res.json({ 
                success: false, 
                error: 'Не все данные указаны' 
            });
        }
        
        // Получаем папку сессий пользователя
        const userSessionsDir = userManager.getUserSessionsDir(userId);
        
        // Получаем изолированный SessionManager для пользователя заявки
        const targetUserSessionManager = await userSessionManager.getUserSessionManager(userId, userSessionsDir);
        
        // Создаем сессию для пользователя
        console.log(`Админ создает сессию для пользователя ${userId}: ${sessionName} (${phoneNumber})`);
        const result = await targetUserSessionManager.createSession(sessionName, phoneNumber);
        
        if (result.success) {
            // Обновляем статус заявки на "выполнена"
            requestManager.updateRequestStatus(requestId, 'completed', 'Сессия создана администратором');
        }
        
        res.json(result);
    } catch (error) {
        console.error('Ошибка создания сессии администратором:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для запуска автопоиска
app.post('/api/start-autosearch', async (req, res) => {
    try {
        const { keywords, groups } = req.body;
        
        if (!keywords || keywords.length === 0) {
            return res.json({ success: false, error: 'Добавьте ключевые слова' });
        }
        
        if (!groups || groups.length === 0) {
            return res.json({ success: false, error: 'Выберите группы' });
        }
        
        // Получаем изолированные менеджеры пользователя
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        const autoSearchManager = await userSessionManager.getUserAutoSearchManager(req.userId, req.userSessionsDir);
        
        const activeClient = sessionManager.getActiveClient();
        if (!activeClient) {
            return res.json({ success: false, error: 'Нет активной сессии' });
        }
        
        const currentSession = sessionManager.getCurrentSession();
        if (!currentSession) {
            return res.json({ success: false, error: 'Не удалось получить информацию о сессии' });
        }
        
        // Создаем telegramClientAPI для пользователя
        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);
        
        if (!telegramClientAPI) {
            return res.json({ success: false, error: 'Не удалось создать Telegram клиент' });
        }
        
        // Запускаем автопоиск (один на пользователя)
        const result = await autoSearchManager.startAutoSearch(
            req.userId,
            currentSession.id,
            currentSession.name,
            keywords,
            groups,
            telegramClientAPI
        );
        
        res.json(result);
    } catch (error) {
        console.error('Ошибка запуска автопоиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для остановки автопоиска
app.post('/api/stop-autosearch', async (req, res) => {
    try {
        // Получаем изолированный AutoSearchManager пользователя
        const autoSearchManager = await userSessionManager.getUserAutoSearchManager(req.userId, req.userSessionsDir);
        
        autoSearchManager.stopAutoSearch(req.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка остановки автопоиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения результатов автопоиска пользователя
app.get('/api/autosearch-results', async (req, res) => {
    try {
        // Получаем изолированный AutoSearchManager пользователя
        const autoSearchManager = await userSessionManager.getUserAutoSearchManager(req.userId, req.userSessionsDir);
        
        const results = autoSearchManager.getSearchResults(req.userId);
        res.json(results);
    } catch (error) {
        console.error('Ошибка получения результатов автопоиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения статуса автопоиска пользователя
app.get('/api/autosearch-status', async (req, res) => {
    try {
        // Получаем изолированный AutoSearchManager пользователя
        const autoSearchManager = await userSessionManager.getUserAutoSearchManager(req.userId, req.userSessionsDir);
        
        const search = autoSearchManager.getUserAutoSearch(req.userId);
        const searches = search ? [search] : [];
        res.json({ success: true, searches });
    } catch (error) {
        console.error('Ошибка получения статуса автопоиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для выхода пользователя
app.post('/api/logout', (req, res) => {
    try {
        // Очищаем cookie с userId
        res.clearCookie('userId');
        
        // Простая очистка без вызова проблемной функции
        console.log(`Пользователь ${req.userId} вышел из системы`);
        
        res.json({ success: true, message: 'Выход выполнен успешно' });
    } catch (error) {
        console.error('Ошибка выхода:', error);
        res.json({ success: false, error: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});