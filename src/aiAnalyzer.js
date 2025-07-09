const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIAnalyzer {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    async analyzeMessages(messages, userPrompt) {
        try {
            const results = [];
            
            for (const message of messages) {
                const prompt = `${userPrompt}\n\nТекст сообщения: "${message.text}"\n\nОтветь только "ДА" или "НЕТ"`;
                
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text().trim().toUpperCase();
                
                if (text.includes('ДА')) {
                    results.push(message);
                }
            }
            
            return results;
        } catch (error) {
            console.error('Ошибка анализа AI:', error);
            return messages; // Возвращаем все сообщения в случае ошибки
        }
    }
}

module.exports = AIAnalyzer;