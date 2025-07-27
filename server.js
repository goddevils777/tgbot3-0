// В начале файла замени импорты:
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
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
const TelegramAuthManager = require('./src/telegramAuth');
const TelegramBotAuth = require('./src/telegramBot');
const APIMonitor = require('./src/apiMonitor');
const YouTubeParser = require('./src/youtubeParser');
const GroupsDatabase = require('./database/groupsDatabase');

// Инициализация базы данных групп
const groupsDB = new GroupsDatabase();

// Инициализация YouTube парсера
const youtubeParser = new YouTubeParser();



// Инициализация мониторинга
const apiMonitor = new APIMonitor();

// Замени инициализацию менеджеров:
const userManager = new UserManager();
const requestManager = new RequestManager();
const userSessionManager = new UserSessionManager(); // Главный менеджер изоляции


// Система управления активными Telegram операциями
const activeTelegramOperations = new Map(); // userId -> { type, startTime }

// Функции управления операциями
function setActiveTelegramOperation(userId, operationType) {
    activeTelegramOperations.set(userId, {
        type: operationType,
        startTime: new Date().toISOString()
    });
    console.log(`Операция ${operationType} запущена для пользователя ${userId}`);
}

function clearActiveTelegramOperation(userId) {
    const operation = activeTelegramOperations.get(userId);
    if (operation) {
        console.log(`Операция ${operation.type} завершена для пользователя ${userId}`);
        activeTelegramOperations.delete(userId);
    }
}

function getActiveOperation(userId) {
    return activeTelegramOperations.get(userId);
}

async function checkAllActiveOperations(userId) {
    // Проверяем системные операции
    const systemOperation = activeTelegramOperations.get(userId);
    if (systemOperation) {
        return { isActive: true, type: systemOperation.type };
    }
    
    // Проверяем автопоиск
    try {
        const autoSearchManager = await userSessionManager.getUserAutoSearchManager(userId, userManager.getUserSessionsDir(userId));
        const autoSearch = autoSearchManager.getUserAutoSearch(userId);
        if (autoSearch && autoSearch.isActive) {
            return { isActive: true, type: 'autosearch' };
        }
    } catch (error) {
        console.error('Ошибка проверки автопоиска:', error);
    }
    
    return { isActive: false, type: null };
}




const app = express();

const http = require('http');
const { Server } = require('socket.io');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Создаем HTTP сервер и WebSocket
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Обработка WebSocket соединений
io.on('connection', (socket) => {
    console.log('Клиент подключился:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Клиент отключился:', socket.id);
    });
});

// Функция отправки прогресса конкретному пользователю
// Функция отправки прогресса конкретному пользователю
function sendProgressToUser(userId, data) {
    console.log(`Отправляем прогресс пользователю ${userId}:`, data.type, data.message); // ДОБАВЬ
    io.emit(`progress_${userId}`, data);
}

// Функция отправки flood wait уведомления
function sendFloodWaitToUser(userId, seconds) {
    io.emit(`flood_wait_${userId}`, { seconds });
}

const PORT = 3000;

// Инициализация Telegram авторизации
const telegramAuthManager = new TelegramAuthManager(userManager);
// const telegramBot = new TelegramBotAuth(telegramAuthManager);

// Инициализация Google авторизации
const googleAuthManager = new GoogleAuthManager(userManager);
const googleAuthRoutes = new GoogleAuthRoutes(userManager, googleAuthManager);

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


// Подключение Google роутов
app.use(googleAuthRoutes.getRouter());

app.use(express.json());
app.use(express.static('public'));
app.use('/src', express.static('src'));


// Middleware для мониторинга API
app.use((req, res, next) => {
    const startTime = Date.now();
    
    // Перехватываем оригинальный res.json
    const originalJson = res.json;
    res.json = function(data) {
        const responseTime = Date.now() - startTime;
        const userId = req.userId || 'anonymous';
        
        // Логируем запрос
        apiMonitor.logRequest(req.method, req.url, userId, responseTime, res.statusCode);
        
        // Вызываем оригинальный метод
        return originalJson.call(this, data);
    };
    
    next();
});



// Middleware для проверки пользователя (обновленный с Google OAuth и Telegram)
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
    
    // Затем проверяем обычную авторизацию или Telegram через cookie
    const cookies = req.headers.cookie;
    if (cookies) {
        const userIdCookie = cookies.split(';').find(cookie => cookie.trim().startsWith('userId='));
        if (userIdCookie) {
            userId = userIdCookie.split('=')[1].trim();
        }
    }
    
    // Проверяем есть ли userId и существует ли пользователь
    if (!userId || !userManager.userExists(userId)) {
        // Если нет авторизации - возвращаем ошибку для API
        if (req.url.startsWith('/api/') && 
            req.url !== '/api/register' && 
            req.url !== '/api/login' &&
            req.url !== '/api/google-user' &&
            req.url !== '/api/telegram-user' &&
            req.url !== '/api/telegram-auth-init' &&
            !req.url.startsWith('/api/telegram-auth-status/')) {
            return res.json({ 
                success: false, 
                error: 'Необходима авторизация', 
                redirect: '/login.html' 
            });
        }
        
        // Для обычных страниц перенаправляем на login (исключая auth роуты)
        if (!req.url.startsWith('/api/') && 
            !req.url.startsWith('/auth/') &&
            req.url !== '/login.html' && 
            req.url !== '/register.html' &&
            !req.url.includes('.css') && 
            !req.url.includes('.js') && 
            !req.url.includes('.ico')) {
            return res.redirect('/login.html');
        }
    } else {
        // Пользователь авторизован
        req.userId = userId;
        req.userSessionsDir = userManager.getUserSessionsDir(userId);
        userManager.updateLastActive(userId);
        console.log('Пользователь авторизован:', userId);
    }
    
    next();
});




