const TelegramBot = require('node-telegram-bot-api');

class TelegramBotAuth {
    constructor(telegramAuthManager) {
        this.telegramAuthManager = telegramAuthManager;
        this.bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
        this.setupHandlers();
    }

    setupHandlers() {

        // Обработчик команды /start с параметром авторизации
        this.bot.onText(/\/start (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const authToken = match[1];
            
            console.log(`Получен токен авторизации: ${authToken} от пользователя ${msg.from.id}`);

            // Подтверждаем авторизацию
            const result = this.telegramAuthManager.confirmAuth(authToken, msg.from);
            
            if (result.success) {
                // Сохраняем информацию об успешной авторизации для веб-приложения
                this.telegramAuthManager.setAuthSuccess(authToken, result.userId);
                
                await this.bot.sendMessage(chatId, 
                    `✅ Авторизация успешна!\n\n` +
                    `Добро пожаловать, ${msg.from.first_name}!\n` +
                    `Теперь вы можете вернуться в веб-приложение.`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🌐 Открыть приложение', url: 'https://tgbotparsser.up.railway.app' }
                            ]]
                        }
                    }
                );
            } else {
                await this.bot.sendMessage(chatId, 
                    `❌ Ошибка авторизации: ${result.error}\n\n` +
                    `Попробуйте получить новую ссылку для входа.`
                );
            }
        });

        // Обработчик обычной команды /start
        this.bot.onText(/\/start$/, async (msg) => {
            const chatId = msg.chat.id;
            
            await this.bot.sendMessage(chatId,
                `👋 Привет, ${msg.from.first_name}!\n\n` +
                `Этот бот используется для авторизации в веб-приложении.\n\n` +
                `Чтобы войти в систему:\n` +
                `1. Нажмите "Войти через Telegram" в веб-приложении\n` +
                `2. Перейдите по ссылке, которая откроет этот чат\n` +
                `3. Нажмите /start с параметром авторизации`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🌐 Открыть приложение', url: 'https://tgbotparsser.up.railway.app' }
                        ]]
                    }
                }
            );
        });

        // Обработка ошибок
        this.bot.on('error', (error) => {
            console.error('Ошибка Telegram бота:', error);
        });

        console.log('Telegram бот для авторизации запущен');
    }
}

module.exports = TelegramBotAuth;