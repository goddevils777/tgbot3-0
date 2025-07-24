const SessionManager = require('./sessionManager');
const AutoSearchManager = require('./autoSearchManager');
const BroadcastManager = require('./broadcastManager'); // Добавь импорт
const DirectBroadcastManager = require('./directBroadcastManager');
const AiSniperManager = require('./aiSniperManager');
const AutoDeleteManager = require('./autoDeleteManager');

class UserSessionManager {
    constructor() {
        this.userManagers = new Map(); // userId -> { sessionManager, autoSearchManager, broadcastManager }
    }

    // Получение или создание менеджеров для пользователя
    async getUserManagers(userId, userSessionsDir) {
        if (!this.userManagers.has(userId)) {
            console.log(`Создание изолированных менеджеров для пользователя: ${userId}`);
            
            // Создаем SessionManager для пользователя
            const sessionManager = new SessionManager();
            await sessionManager.setUserSessionsDir(userSessionsDir);
            
            // Создаем AutoSearchManager для пользователя
            const autoSearchManager = new AutoSearchManager();
            
            // Создаем BroadcastManager для пользователя
            const broadcastManager = new BroadcastManager();

            // Создаем AutoDeleteManager для пользователя
            const autoDeleteManager = new AutoDeleteManager();

            // Создаем DirectBroadcastManager для пользователя
            const directBroadcastManager = new DirectBroadcastManager();

            // Создаем AiSniperManager для пользователя
            const aiSniperManager = new AiSniperManager();

            this.userManagers.set(userId, {
                sessionManager,
                autoSearchManager,
                broadcastManager,
                directBroadcastManager,
                aiSniperManager,
                autoDeleteManager
            });
        }
        
        return this.userManagers.get(userId);
    }


    // Получение AutoDeleteManager пользователя
    async getUserAutoDeleteManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.autoDeleteManager;
    }

    // Выполнение задания автоудаления
    async executeAutoDeleteTask(userId, userSessionsDir, taskId) {
        try {
            const autoDeleteManager = await this.getUserAutoDeleteManager(userId, userSessionsDir);
            const telegramClientAPI = await this.createUserTelegramClientAPI(userId, userSessionsDir);
            
            if (telegramClientAPI) {
                await autoDeleteManager.executeTask(taskId, telegramClientAPI);
            } else {
                console.error(`Не удалось создать Telegram клиент для пользователя ${userId}`);
            }
        } catch (error) {
            console.error(`Ошибка выполнения автоудаления для пользователя ${userId}:`, error);
        }
    }

    // Получение BroadcastManager пользователя
    async getUserBroadcastManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.broadcastManager;
    }
    
    // Получение DirectBroadcastManager пользователя
    async getUserDirectBroadcastManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.directBroadcastManager;
    }

    // Получение AiSniperManager пользователя
    async getUserAiSniperManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.aiSniperManager;
}

    // Выполнение задания рассылки в личные сообщения
    async executeDirectBroadcastTask(userId, userSessionsDir, taskId) {
        try {
            const directBroadcastManager = await this.getUserDirectBroadcastManager(userId, userSessionsDir);
            const telegramClientAPI = await this.createUserTelegramClientAPI(userId, userSessionsDir);
            
            if (telegramClientAPI) {
                await directBroadcastManager.executeTask(taskId, telegramClientAPI);
            } else {
                console.error(`Не удалось создать Telegram клиент для пользователя ${userId}`);
            }
        } catch (error) {
            console.error(`Ошибка выполнения рассылки в личные сообщения ${taskId}:`, error);
        }
    }
    
    // Получение SessionManager пользователя
    async getUserSessionManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.sessionManager;
    }

    // Получение AutoSearchManager пользователя
    async getUserAutoSearchManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.autoSearchManager;
    }

    // Получение активного Telegram клиента пользователя
    async getUserTelegramClient(userId, userSessionsDir) {
        const sessionManager = await this.getUserSessionManager(userId, userSessionsDir);
        return sessionManager.getActiveClient();
    }

    // Создание TelegramClientAPI для пользователя
    async createUserTelegramClientAPI(userId, userSessionsDir) {
        const activeClient = await this.getUserTelegramClient(userId, userSessionsDir);
        
        if (!activeClient) {
            return null;
        }
        
        const TelegramClientAPI = require('./telegramClient');
        return new TelegramClientAPI(activeClient);
    }

    // Очистка менеджеров пользователя (при выходе)
    clearUserManagers(userId) {
        if (this.userManagers.has(userId)) {
            const managers = this.userManagers.get(userId);
            
            // Останавливаем все автопоиски пользователя
            if (managers.autoSearchManager) {
                const userSearches = managers.autoSearchManager.getUserAutoSearches(userId);
                userSearches.forEach(search => {
                    managers.autoSearchManager.stopAutoSearch(userId, search.sessionId);
                });
            }
            
            this.userManagers.delete(userId);
            console.log(`Очищены менеджеры для пользователя: ${userId}`);
        }
    }

    // Получение статистики по пользователям
    getStats() {
        return {
            totalUsers: this.userManagers.size,
            users: Array.from(this.userManagers.keys())
        };
    }
    // Запуск задания рассылки с активным клиентом
    async executeBroadcastTask(userId, userSessionsDir, taskId) {
        try {
            const broadcastManager = await this.getUserBroadcastManager(userId, userSessionsDir);
            const telegramClientAPI = await this.createUserTelegramClientAPI(userId, userSessionsDir);
            
            if (!telegramClientAPI) {
                console.log(`Нет активного клиента для пользователя ${userId}, отменяем рассылку`);
                return;
            }
            
            await broadcastManager.executeTask(taskId, telegramClientAPI);
        } catch (error) {
            console.error(`Ошибка выполнения рассылки для пользователя ${userId}:`, error);
        }
    }
}

module.exports = UserSessionManager;