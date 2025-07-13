const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIAnalyzer {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    async analyzeMessages(messages, userPrompt) {
        console.log('AI анализ запущен. Сообщений:', messages.length);
        console.log('Промпт:', userPrompt);
        try {
            const filteredMessages = [];
            
            // Обрабатываем сообщения по частям (по 10 штук)
            const batchSize = 10;
            for (let i = 0; i < messages.length; i += batchSize) {
                const batch = messages.slice(i, i + batchSize);
                
                // Создаем промпт для фильтрации
                const messagesText = batch.map((msg, index) => 
                    `${i + index + 1}. "${msg.text}" (группа: ${msg.groupName})`
                ).join('\n');
                
                const prompt = `Промпт для фильтрации: ${userPrompt}

    Сообщения для проверки:
    ${messagesText}

    ВАЖНО: Верни ТОЛЬКО номера сообщений, которые соответствуют промпту. 
    Формат ответа: только цифры через запятую (например: 1,3,5) или "нет" если ничего не подходит.`;
                
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const analysisResult = response.text().trim();

                // Добавь эти строки для отладки:
                console.log('Ответ AI для батча:', analysisResult);
                console.log('Найдены номера:', analysisResult.match(/\d+/g));
                
                // Парсим ответ AI и добавляем подходящие сообщения
                if (analysisResult !== 'нет' && analysisResult.match(/\d/)) {
                    const matchedNumbers = analysisResult.match(/\d+/g);
                    if (matchedNumbers) {
                        matchedNumbers.forEach(num => {
                            const messageIndex = parseInt(num) - 1;
                            const globalIndex = i + (messageIndex - i);
                            if (messages[globalIndex]) {
                                filteredMessages.push(messages[globalIndex]);
                            }
                        });
                    }
                }
            }
            console.log('Итоговый результат:', {
                filteredMessages: filteredMessages,
                originalCount: messages.length,
                filteredCount: filteredMessages.length
            });
            
            return {
                filteredMessages: filteredMessages,
                originalCount: messages.length,
                filteredCount: filteredMessages.length,
                summary: `Из ${messages.length} сообщений найдено ${filteredMessages.length} соответствующих промпту: "${userPrompt}"`
            };
            
        } catch (error) {
            console.error('Ошибка анализа AI:', error);
            throw error;
        }
    }
}

module.exports = AIAnalyzer;