// Инициализируем телеграм клиент ПОСЛЕ автоподключения
setTimeout(async () => {
    console.log('Telegram Client API готов к работе');
}, 2000); // Даем 2 секунды на автоподключение

app.post('/api/search', async (req, res) => {
    try {
        // Проверяем активные операции
        const activeOp = await checkAllActiveOperations(req.userId);
        if (activeOp.isActive) {
            return res.json({ 
                success: false, 
                error: `Операция "${activeOp.type}" уже выполняется. Дождитесь завершения.` 
            });
        }
        
        // Устанавливаем активную операцию
        setActiveTelegramOperation(req.userId, 'search');
        
        const { keywords, groups, limit } = req.body;

        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ success: false, error: 'Добавьте ключевые слова для поиска' });
        }

        if (!groups || !Array.isArray(groups) || groups.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ success: false, error: 'Выберите группы для поиска' });
        }

        // Отправляем начальный прогресс
        sendProgressToUser(req.userId, {
            type: 'start',
            message: 'Подключение к Telegram...',
            progress: 0,
            totalGroups: groups.length,
            processedGroups: 0
        });

        // Получаем изолированный TelegramClientAPI пользователя
        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);

        if (!telegramClientAPI) {
            clearActiveTelegramOperation(req.userId);
            sendProgressToUser(req.userId, { type: 'error', message: 'Нет активной Telegram сессии' });
            return res.json({ success: false, error: 'Нет активной Telegram сессии' });
        }
        
        telegramClientAPI.userId = req.userId;

        // НЕ ЖДЁМ завершения - запускаем асинхронно
        searchMessagesWithProgress(telegramClientAPI, keywords, groups, limit, req.userId);
        
        // Сразу отвечаем что поиск запущен
        res.json({ success: true, message: 'Поиск запущен', status: 'started' });

    } catch (error) {
        clearActiveTelegramOperation(req.userId);
        sendProgressToUser(req.userId, { type: 'error', message: error.message });
        console.error('Ошибка поиска сообщений:', error);
        res.json({ success: false, error: error.message });
    }
});


