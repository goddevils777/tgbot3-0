const crypto = require('crypto');

class TelegramAuthManager {
    constructor(userManager) {
        this.userManager = userManager;
        this.pendingAuth = new Map(); // userId -> authData
    }

    // Генерация ссылки для авторизации через Telegram
    generateAuthLink(tempUserId) {
        const authToken = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        
        // Сохраняем временные данные авторизации
        this.pendingAuth.set(authToken, {
            tempUserId,
            timestamp,
            expiresAt: timestamp + (5 * 60 * 1000) // 5 минут
        });

        const botUsername = 'my_message_hunter_bot'; // Замените на username вашего бота
        const authUrl = `https://t.me/${botUsername}?start=${authToken}`;
        
        return { authUrl, authToken };
    }


    // Подтверждение авторизации из Telegram
    confirmAuth(authToken, telegramUser) {
        const authData = this.pendingAuth.get(authToken);
        
        if (!authData) {
            return { success: false, error: 'Токен авторизации не найден' };
        }

        if (Date.now() > authData.expiresAt) {
            this.pendingAuth.delete(authToken);
            return { success: false, error: 'Токен авторизации истек' };
        }

        // Создаем или находим пользователя
        const user = this.userManager.createTelegramUser({
            telegramId: telegramUser.id,
            username: telegramUser.username,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
            tempUserId: authData.tempUserId
        });

        // Удаляем использованный токен
        this.pendingAuth.delete(authToken);

        return { success: true, user, userId: user.id };
    }

    // Проверка статуса авторизации
    checkAuthStatus(authToken) {
        const authData = this.pendingAuth.get(authToken);
        
        if (!authData) {
            return { success: false, error: 'Токен не найден' };
        }

        if (Date.now() > authData.expiresAt) {
            this.pendingAuth.delete(authToken);
            return { success: false, error: 'Токен истек' };
        }

        return { success: true, pending: true };
    }

    // Сохранение успешной авторизации
    setAuthSuccess(authToken, userId) {
        // Создаем временную запись об успешной авторизации
        this.pendingAuth.set(`success_${authToken}`, {
            userId,
            success: true,
            timestamp: Date.now(),
            expiresAt: Date.now() + (2 * 60 * 1000) // 2 минуты на установку cookie
        });
    }

    // Получение результата авторизации
    getAuthResult(authToken) {
        const successData = this.pendingAuth.get(`success_${authToken}`);
        
        if (successData && successData.success) {
            // Удаляем использованную запись
            this.pendingAuth.delete(`success_${authToken}`);
            return { success: true, userId: successData.userId };
        }
        
        return { success: false };
    }
}

module.exports = TelegramAuthManager;