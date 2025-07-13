const SessionManager = require('./sessionManager');
const AutoSearchManager = require('./autoSearchManager');
const BroadcastManager = require('./broadcastManager'); // Добавь импорт

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
            
            this.userManagers.set(userId, {
                sessionManager,
                autoSearchManager,
                broadcastManager // Добавь в объект
            });
        }
        
        return this.userManagers.get(userId);
    }

    // Получение BroadcastManager пользователя
    async getUserBroadcastManager(userId, userSessionsDir) {
        const managers = await this.getUserManagers(userId, userSessionsDir);
        return managers.broadcastManager;
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