// В searchMessagesWithProgress замени на:
async function searchMessagesWithProgress(telegramClientAPI, keywords, groups, limit, userId) {
    try {
        const messages = await telegramClientAPI.searchMessages(keywords, groups, limit || 100, (progressData) => {
            sendProgressToUser(userId, progressData);
        });
        
        // Отправляем результаты
        sendProgressToUser(userId, {
            type: 'complete',
            message: `Поиск завершён! Найдено ${messages.length} сообщений`,
            progress: 100,
            results: messages
        });
        
        clearActiveTelegramOperation(userId);
        
    } catch (error) {
        sendProgressToUser(userId, { type: 'error', message: error.message });
        clearActiveTelegramOperation(userId);
    }
}

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
        const sessionManager = await userSessionManager.getUserSessionManager(req.userId, req.userSessionsDir);
        const activeClient = sessionManager.getActiveClient();
        
        if (!activeClient) {
            return res.json({ 
                success: false, 
                error: 'Нет активной Telegram сессии. Создайте сессию в разделе "Сессии".' 
            });
        }
        
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
        
        // Обработка ошибки истечения сессии
        if (error.message === 'TELEGRAM_SESSION_EXPIRED') {
            return res.json({ 
                success: false, 
                error: 'TELEGRAM_SESSION_EXPIRED',
                message: 'Telegram разлогинил ваш аккаунт. Необходимо пересоздать сессию.' 
            });
        }
        
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
// API для проверки валидности Telegram ссылки
app.post('/api/check-telegram-link', async (req, res) => {
    try {
        const { link } = req.body;
        
        if (!link) {
            return res.json({ valid: false, error: 'Ссылка не указана' });
        }
        
        // Для invite-ссылок (начинающихся с +) делаем более детальную проверку
        if (link.includes('/+')) {
            try {
                const https = require('https');
                
                const checkUrl = link.startsWith('https://') ? link : `https://${link}`;
                
                const response = await new Promise((resolve, reject) => {
                    const req = https.request(checkUrl, {
                        method: 'GET',
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    }, (response) => {
                        let data = '';
                        response.on('data', chunk => data += chunk);
                        response.on('end', () => resolve({ statusCode: response.statusCode, data }));
                    });
                    
                    req.on('error', reject);
                    req.on('timeout', () => reject(new Error('Timeout')));
                    req.setTimeout(10000);
                    req.end();
                });
                
                // Проверяем содержимое ответа на наличие признаков валидной группы
                const isValid = response.statusCode === 200 && 
                               !response.data.includes('This invite link is expired') &&
                               !response.data.includes('Эта ссылка-приглашение недействительна') &&
                               !response.data.includes('приглашение истекло') &&
                               (response.data.includes('tgme_page_title') || 
                                response.data.includes('Join ') ||
                                response.data.includes('Присоединиться'));
                
                res.json({ 
                    valid: isValid,
                    link: link,
                    checkedAt: new Date().toISOString(),
                    type: 'invite'
                });
                
            } catch (error) {
                res.json({ 
                    valid: false, 
                    error: 'Ошибка проверки invite-ссылки',
                    link: link,
                    type: 'invite'
                });
            }
        } else {
            // Для обычных публичных каналов - простая проверка
            const https = require('https');
            const checkUrl = link.startsWith('https://') ? link : `https://${link}`;
            
            const isValid = await new Promise((resolve) => {
                const req = https.request(checkUrl, {
                    method: 'HEAD',
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }, (response) => {
                    resolve([200, 302, 301].includes(response.statusCode));
                });
                
                req.on('error', () => resolve(false));
                req.on('timeout', () => resolve(false));
                req.setTimeout(5000);
                req.end();
            });
            
            res.json({ 
                valid: isValid,
                link: link,
                checkedAt: new Date().toISOString(),
                type: 'public'
            });
        }
        
    } catch (error) {
        console.error('Ошибка проверки ссылки:', error);
        res.json({ 
            valid: false, 
            error: 'Ошибка проверки',
            link: req.body.link
        });
    }
});
// API для пакетного AI анализа
app.post('/api/analyze', async (req, res) => {
    try {
        let { messages, prompt, batchSize = 300, batchIndex = 0 } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.json({ 
                success: false, 
                error: 'Сообщения не найдены' 
            });
        }
        
        if (!prompt || prompt.trim().length === 0) {
            return res.json({ 
                success: false, 
                error: 'Введите промпт для анализа' 
            });
        }
        
        // Рассчитываем пакеты
        const totalMessages = messages.length;
        const totalBatches = Math.ceil(totalMessages / batchSize);
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, totalMessages);
        const currentBatch = messages.slice(startIndex, endIndex);
        
        console.log(`AI анализ пакета ${batchIndex + 1}/${totalBatches}: сообщения ${startIndex + 1}-${endIndex} из ${totalMessages}`);
        
        // Добавляем задержку между запросами для избежания лимитов
        if (batchIndex > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды между пакетами
        }
        
        try {
            const aiAnalyzer = new AIAnalyzer();
            const analysisResult = await aiAnalyzer.analyzeMessages(currentBatch, prompt);
            
            res.json({ 
                success: true, 
                analysis: analysisResult,
                batchInfo: {
                    currentBatch: batchIndex + 1,
                    totalBatches: totalBatches,
                    processedCount: endIndex,
                    totalCount: totalMessages,
                    hasMore: batchIndex + 1 < totalBatches
                }
            });
            
        } catch (aiError) {
            // Если лимит квоты - возвращаем информацию об ошибке
            if (aiError.message.includes('429') || aiError.message.includes('quota')) {
                res.json({ 
                    success: false, 
                    error: 'Превышен лимит запросов к AI. Попробуйте через несколько минут.',
                    retryAfter: 300, // 5 минут
                    batchInfo: {
                        currentBatch: batchIndex + 1,
                        totalBatches: totalBatches,
                        processedCount: startIndex,
                        totalCount: totalMessages,
                        hasMore: true
                    }
                });
            } else {
                throw aiError;
            }
        }
        
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
        // Проверяем активные операции
        const activeOp = await checkAllActiveOperations(req.userId);
        if (activeOp.isActive) {
            return res.json({ 
                success: false, 
                error: `Операция "${activeOp.type}" уже выполняется. Дождитесь завершения.` 
            });
        }
        
        // Устанавливаем активную операцию
        setActiveTelegramOperation(req.userId, 'broadcast');
        
        const { messages, groups, startDateTime, frequency, isRandomBroadcast } = req.body;
        
        // Валидация
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Введите хотя бы один вариант сообщения' 
            });
        }
        
        if (!groups || groups.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Выберите хотя бы одну группу' 
            });
        }
        
        if (!startDateTime) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Укажите дату и время начала' 
            });
        }
        
        // Проверяем, что время в будущем
        const scheduledTime = new Date(startDateTime);
        if (scheduledTime <= new Date()) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Время начала должно быть в будущем' 
            });
        }
        
        // Получаем изолированный BroadcastManager пользователя
        const broadcastManager = await userSessionManager.getUserBroadcastManager(req.userId, req.userSessionsDir);
        
        // Создаем задание
        const task = broadcastManager.createTask({
            messages: messages,
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
        
        // Очищаем операцию и возвращаем результат
        clearActiveTelegramOperation(req.userId);
        res.json({ success: true, task: task });
        
    } catch (error) {
        clearActiveTelegramOperation(req.userId);
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
            res.setHeader('Set-Cookie', `userId=${result.userId}; Path=/; Max-Age=31536000`);
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

// API для создания заявки на подключение аккаунта (с автозаменой)
app.post('/api/create-request', (req, res) => {
    try {
        const { sessionName, phoneNumber } = req.body;
        
        if (!sessionName || !phoneNumber) {
            return res.json({ 
                success: false, 
                error: 'Введите название сессии и номер телефона' 
            });
        }
        
        // Проверяем есть ли активная заявка от этого пользователя
        const existingRequests = requestManager.getUserRequests(req.userId);
        
        if (existingRequests.length > 0) {
            console.log(`Найдены существующие заявки для пользователя ${req.userId}, удаляем их`);
            
            // Удаляем все старые заявки пользователя
            existingRequests.forEach(request => {
                console.log(`Удаляем старую заявку: ${request.id}`);
                requestManager.deleteRequest(request.id);
            });
            
            // Очищаем старые сессии пользователя
            console.log(`Очищаем старые сессии для пользователя ${req.userId}`);
            const userSessionsPath = path.join('./users', req.userId, 'sessions');
            if (fs.existsSync(userSessionsPath)) {
                const sessionFiles = fs.readdirSync(userSessionsPath);
                sessionFiles.forEach(file => {
                    if (file.endsWith('.session')) {
                        fs.unlinkSync(path.join(userSessionsPath, file));
                        console.log(`Удален файл сессии: ${file}`);
                    }
                });
            }
        }
        
        // Создаем новую заявку
        const result = requestManager.createRequest(req.userId, sessionName, phoneNumber);
        
        if (result.success) {
            console.log(`Создана новая заявка для пользователя ${req.userId}: ${result.requestId}`);
            res.json({ 
                success: true, 
                requestId: result.requestId,
                message: existingRequests.length > 0 ? 
                    'Старая заявка заменена новой. Ожидайте обработки.' : 
                    'Заявка создана. Ожидайте обработки.'
            });
        } else {
            res.json({ success: false, error: result.error });
        }
        
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

// API для удаления заявки администратором
app.delete('/api/admin/delete-request/:requestId', async (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { requestId } = req.params;
        
        // Получаем информацию о заявке
        const request = requestManager.getRequest(requestId);
        if (!request) {
            return res.json({ success: false, error: 'Заявка не найдена' });
        }
        
        // Удаляем файлы сессий пользователя если они были созданы
        if (request.status === 'completed') {
            const targetUserId = request.userId;
            const userSessionsDir = userManager.getUserSessionsDir(targetUserId);
            
            // Получаем SessionManager пользователя
            const targetUserSessionManager = await userSessionManager.getUserSessionManager(targetUserId, userSessionsDir);
            
            // Удаляем все сессии пользователя
            const sessions = targetUserSessionManager.getAllSessions();
            for (const session of sessions) {
                await targetUserSessionManager.deleteSession(session.id);
            }
            
            console.log(`Удалены сессии пользователя ${targetUserId} при удалении заявки ${requestId}`);
        }
        
        // Удаляем саму заявку
        const deleteResult = requestManager.deleteRequest(requestId);
        
        if (deleteResult.success) {
            res.json({ success: true, message: 'Заявка и связанные сессии удалены' });
        } else {
            res.json({ success: false, error: deleteResult.error });
        }
        
    } catch (error) {
        console.error('Ошибка удаления заявки администратором:', error);
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


// API для получения списка всех пользователей (только для админов)
app.get('/api/admin/users', (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const users = userManager.getAllUsers();
        res.json({ success: true, users });
    } catch (error) {
        console.error('Ошибка получения списка пользователей:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для блокировки/разблокировки пользователя (только для админов)
app.post('/api/admin/toggle-user', (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { userId, action } = req.body; // action: 'block' или 'unblock'
        
        if (!userId || !action) {
            return res.json({ 
                success: false, 
                error: 'Не указан ID пользователя или действие' 
            });
        }
        
        const result = userManager.toggleUserStatus(userId, action);
        res.json(result);
    } catch (error) {
        console.error('Ошибка изменения статуса пользователя:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для удаления пользователя (только для админов)
app.delete('/api/admin/delete-user/:userId', async (req, res) => {
    try {
        // Проверяем админские права
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { userId } = req.params;
        
        // Проверяем что не удаляем самого себя
        if (userId === req.userId) {
            return res.json({ success: false, error: 'Нельзя удалить самого себя' });
        }
        
        // Удаляем пользователя
        const result = userManager.deleteUser(userId);
        
        if (result.success) {
            res.json({ success: true, message: 'Пользователь успешно удален' });
        } else {
            res.json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для экспорта конкретной заявки с данными пользователя (только для админа)
app.get('/api/admin/export-request/:requestId', (req, res) => {
    try {
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { requestId } = req.params;
        
        // Получаем заявку
        const request = requestManager.getRequest(requestId);
        if (!request) {
            return res.json({ success: false, error: 'Заявка не найдена' });
        }
        
        // Получаем данные пользователя
        const user = userManager.getUserById(request.userId);
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        res.json({
            success: true,
            request: request,
            user: user,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Ошибка экспорта заявки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для импорта заявки с пользователем (только для админа)
app.post('/api/admin/import-request-with-user', (req, res) => {
    try {
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { request, user } = req.body;
        
        if (!request || !user) {
            return res.json({ success: false, error: 'Неверный формат данных' });
        }
        
        // Импортируем пользователя
        const userResult = userManager.importUser(user);
        
        // Импортируем заявку
        const requestResult = requestManager.importRequest(request);
        
        if (userResult.success && requestResult.success) {
            res.json({ 
                success: true, 
                message: `Импортированы: заявка ${request.id} и пользователь ${user.login}`
            });
        } else {
            res.json({ 
                success: false, 
                error: `Ошибки: ${userResult.error || ''} ${requestResult.error || ''}`
            });
        }
        
    } catch (error) {
        console.error('Ошибка импорта:', error);
        res.json({ success: false, error: error.message });
    }
});


// API для отправки конкретной заявки в GitHub (только для админа)
app.post('/api/admin/push-to-github/:requestId', async (req, res) => {
    try {
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const { requestId } = req.params;
        const { commitMessage } = req.body;
        
        // Получаем данные заявки
        const request = requestManager.getRequest(requestId);
        if (!request) {
            return res.json({ success: false, error: 'Заявка не найдена' });
        }
        
        // Получаем данные пользователя
        const user = userManager.getUserById(request.userId);
        if (!user) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }
        
        // Выполняем Git команды для конкретных файлов
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        try {
            // Добавляем только конкретные файлы
            const filesToAdd = [
                `requests/${requestId}.json`,
                `users/users.json`,
                `users/${request.userId}/`,
            ];
            
            // Добавляем каждый файл/папку отдельно
            for (const file of filesToAdd) {
                try {
                    await execAsync(`git add "${file}"`);
                } catch (e) {
                    console.log(`Файл ${file} не найден или уже добавлен`);
                }
            }
            
            // Делаем commit
            const message = commitMessage || `Добавлена заявка ${requestId} пользователя ${user.login}`;
            await execAsync(`git commit -m "${message}"`);
            
            // Отправляем в GitHub
            await execAsync('git push origin main');
            
            res.json({ 
                success: true, 
                message: `Заявка ${requestId} отправлена в GitHub` 
            });
            
        } catch (gitError) {
            console.error('Ошибка Git:', gitError);
            res.json({ 
                success: false, 
                error: `Ошибка Git: ${gitError.message}` 
            });
        }
        
    } catch (error) {
        console.error('Ошибка отправки в GitHub:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения статистики API (только для админов)
app.get('/api/admin/api-stats', (req, res) => {
    try {
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        const stats = apiMonitor.getStats();
        const topEndpoints = apiMonitor.getTopEndpoints(15);
        
        res.json({ 
            success: true, 
            stats,
            topEndpoints,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения статистики API:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для сброса статистики API (только для админов)
app.post('/api/admin/reset-api-stats', (req, res) => {
    try {
        if (!requestManager.isAdminByUserId(req.userId, userManager)) {
            return res.json({ success: false, error: 'Нет доступа' });
        }
        
        apiMonitor.apiStats.clear();
        
        res.json({ 
            success: true, 
            message: 'Статистика API сброшена' 
        });
    } catch (error) {
        console.error('Ошибка сброса статистики API:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для проверки прав администратора
app.get('/api/admin/check-rights', (req, res) => {
    try {
        const isAdmin = requestManager.isAdminByUserId(req.userId, userManager);
        
        res.json({ 
            success: true, 
            isAdmin: isAdmin,
            userId: req.userId 
        });
    } catch (error) {
        console.error('Ошибка проверки прав:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для проверки всех активных Telegram операций
app.get('/api/telegram-status', async (req, res) => {
    try {
        const status = await checkAllActiveOperations(req.userId);
        res.json({ 
            success: true,
            hasActiveOperation: status.isActive,
            operationType: status.type
        });
    } catch (error) {
        console.error('Ошибка проверки статуса операций:', error);
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
        const isActive = search ? search.isActive : false;
        const searches = search ? [search] : [];
        
        res.json({ 
            success: true, 
            isActive: isActive,
            searches: searches,
            userId: req.userId 
        });
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

// API для инициации Telegram авторизации
app.post('/api/telegram-auth-init', (req, res) => {
    try {
        const tempUserId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const { authUrl, authToken } = telegramAuthManager.generateAuthLink(tempUserId);
        
        res.json({ 
            success: true, 
            authUrl, 
            authToken,
            message: 'Перейдите по ссылке и нажмите /start в Telegram боте' 
        });
    } catch (error) {
        console.error('Ошибка инициации Telegram авторизации:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для проверки статуса Telegram авторизации
app.get('/api/telegram-auth-status/:authToken', (req, res) => {
    try {
        const { authToken } = req.params;
        
        // Сначала проверяем успешную авторизацию
        const authResult = telegramAuthManager.getAuthResult(authToken);
        if (authResult.success) {
            // Устанавливаем cookie с userId
            res.cookie('userId', authResult.userId, { 
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
                httpOnly: false 
            });
            
            return res.json({ 
                success: true, 
                completed: true, 
                message: 'Авторизация завершена успешно' 
            });
        }
        
        // Если нет успешной авторизации, проверяем статус ожидания
        const result = telegramAuthManager.checkAuthStatus(authToken);
        res.json(result);
    } catch (error) {
        console.error('Ошибка проверки статуса авторизации:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения пользователя после Telegram авторизации  
app.get('/api/telegram-user', (req, res) => {
    try {
        // Проверяем Telegram авторизацию через userId в cookie
        const cookies = req.headers.cookie;
        let userId = null;
        
        if (cookies) {
            const userIdCookie = cookies.split(';').find(cookie => cookie.trim().startsWith('userId='));
            if (userIdCookie) {
                userId = userIdCookie.split('=')[1];
            }
        }
        
        if (!userId) {
            return res.json({ success: false, error: 'Не авторизован' });
        }
        
        const user = userManager.getUserById(userId);
        if (user && user.provider === 'telegram') {
            res.json({ 
                success: true, 
                user: {
                    id: user.id,
                    login: user.login,
                    name: user.name,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    provider: user.provider
                }
            });
        } else {
            res.json({ success: false, error: 'Telegram пользователь не найден' });
        }
    } catch (error) {
        console.error('Ошибка получения Telegram пользователя:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для создания рассылки в личные сообщения
app.post('/api/create-direct-broadcast', async (req, res) => {
    try {
        // Проверяем активные операции
        const activeOp = await checkAllActiveOperations(req.userId);
        if (activeOp.isActive) {
            return res.json({ 
                success: false, 
                error: `Операция "${activeOp.type}" уже выполняется. Дождитесь завершения.` 
            });
        }
        
        // Устанавливаем активную операцию
        setActiveTelegramOperation(req.userId, 'direct-broadcast');
        
        const { messages, participants, startDateTime, dailyLimit } = req.body;
        
        // Валидация
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Введите хотя бы один вариант сообщения' 
            });
        }
        
        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Добавьте хотя бы одного участника' 
            });
        }
        
        if (!startDateTime) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Укажите дату и время начала' 
            });
        }
        
        if (!dailyLimit || dailyLimit < 1 || dailyLimit > 15) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Лимит сообщений должен быть от 1 до 15' 
            });
        }
        
        // Проверяем, что время в будущем
        const scheduledTime = new Date(startDateTime);
        if (scheduledTime <= new Date()) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Время начала должно быть в будущем' 
            });
        }
        
        // Получаем изолированный DirectBroadcastManager пользователя
        const directBroadcastManager = await userSessionManager.getUserDirectBroadcastManager(req.userId, req.userSessionsDir);
        
        // Создаем задание
        const task = directBroadcastManager.createTask({
            messages: messages,
            participants: participants,
            startDateTime: startDateTime,
            dailyLimit: dailyLimit
        });
        
        // Планируем выполнение задания
        const executionCallback = (taskId) => {
            userSessionManager.executeDirectBroadcastTask(req.userId, req.userSessionsDir, taskId);
        };
        directBroadcastManager.scheduleTask(task, executionCallback);
        
        // Очищаем операцию и возвращаем результат
        clearActiveTelegramOperation(req.userId);
        res.json({ success: true, task: task });
        
    } catch (error) {
        clearActiveTelegramOperation(req.userId);
        console.error('Ошибка создания рассылки в личные сообщения:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка рассылок в личные сообщения
app.get('/api/direct-broadcast-tasks', async (req, res) => {
    try {
        const directBroadcastManager = await userSessionManager.getUserDirectBroadcastManager(req.userId, req.userSessionsDir);
        
        const tasks = directBroadcastManager.getAllTasks();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        console.error('Ошибка получения рассылок:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для удаления рассылки в личные сообщения
app.delete('/api/direct-broadcast-tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const directBroadcastManager = await userSessionManager.getUserDirectBroadcastManager(req.userId, req.userSessionsDir);
        
        const deleted = directBroadcastManager.deleteTask(taskId);
        
        if (deleted) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Рассылка не найдена' });
        }
    } catch (error) {
        console.error('Ошибка удаления рассылки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения деталей рассылки
app.get('/api/direct-broadcast-details/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const directBroadcastManager = await userSessionManager.getUserDirectBroadcastManager(req.userId, req.userSessionsDir);
        
        const details = directBroadcastManager.getTaskDetails(taskId);
        
        if (details) {
            res.json({ success: true, details: details });
        } else {
            res.json({ success: false, error: 'Рассылка не найдена' });
        }
    } catch (error) {
        console.error('Ошибка получения деталей рассылки:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для запуска AI Chat Sniper
app.post('/api/start-ai-sniper', async (req, res) => {
    try {
        const { mainPrompt, communicationStyle, chats, schedule } = req.body;
        
        // Валидация
        if (!mainPrompt || mainPrompt.trim().length === 0) {
            return res.json({ 
                success: false, 
                error: 'Введите основной промпт' 
            });
        }
        
        if (!chats || chats.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Выберите хотя бы один чат для мониторинга' 
            });
        }
        
        // Получаем AI Sniper Manager пользователя
        const aiSniperManager = await userSessionManager.getUserAiSniperManager(req.userId, req.userSessionsDir);
        
        // Создаем Telegram клиент для мониторинга
        const telegramClientAPI = await userSessionManager.createUserTelegramClientAPI(req.userId, req.userSessionsDir);
        
        if (!telegramClientAPI) {
            return res.json({ 
                success: false, 
                error: 'Нет активной Telegram сессии' 
            });
        }
        
        // Запускаем AI Sniper
        const result = await aiSniperManager.startSniper(req.userId, {
            mainPrompt: mainPrompt.trim(),
            communicationStyle: communicationStyle,
            chats: chats,
            schedule: schedule
        }, telegramClientAPI);
        
        res.json(result);
        
    } catch (error) {
        console.error('Ошибка запуска AI Sniper:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для остановки AI Chat Sniper
app.post('/api/stop-ai-sniper', async (req, res) => {
    try {
        const aiSniperManager = await userSessionManager.getUserAiSniperManager(req.userId, req.userSessionsDir);
        
        const result = await aiSniperManager.stopSniper(req.userId);
        res.json(result);
        
    } catch (error) {
        console.error('Ошибка остановки AI Sniper:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения статистики AI Sniper
app.get('/api/ai-sniper-stats', async (req, res) => {
    try {
        const aiSniperManager = await userSessionManager.getUserAiSniperManager(req.userId, req.userSessionsDir);
        
        const stats = aiSniperManager.getStats(req.userId);
        res.json({ success: true, stats: stats });
        
    } catch (error) {
        console.error('Ошибка получения статистики AI Sniper:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для тестирования промпта
app.post('/api/test-ai-prompt', async (req, res) => {
    try {
        const { prompt, style } = req.body;
        
        if (!prompt || prompt.trim().length === 0) {
            return res.json({ 
                success: false, 
                error: 'Введите промпт для тестирования' 
            });
        }
        
        const aiSniperManager = await userSessionManager.getUserAiSniperManager(req.userId, req.userSessionsDir);
        
        const result = await aiSniperManager.testPrompt(prompt.trim(), style || 'friendly');
        res.json(result);
        
    } catch (error) {
        console.error('Ошибка тестирования промпта:', error);
        res.json({ success: false, error: error.message });
    }
});



// API для поиска видео на YouTube
app.post('/api/youtube-search', async (req, res) => {
    // Отключаем кеширование
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    try {
        const { keyword, maxResults, publishedAfter, publishedBefore } = req.body;
        
        if (!keyword || keyword.trim().length === 0) {
            return res.json({ 
                success: false, 
                error: 'Введите ключевое слово для поиска' 
            });
        }

        if (!process.env.YOUTUBE_API_KEY) {
            return res.json({ 
                success: false, 
                error: 'YouTube API ключ не настроен' 
            });
        }

        console.log(`YouTube поиск: "${keyword}"`);
        
        const videos = await youtubeParser.searchVideos(keyword, maxResults, {
            publishedAfter,
            publishedBefore
        });
        const telegramLinks = youtubeParser.extractTelegramLinks(videos);
        
        res.json({ 
            success: true, 
            videos: videos,
            telegramLinks: telegramLinks,
            videosCount: videos.length,
            linksCount: telegramLinks.length
        });

    } catch (error) {
        console.error('Ошибка YouTube поиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения деталей видео
app.get('/api/youtube-video/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        
        const videoDetails = await youtubeParser.getVideoDetails(videoId);
        
        if (!videoDetails) {
            return res.json({ 
                success: false, 
                error: 'Видео не найдено' 
            });
        }

        // Извлекаем ссылки из детального описания
        const telegramLinks = youtubeParser.extractTelegramLinks([videoDetails]);
        
        res.json({ 
            success: true, 
            video: videoDetails,
            telegramLinks: telegramLinks
        });

    } catch (error) {
        console.error('Ошибка получения видео:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для сохранения найденных групп в базу
app.post('/api/save-groups', (req, res) => {
    try {
        const { groups, source } = req.body;
        
        if (!groups || !Array.isArray(groups)) {
            return res.json({ success: false, error: 'Неверный формат данных' });
        }
        
        const results = {
            saved: 0,
            skipped: 0,
            errors: 0
        };
        
        groups.forEach(groupData => {
            const result = groupsDB.addGroup({
                ...groupData,
                source: source || 'youtube',
                userId: req.userId
            });
            
            if (result.success) {
                results.saved++;
            } else if (result.reason === 'exists') {
                results.skipped++;
            } else {
                results.errors++;
            }
        });
        
        res.json({ 
            success: true, 
            results,
            message: `Сохранено: ${results.saved}, пропущено: ${results.skipped}, ошибок: ${results.errors}`
        });
        
    } catch (error) {
        console.error('Ошибка сохранения групп:', error);
        res.json({ success: false, error: error.message });
    }
});


// API для поиска групп в базе
app.post('/api/search-groups', (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword) {
            return res.json({ success: false, error: 'Не указано ключевое слово' });
        }
        
        const groups = groupsDB.searchGroups(keyword);
        res.json({ 
            success: true, 
            groups: groups,
            total: groups.length,
            keyword: keyword
        });
    } catch (error) {
        console.error('Ошибка поиска групп:', error);
        res.json({ success: false, error: error.message });
    }
});





// API для анализа найденных Telegram ссылок
app.post('/api/analyze-telegram-links', async (req, res) => {
    try {
        const { links } = req.body;
        
        if (!links || !Array.isArray(links)) {
            return res.json({ 
                success: false, 
                error: 'Неверный формат ссылок' 
            });
        }

        // Группируем ссылки по типам
        const analysis = {
            inviteLinks: links.filter(link => link.isInviteLink),
            publicChannels: links.filter(link => !link.isInviteLink && !link.identifier.includes('+')),
            totalLinks: links.length,
            uniqueChannels: [...new Set(links.map(link => link.identifier))].length
        };

        res.json({ 
            success: true, 
            analysis: analysis
        });

    } catch (error) {
        console.error('Ошибка анализа ссылок:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для проверки валидности Telegram ссылки
app.post('/api/check-telegram-link', async (req, res) => {
    try {
        const { link } = req.body;
        
        if (!link) {
            return res.json({ valid: false, error: 'Ссылка не указана' });
        }
        
        // Простая проверка через HTTP запрос
        const https = require('https');
        const http = require('http');
        
        const checkUrl = link.startsWith('https://') ? link : `https://${link}`;
        
        const options = {
            method: 'HEAD',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        
        const protocol = checkUrl.startsWith('https://') ? https : http;
        
        const isValid = await new Promise((resolve) => {
            const req = protocol.request(checkUrl, options, (response) => {
                // Telegram может отвечать разными кодами для валидных ссылок
                const validCodes = [200, 302, 301, 404]; // 404 может быть для приватных групп
                resolve(validCodes.includes(response.statusCode));
            });
            
            req.on('error', () => resolve(false));
            req.on('timeout', () => resolve(false));
            req.setTimeout(5000);
            req.end();
        });
        
        res.json({ 
            valid: isValid,
            link: link,
            checkedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Ошибка проверки ссылки:', error);
        res.json({ 
            valid: false, 
            error: 'Ошибка проверки',
            link: req.body.link
        });
    }
});

// API для создания задания автоудаления
app.post('/api/create-auto-delete-task', async (req, res) => {
    try {
        // Проверяем активные операции
        if (activeTelegramOperations.has(req.userId)) {
            const operation = activeTelegramOperations.get(req.userId);
            return res.json({ 
                success: false, 
                error: `У вас уже выполняется операция: ${operation.type}. Дождитесь завершения.` 
            });
        }

        setActiveTelegramOperation(req.userId, 'auto-delete');

        const { users, deleteTimer, startDateTime, settings } = req.body;

        // Валидация
        if (!users || !Array.isArray(users) || users.length === 0) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Введите хотя бы одного пользователя' 
            });
        }

        if (!deleteTimer) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Выберите таймер автоудаления' 
            });
        }

        if (!startDateTime) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Укажите дату и время начала' 
            });
        }

        // Проверяем, что время в будущем
        const scheduledTime = new Date(startDateTime);
        if (scheduledTime <= new Date()) {
            clearActiveTelegramOperation(req.userId);
            return res.json({ 
                success: false, 
                error: 'Время начала должно быть в будущем' 
            });
        }

        // Получаем изолированный AutoDeleteManager пользователя
        const autoDeleteManager = await userSessionManager.getUserAutoDeleteManager(req.userId, req.userSessionsDir);

        // Создаем задание
        const task = autoDeleteManager.createTask({
            users: users,
            deleteTimer: deleteTimer,
            startDateTime: startDateTime,
            settings: settings || {}
        });

        // Планируем выполнение задания через UserSessionManager
        const executionCallback = (taskId) => {
            userSessionManager.executeAutoDeleteTask(req.userId, req.userSessionsDir, taskId);
        };
        autoDeleteManager.scheduleTask(task, executionCallback);

        // Очищаем операцию и возвращаем результат
        clearActiveTelegramOperation(req.userId);
        res.json({ success: true, task: task });

    } catch (error) {
        clearActiveTelegramOperation(req.userId);
        console.error('Ошибка создания задания автоудаления:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения списка заданий автоудаления
app.get('/api/auto-delete-tasks', async (req, res) => {
    try {
        const autoDeleteManager = await userSessionManager.getUserAutoDeleteManager(req.userId, req.userSessionsDir);
        
        const tasks = autoDeleteManager.getAllTasks();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        console.error('Ошибка получения заданий автоудаления:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для удаления задания автоудаления
app.delete('/api/auto-delete-tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const autoDeleteManager = await userSessionManager.getUserAutoDeleteManager(req.userId, req.userSessionsDir);
        
        const deleted = autoDeleteManager.deleteTask(taskId);
        
        if (deleted) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Задание не найдено' });
        }
    } catch (error) {
        console.error('Ошибка удаления задания автоудаления:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения деталей задания автоудаления
app.get('/api/auto-delete-details/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const autoDeleteManager = await userSessionManager.getUserAutoDeleteManager(req.userId, req.userSessionsDir);
        
        const task = autoDeleteManager.getTask(taskId);
        
        if (task) {
            res.json({ success: true, task: task });
        } else {
            res.json({ success: false, error: 'Задание не найдено' });
        }
    } catch (error) {
        console.error('Ошибка получения деталей задания:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения текущего состояния поиска
app.get('/api/search-status', (req, res) => {
    try {
        const operation = activeTelegramOperations.get(req.userId);
        
        if (operation && operation.type === 'search') {
            res.json({ 
                success: true, 
                isActive: true,
                operation: operation.type,
                startTime: operation.startTime
            });
        } else {
            res.json({ 
                success: true, 
                isActive: false 
            });
        }
    } catch (error) {
        console.error('Ошибка получения статуса поиска:', error);
        res.json({ success: false, error: error.message });
    }
});


// API для остановки поиска
app.post('/api/stop-search', (req, res) => {
    try {
        const operation = activeTelegramOperations.get(req.userId);
        
        if (operation && operation.type === 'search') {
            // Удаляем операцию из активных
            clearActiveTelegramOperation(req.userId);
            
            // Отправляем событие об остановке через WebSocket
            if (global.io) {
                global.io.emit(`progress_${req.userId}`, {
                    type: 'stopped',
                    message: 'Поиск остановлен пользователем'
                });
            }
            
            console.log(`Поиск остановлен пользователем ${req.userId}`);
            res.json({ success: true, message: 'Поиск остановлен' });
        } else {
            res.json({ success: false, error: 'Активный поиск не найден' });
        }
    } catch (error) {
        console.error('Ошибка остановки поиска:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для сохранения истории поиска
app.post('/api/save-search-history', (req, res) => {
    try {
        const { historyData } = req.body;
        
        if (!historyData) {
            return res.json({ success: false, error: 'Нет данных для сохранения' });
        }
        
        // Создаем папку для истории пользователя
        const userHistoryDir = `./history/${req.userId}`;
        if (!fs.existsSync('./history')) {
            fs.mkdirSync('./history');
        }
        if (!fs.existsSync(userHistoryDir)) {
            fs.mkdirSync(userHistoryDir);
        }
        
        // Создаем файл с историей
        const historyId = Date.now().toString();
        const historyFile = path.join(userHistoryDir, `search_${historyId}.json`);
        
        const historyRecord = {
            id: historyId,
            type: 'search',
            timestamp: Date.now(),
            userId: req.userId,
            ...historyData
        };
        
        fs.writeFileSync(historyFile, JSON.stringify(historyRecord, null, 2));
        
        // Также сохраняем краткую информацию в localStorage (без сообщений)
        const briefHistory = {
            id: historyId,
            type: 'search',
            timestamp: Date.now(),
            keywords: historyData.keywords,
            groupsCount: historyData.groupsCount,
            groupsList: historyData.groupsList,
            messagesCount: historyData.messagesCount,
            searchParams: historyData.searchParams
        };
        
        res.json({ 
            success: true, 
            historyId: historyId,
            briefHistory: briefHistory,
            message: 'История сохранена в базе данных'
        });
        
    } catch (error) {
        console.error('Ошибка сохранения истории:', error);
        res.json({ success: false, error: error.message });
    }
});

// API для получения полной истории по ID
app.get('/api/get-search-history/:historyId', (req, res) => {
    try {
        const { historyId } = req.params;
        const userHistoryDir = `./history/${req.userId}`;
        const historyFile = path.join(userHistoryDir, `search_${historyId}.json`);
        
        if (!fs.existsSync(historyFile)) {
            return res.json({ success: false, error: 'История не найдена' });
        }
        
        const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        
        res.json({ 
            success: true, 
            history: historyData
        });
        
    } catch (error) {
        console.error('Ошибка получения истории:', error);
        res.json({ success: false, error: error.message });
    }
});

server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});