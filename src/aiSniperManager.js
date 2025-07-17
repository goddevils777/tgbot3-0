const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AiSniperManager {
    constructor() {
        this.activeSessions = new Map(); // userId -> session data
        this.messageListeners = new Map(); // userId -> telegram listeners
        this.responseDelays = new Map(); // chatId -> last response time
        this.dailyLimits = new Map(); // chatId -> daily response count
        this.stats = new Map(); // userId -> stats

        // Инициализация Gemini AI
        try {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Исправлена модель
            console.log(`✅ Gemini AI инициализирован успешно`);
        } catch (error) {
            console.error(`❌ Ошибка инициализации Gemini:`, error);
            this.model = null;
        }

        this.respondedMessages = new Map(); 

    }

    // Реальный AI анализ с Gemini (с детальными логами)
    async analyzeMessage(message, config) {
        try {
            const messageText = message.text || message.message || '';
            if (!messageText || messageText.length < 10) return false;
            
            // Пропускаем сообщения ботов и команды
            if (message.fromBot || messageText.startsWith('/')) return false;
            
            console.log(`🧠 Gemini анализирует: "${messageText}"`);
            console.log(`👤 Промпт пользователя: "${config.mainPrompt}"`);
            
            // Отправляем в Gemini для анализа
            const prompt = `Анализируй это сообщение из чата: "${messageText}"

    Мой профиль деятельности: "${config.mainPrompt}"

    Задача: определить, стоит ли мне ответить на это сообщение, чтобы тонко показать свою экспертность и заинтересовать автора написать в личные сообщения.

    Оцени релевантность от 0 до 100. Отвечай ТОЛЬКО числом.

    Критерии:
    - Есть ли вопрос или проблема, где я могу помочь?
    - Подходит ли тема под мою деятельность?
    - Не является ли это спамом или рекламой?
    - Есть ли возможность для полезного совета?`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const aiResponse = response.text().trim();
            const score = parseInt(aiResponse);
            
            console.log(`🤖 Gemini ответил: "${aiResponse}"`);
            console.log(`📊 Извлеченный скор: ${score}`);
            console.log(`🎯 Порог для ответа: 65`);
            console.log(`✅ Будем отвечать: ${score > 50 ? 'ДА' : 'НЕТ'}`);
            
            return score > 50;
            
        } catch (error) {
            console.error('❌ Ошибка Gemini AI анализа:', error);
            // Возвращаемся к простому анализу если AI недоступен
            console.log(`🔄 Используем fallback анализ...`);
            const fallbackResult = this.calculateRelevance(messageText, config.mainPrompt) > 0.2; // Снижаем с 0.3 до 0.2
            console.log(`🔄 Fallback результат: ${fallbackResult ? 'ОТВЕТИТЬ' : 'ПРОПУСТИТЬ'}`);
            return fallbackResult;
        }
    }

    // Генерация ответа только с Gemini (без fallback)
    async generateResponse(originalMessage, config) {
        try {
            const messageText = originalMessage.text || originalMessage.message || '';
            const style = config.communicationStyle;
            const prompt = config.mainPrompt;
            
            // Жесткий промпт для Gemini
            const aiPrompt = `СТРОГО СЛЕДУЙ ИНСТРУКЦИЯМ:

    СООБЩЕНИЕ: "${messageText}"
    ТВОЯ ДЕЯТЕЛЬНОСТЬ: "${prompt}"
    СТИЛЬ: ${style}

    ЗАДАЧА: Ответь на сообщение как обычный участник чата.

    ЖЕСТКИЕ ЗАПРЕТЫ:
    - НЕ используй фразы: "профессиональный анализ", "основываясь на опыте", "из практики"
    - НЕ начинай с "Я", "Мне", "Моё мнение"
    - НЕ используй многоточие в конце
    - НЕ пиши общие фразы

    ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
    1. Максимум 80 символов
    2. Включи КОНКРЕТНОЕ слово из сообщения в ответ
    3. Отвечай именно на ТО, что спрашивается
    4. Звучи как живой человек в чате

    ПРИМЕРЫ ХОРОШИХ ОТВЕТОВ:
    На "Кто делает сайты?" → "Сайты делаю уже 3 года. Какой нужен?"
    На "Нужна помощь с кодом" → "С кодом помогу. Какой язык?"
    На "Как продвигать бизнес?" → "Бизнес продвигаю через сайты. Что за сфера?"

    СТИЛИ:
    - friendly: дружелюбно, можно эмодзи
    - business: четко, по делу
    - expert: умно, с фактами
    - casual: просто, как с другом

    ТВОЙ ОТВЕТ (только ответ, никаких пояснений):`;

            if (!this.model) {
                throw new Error('Gemini не инициализирован');
            }

            const result = await this.model.generateContent(aiPrompt);
            const response = await result.response;
            let generatedText = response.text().trim();
            
            // Агрессивная очистка от шаблонов
            generatedText = generatedText.replace(/^["']|["']$/g, '');
            generatedText = generatedText.replace(/^(Ответ:|Твой ответ:)\s*/i, '');
            generatedText = generatedText.replace(/\.\.\.$/, '');
            
            // Проверяем на запрещенные фразы
            const bannedPhrases = [
                'профессиональный анализ',
                'основываясь на опыте',
                'из практики',
                'экспертное мнение',
                'можно обсудить детали'
            ];
            
            const hasBannedPhrase = bannedPhrases.some(phrase => 
                generatedText.toLowerCase().includes(phrase)
            );
            
            if (hasBannedPhrase) {
                console.log(`❌ Gemini использовал запрещенную фразу: "${generatedText}"`);
                // Повторяем запрос с еще более жестким промптом
                return await this.generateBackupResponse(messageText, config);
            }
            
            // Ограничиваем длину
            if (generatedText.length > 100) {
                generatedText = generatedText.substring(0, 97) + '...';
            }
            
            console.log(`✅ Gemini сгенерировал ответ: "${generatedText}"`);
            return generatedText;
            
        } catch (error) {
            console.error('❌ Ошибка генерации ответа Gemini:', error);
            // Если Gemini не работает - используем простой контекстный ответ
            return this.generateSimpleContextResponse(messageText, config);
        }
    }

    // Запасной запрос к Gemini
    async generateBackupResponse(messageText, config) {
        try {
            const backupPrompt = `Сообщение: "${messageText}"
    Твоя сфера: "${config.mainPrompt}"

    Ответь максимально просто и естественно, как будто переписываешься с другом.
    Максимум 60 символов.
    Без пафоса и профессиональных терминов.

    Ответ:`;

            const result = await this.model.generateContent(backupPrompt);
            const response = await result.response;
            return response.text().trim().replace(/^["']|["']$/g, '');
            
        } catch (error) {
            return this.generateSimpleContextResponse(messageText, config);
        }
    }

    // Простой контекстный ответ если все не работает
    generateSimpleContextResponse(messageText, config) {
        const keyword = this.extractMainKeyword(messageText);
        const responses = [
            `${keyword} делаю. Что нужно?`,
            `С ${keyword} работаю. Детали?`,
            `${keyword} - моя тема. Обсудим?`
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // Извлечение главного ключевого слова
    extractMainKeyword(text) {
        const keywords = ['сайт', 'разработка', 'код', 'бизнес', 'стартап', 'приложение'];
        return keywords.find(word => text.toLowerCase().includes(word)) || 'проект';
    }

    // Запуск AI Sniper для пользователя
    async startSniper(userId, config, telegramClientAPI) {
        try {
            if (this.activeSessions.has(userId)) {
                return { success: false, error: 'AI Sniper уже активен' };
            }

            const sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();
            
            const session = {
                id: sessionId,
                userId: userId,
                config: {
                    mainPrompt: config.mainPrompt,
                    communicationStyle: config.communicationStyle,
                    chats: config.chats,
                    schedule: config.schedule,
                    // Автоматические настройки безопасности
                    safetySettings: this.generateSafetySettings()
                },
                stats: {
                    startTime: new Date().toISOString(),
                    totalResponses: 0,
                    todayResponses: 0,
                    chatStats: {},
                    lastResetDate: new Date().toDateString()
                },
                status: 'active',
                telegramClientAPI: telegramClientAPI
            };

            this.activeSessions.set(userId, session);
            this.stats.set(userId, session.stats);

            // Запускаем мониторинг сообщений
            await this.startMessageMonitoring(userId, session);

            console.log(`AI Sniper запущен для пользователя ${userId}, сессия: ${sessionId}`);
            return { success: true, sessionId: sessionId };

        } catch (error) {
            console.error(`Ошибка запуска AI Sniper для ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Генерация автоматических настроек безопасности

    generateSafetySettings() {
        return {
            responseDelay: this.getRandomDelay(5, 20), // 5-20 минут между ответами
            dailyLimit: this.getRandomNumber(5, 12), // 5-12 ответов в день на чат (увеличил)
            typingDelay: this.getRandomNumber(3, 8), // 3-8 секунд имитации набора
            humanBehavior: true,
            smartFiltering: true,
            contextAware: true,
            replyToMessage: true,
            // Убираем случайный шанс - пусть AI решает
            responseChance: 100 // Всегда отвечаем если AI считает релевантным
        };
    }

    // Случайное число в диапазоне
    getRandomNumber(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Случайная задержка в минутах
    getRandomDelay(minMinutes, maxMinutes) {
        return this.getRandomNumber(minMinutes, maxMinutes);
    }

    // Запуск мониторинга сообщений через существующую систему
    async startMessageMonitoring(userId, session) {
        try {
            // НЕ создаем новые обработчики событий
            // Вместо этого помечаем сессию как активную для AI
            session.status = 'monitoring';
            
            console.log(`AI Sniper активирован для пользователя ${userId} (без отдельных обработчиков)`);
            
            // Запускаем периодическую проверку новых сообщений
            this.startPeriodicCheck(userId, session);
            
        } catch (error) {
            console.error(`Ошибка запуска мониторинга AI для ${userId}:`, error);
            throw error;
        }
    }

    // Периодическая проверка с реальным анализом сообщений
    startPeriodicCheck(userId, session) {
        const checkInterval = setInterval(async () => {
            try {
                if (!this.activeSessions.has(userId)) {
                    clearInterval(checkInterval);
                    return;
                }
                
                // Получаем последние сообщения из отслеживаемых чатов
                await this.checkRecentMessages(userId, session);
                
            } catch (error) {
                console.error(`Ошибка проверки сообщений AI:`, error);
            }
        }, 15000); // Проверяем каждые 15 секунд
        
        session.checkInterval = checkInterval;
    }


    // Проверка последних сообщений с детальными логами
    async checkRecentMessages(userId, session) {
        try {
            const { config, telegramClientAPI } = session;
            
            if (!telegramClientAPI) {
                console.log(`❌ AI Sniper ${userId}: Нет Telegram клиента`);
                return;
            }
            
            console.log(`🔍 AI Sniper ${userId}: Проверяем ${config.chats.length} чатов...`);
            
            // Проверяем каждый отслеживаемый чат
            for (const chat of config.chats) {
                try {
                    console.log(`📱 Проверяем чат: ${chat.name} (${chat.id})`);
                    
                    // Получаем последние 3 сообщения из чата
                    const messages = await telegramClientAPI.client.getMessages(chat.id, { limit: 3 });
                    console.log(`📬 Получено ${messages.length} сообщений из ${chat.name}`);
                    
                    for (const message of messages) {
                        // Проверяем возраст сообщения
                        const messageAge = Date.now() - (message.date * 1000);
                        const ageMinutes = Math.floor(messageAge / (1000 * 60));
                        
                        console.log(`⏰ Сообщение возрастом ${ageMinutes} минут: "${(message.text || '').substring(0, 50)}..."`);
                        
                        // Пропускаем старые сообщения (старше 5 минут для тестирования)
                        if (messageAge > 5 * 60 * 1000) {
                            console.log(`⏭️ Пропускаем старое сообщение (>${5} минут)`);
                            continue;
                        }
                        
                        // Пропускаем свои сообщения
                        try {
                            const me = await telegramClientAPI.client.getMe();
                            if (message.senderId && message.senderId.equals(me.id)) {
                                console.log(`👤 Пропускаем своё сообщение`);
                                continue;
                            }
                        } catch (e) {
                            console.log(`⚠️ Не удалось проверить отправителя: ${e.message}`);
                        }
                        
                        console.log(`🤖 Анализируем сообщение: "${(message.text || '').substring(0, 100)}..."`);
                        
                        // Анализируем и отвечаем
                        const shouldRespond = await this.handleNewMessage(userId, session, message);
                        console.log(`📊 Результат анализа: ${shouldRespond ? 'ОТВЕТИТЬ' : 'ПРОПУСТИТЬ'}`);
                    }
                    
                    // Задержка между чатами
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (chatError) {
                    console.error(`❌ Ошибка проверки чата ${chat.name}:`, chatError.message);
                }
            }
            
        } catch (error) {
            console.error('❌ Ошибка проверки сообщений:', error);
        }
    }

   
    // Обработка нового сообщения (с проверкой дублирования)
    async handleNewMessage(userId, session, message) {
        try {
            const { config } = session;
            
            console.log(`🔍 handleNewMessage вызван для сообщения: "${(message.text || '').substring(0, 50)}..."`);
            
            // Проверяем не отвечали ли уже на это сообщение
            const messageId = `${message.chatId || message.peerId?.channelId}_${message.id}`;
            if (this.respondedMessages.has(messageId)) {
                console.log(`❌ Уже отвечали на это сообщение: ${messageId}`);
                return false;
            }
            
            // Проверяем, что сообщение из отслеживаемых чатов
            const targetChat = config.chats.find(chat => 
                chat.id == message.chatId || chat.id == message.peerId?.channelId
            );
            
            if (!targetChat) {
                console.log(`❌ Сообщение не из отслеживаемого чата`);
                return false;
            }
            
            console.log(`✅ Сообщение из отслеживаемого чата: ${targetChat.name}`);

            // Проверяем расписание работы
            if (!this.isWorkingTime(config.schedule)) {
                console.log(`❌ Сейчас нерабочее время`);
                return false;
            }
            
            console.log(`✅ Рабочее время, продолжаем`);

            // Проверяем лимиты и задержки
            if (!this.canRespondToChat(targetChat.id, config.safetySettings)) {
                console.log(`❌ Не можем отвечать в этот чат (лимиты/задержки)`);
                return false;
            }
            
            console.log(`✅ Можем отвечать в чат, переходим к AI анализу`);

            // Анализируем сообщение с помощью AI
            console.log(`🤖 Начинаем AI анализ...`);
            const shouldRespond = await this.analyzeMessage(message, config);
            console.log(`🎯 AI анализ завершен, результат: ${shouldRespond}`);
            
            if (!shouldRespond) {
                console.log(`❌ AI решил не отвечать`);
                return false;
            }

            console.log(`🚀 AI решил ОТВЕТИТЬ! Генерируем ответ...`);
            
            // Помечаем сообщение как обработанное ПЕРЕД отправкой
            this.respondedMessages.set(messageId, Date.now());
            console.log(`📝 Сообщение помечено как обработанное: ${messageId}`);
            
            // Генерируем и отправляем ответ
            await this.generateAndSendResponse(userId, session, message, targetChat);
            
            // Очищаем старые записи (старше 24 часов)
            this.cleanupOldMessages();
            
            return true;

        } catch (error) {
            console.error(`❌ Ошибка обработки сообщения:`, error);
            return false;
        }
    }

    // Очистка старых записей об отвеченных сообщениях
    cleanupOldMessages() {
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000; // 24 часа
        
        let cleanedCount = 0;
        
        for (const [messageId, timestamp] of this.respondedMessages.entries()) {
            if (now - timestamp > dayInMs) {
                this.respondedMessages.delete(messageId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Очищено ${cleanedCount} старых записей об отвеченных сообщениях`);
        }
    }

    // Проверка рабочего времени
    isWorkingTime(schedule) {
        const now = new Date();
        const currentDay = now.getDay(); // 0 = воскресенье
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        // Проверяем день недели
        if (!schedule.weekdays.includes(currentDay)) return false;
        
        // Проверяем время
        const startTime = this.timeToMinutes(schedule.startTime);
        const endTime = this.timeToMinutes(schedule.endTime);
        
        return currentTime >= startTime && currentTime <= endTime;
    }

    // Конвертация времени в минуты
    timeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Проверка возможности ответа в чат
    // Проверка возможности ответа в чат (с детальными логами)
    canRespondToChat(chatId, safetySettings) {
        const now = Date.now();
        const today = new Date().toDateString();
        
        console.log(`🔍 canRespondToChat для чата ${chatId}`);
        console.log(`⚙️ Настройки безопасности:`, safetySettings);
        
        // Проверяем задержку между ответами
        const lastResponse = this.responseDelays.get(chatId);
        if (lastResponse) {
            const delayMs = safetySettings.responseDelay * 60 * 1000;
            const timeSinceLastResponse = now - lastResponse;
            const minutesSinceLastResponse = Math.floor(timeSinceLastResponse / (60 * 1000));
            
            console.log(`⏰ Последний ответ был ${minutesSinceLastResponse} минут назад`);
            console.log(`⏳ Требуется задержка: ${safetySettings.responseDelay} минут`);
            
            if (timeSinceLastResponse < delayMs) {
                console.log(`❌ Блокировка: слишком рано отвечать (нужно еще ${Math.ceil((delayMs - timeSinceLastResponse) / (60 * 1000))} минут)`);
                return false;
            }
        } else {
            console.log(`✅ Первый ответ в этот чат`);
        }
        
        // Проверяем дневной лимит
        const dailyKey = `${chatId}-${today}`;
        const todayCount = this.dailyLimits.get(dailyKey) || 0;
        
        console.log(`📊 Сегодня отвечено: ${todayCount}/${safetySettings.dailyLimit}`);
        
        if (todayCount >= safetySettings.dailyLimit) {
            console.log(`❌ Блокировка: достигнут дневной лимит`);
            return false;
        }
        
        // Проверяем случайную вероятность ответа
        const randomChance = Math.random() * 100;
        console.log(`🎲 Случайный шанс: ${randomChance.toFixed(1)}% (нужно меньше ${safetySettings.responseChance}%)`);
        
        if (randomChance > safetySettings.responseChance) {
            console.log(`❌ Блокировка: неудачный случайный шанс`);
            return false;
        }
        
        console.log(`✅ Все проверки пройдены, можно отвечать!`);
        return true;
    }


    // Расчет релевантности сообщения
    calculateRelevance(messageText, mainPrompt) {
        try {
            const messageWords = this.extractKeywords(messageText.toLowerCase());
            const promptWords = this.extractKeywords(mainPrompt.toLowerCase());
            
            // Простое пересечение ключевых слов
            const intersection = messageWords.filter(word => promptWords.includes(word));
            const relevance = intersection.length / Math.max(messageWords.length, 1);
            
            // Бонус за контекстные слова
            const contextWords = ['помощь', 'нужен', 'ищу', 'посоветуйте', 'как', 'где', 'что'];
            const hasContext = contextWords.some(word => messageText.toLowerCase().includes(word));
            
            return hasContext ? Math.min(relevance + 0.2, 1) : relevance;
            
        } catch (error) {
            return 0;
        }
    }

    // Извлечение ключевых слов
    extractKeywords(text) {
        const stopWords = ['и', 'в', 'на', 'с', 'по', 'для', 'не', 'что', 'это', 'как', 'его', 'ее', 'их'];
        return text
            .replace(/[^\wа-я\s]/gi, '')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word))
            .slice(0, 10); // Берем первые 10 слов
    }

    // Генерация и отправка ответа
    async generateAndSendResponse(userId, session, originalMessage, targetChat) {
        try {
            const { config, telegramClientAPI } = session;
            
            // Генерируем ответ
            const response = await this.generateResponse(originalMessage, config);
            if (!response) return;
            
            // Имитируем человеческое поведение
            await this.simulateHumanBehavior(config.safetySettings);
            
            // Отправляем ответ
            await this.sendResponse(telegramClientAPI, targetChat.id, response, originalMessage);
            
            // Обновляем статистику
            this.updateStats(userId, targetChat);
            
            console.log(`AI ответ отправлен в ${targetChat.name}: ${response.substring(0, 50)}...`);
            
        } catch (error) {
            console.error('Ошибка отправки ответа:', error);
        }
    }

    

    // Шаблоны ответов по стилям
    getResponseTemplates(style) {
        const templates = {
            friendly: [
                "Интересная тема! Я недавно сталкивался с похожим...",
                "О, это актуально! У меня есть опыт в этой области.",
                "Классный вопрос! Могу поделиться своим видением.",
                "Согласен! В своей практике часто встречаю подобное."
            ],
            business: [
                "Это важный вопрос для бизнеса. Из опыта знаю...",
                "Профессиональный подход к решению таких задач...",
                "В рабочей практике с этим сталкиваюсь регулярно.",
                "С точки зрения эффективности бизнеса..."
            ],
            expert: [
                "Технически это решается следующим образом...",
                "Профессиональный анализ показывает...",
                "Основываясь на опыте работы в этой сфере...",
                "Экспертное мнение: подход должен быть..."
            ],
            casual: [
                "Да, знакомая ситуация) Сам недавно с этим разбирался.",
                "Кстати, у меня было похожее. Делал так...",
                "Можно попробовать такой вариант...",
                "Хм, интересно. А я обычно в таких случаях..."
            ]
        };
        
        return templates[style] || templates.friendly;
    }

    // Заполнение шаблона
    fillTemplate(template, messageText, prompt) {
        // Простое заполнение шаблона
        const maxLength = 200; // Максимальная длина ответа
        
        // Добавляем тонкий намек на специализацию
        const hints = this.extractHintsFromPrompt(prompt);
        const hint = hints[Math.floor(Math.random() * hints.length)];
        
        let response = template;
        if (hint && Math.random() > 0.5) { // 50% шанс добавить намек
            response += ` ${hint}`;
        }
        
        // Обрезаем если слишком длинный
        if (response.length > maxLength) {
            response = response.substring(0, maxLength - 3) + '...';
        }
        
        return response;
    }

    // Извлечение намеков из промпта
    extractHintsFromPrompt(prompt) {
        return [
            "Если будут вопросы - пишите в личку, помогу!",
            "Всегда готов помочь с подобными задачами.",
            "Есть интересные решения по этой теме.",
            "Можно обсудить детали, если интересно."
        ];
    }

    // Имитация человеческого поведения
    async simulateHumanBehavior(safetySettings) {
        // Случайная задержка перед ответом
        const delay = this.getRandomNumber(
            safetySettings.typingDelay * 1000,
            safetySettings.typingDelay * 2000
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Отправка ответа
    async sendResponse(telegramClientAPI, chatId, responseText, originalMessage) {
        try {
            // Отправляем как reply к оригинальному сообщению
            await telegramClientAPI.client.sendMessage(chatId, {
                message: responseText,
                replyToMsgId: originalMessage.id
            });
            
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            throw error;
        }
    }

    // Обновление статистики
    updateStats(userId, targetChat) {
        const session = this.activeSessions.get(userId);
        if (!session) return;
        
        const now = Date.now();
        const today = new Date().toDateString();
        const chatId = targetChat.id;
        
        // Обновляем время последнего ответа
        this.responseDelays.set(chatId, now);
        
        // Обновляем дневной лимит
        const dailyKey = `${chatId}-${today}`;
        const currentCount = this.dailyLimits.get(dailyKey) || 0;
        this.dailyLimits.set(dailyKey, currentCount + 1);
        
        // Обновляем статистику сессии
        session.stats.totalResponses++;
        
        // Сбрасываем счетчик дня если новый день
        if (session.stats.lastResetDate !== today) {
            session.stats.todayResponses = 0;
            session.stats.lastResetDate = today;
        }
        
        session.stats.todayResponses++;
        
        // Статистика по чатам
        if (!session.stats.chatStats[targetChat.name]) {
            session.stats.chatStats[targetChat.name] = 0;
        }
        session.stats.chatStats[targetChat.name]++;
        
        // Обновляем глобальную статистику
        this.stats.set(userId, session.stats);
    }

    // Остановка AI Sniper
    async stopSniper(userId) {
        try {
            const session = this.activeSessions.get(userId);
            if (!session) {
                return { success: false, error: 'AI Sniper не активен' };
            }
            
            // Удаляем обработчик сообщений
            const messageHandler = this.messageListeners.get(userId);
            if (messageHandler && session.telegramClientAPI) {
                session.telegramClientAPI.client.removeEventHandler(messageHandler);
            }
            
            // Очищаем данные
            this.activeSessions.delete(userId);
            this.messageListeners.delete(userId);
            
            console.log(`AI Sniper остановлен для пользователя ${userId}`);
            return { success: true };
            
        } catch (error) {
            console.error(`Ошибка остановки AI Sniper для ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }


    // В методе getStats добавить информацию о отвеченных сообщениях
    getStats(userId) {
        const stats = this.stats.get(userId);
        if (!stats) {
            return {
                todayResponses: 0,
                totalResponses: 0,
                chatStats: {},
                timeStats: {},
                respondedMessagesCount: 0
            };
        }
        
        return {
            todayResponses: stats.todayResponses,
            totalResponses: stats.totalResponses,
            chatStats: stats.chatStats,
            timeStats: this.generateTimeStats(),
            respondedMessagesCount: this.respondedMessages.size
        };
    }

    // Генерация статистики по времени
    generateTimeStats() {
        const stats = {};
        const currentHour = new Date().getHours();
        
        // Заглушка для статистики времени
        for (let i = 0; i < 24; i++) {
            stats[i] = i === currentHour ? this.getRandomNumber(1, 5) : 0;
        }
        
        return stats;
    }

    // Проверка активности
    isActive(userId) {
        return this.activeSessions.has(userId);
    }

    // Тестирование промпта
    async testPrompt(prompt, style) {
        try {
            const templates = this.getResponseTemplates(style);
            const template = templates[0]; // Берем первый шаблон для теста
            
            const testResponse = this.fillTemplate(template, "Тестовое сообщение", prompt);
            
            return {
                success: true,
                testResponse: testResponse,
                analysis: {
                    style: style,
                    promptKeywords: this.extractKeywords(prompt.toLowerCase()),
                    responseLength: testResponse.length
                }
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = AiSniperManager;