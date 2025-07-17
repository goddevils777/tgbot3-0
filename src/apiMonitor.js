const fs = require('fs');
const path = require('path');

class APIMonitor {
    constructor() {
        this.logsDir = './logs';
        this.apiStats = new Map();
        this.requestCounts = new Map();
        
        // Создаем папку для логов
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir);
        }
    }

    // Логирование API запроса
    logRequest(method, url, userId, responseTime, statusCode) {
        const timestamp = new Date().toISOString();
        const endpoint = this.getEndpointName(url);
        
        // Обновляем статистику
        this.updateStats(endpoint, method, responseTime, statusCode);
        
        // Записываем в файл
        const logEntry = {
            timestamp,
            method,
            endpoint,
            url,
            userId,
            responseTime,
            statusCode
        };
        
        this.writeToFile(logEntry);
    }

    // Получение названия endpoint
    getEndpointName(url) {
        const cleanUrl = url.split('?')[0]; // Убираем query параметры
        return cleanUrl.replace(/\/[0-9a-f]{16}/g, '/:id'); // Заменяем ID на :id
    }

    // Обновление статистики
    updateStats(endpoint, method, responseTime, statusCode) {
        const key = `${method} ${endpoint}`;
        
        if (!this.apiStats.has(key)) {
            this.apiStats.set(key, {
                count: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            });
        }
        
        const stats = this.apiStats.get(key);
        stats.count++;
        stats.totalTime += responseTime;
        stats.avgTime = stats.totalTime / stats.count;
        stats.minTime = Math.min(stats.minTime, responseTime);
        stats.maxTime = Math.max(stats.maxTime, responseTime);
        
        if (statusCode >= 400) {
            stats.errors++;
        }
    }

    // Запись в файл
    writeToFile(logEntry) {
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(this.logsDir, `api-${today}.log`);
        
        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(logFile, logLine);
    }

    // Получение статистики
    getStats() {
        const stats = {};
        
        for (const [endpoint, data] of this.apiStats) {
            stats[endpoint] = {
                ...data,
                avgTime: Math.round(data.avgTime),
                minTime: data.minTime === Infinity ? 0 : data.minTime,
                errorRate: ((data.errors / data.count) * 100).toFixed(2) + '%'
            };
        }
        
        return stats;
    }

    // Получение топ самых используемых API
    getTopEndpoints(limit = 10) {
        const sorted = Array.from(this.apiStats.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit);
            
        return sorted.map(([endpoint, stats]) => ({
            endpoint,
            count: stats.count,
            avgTime: Math.round(stats.avgTime),
            errorRate: ((stats.errors / stats.count) * 100).toFixed(2) + '%'
        }));
    }
}

module.exports = APIMonitor;