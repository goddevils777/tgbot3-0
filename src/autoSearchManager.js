const fs = require('fs');
const path = require('path');

class AutoSearchManager {
    constructor() {
        this.userSearches = new Map(); // userId -> { settings, interval, isActive }
        this.searchResultsDir = './search_results';
        
        // Создаем папку для результатов поиска
        if (!fs.existsSync(this.searchResultsDir)) {
            fs.mkdirSync(this.searchResultsDir);
        }
    }

    // Запуск автопоиска для пользователя (одна сессия)
    async startAutoSearch(userId, sessionId, sessionName, keywords, groups, telegramClient) {
        try {
            console.log(`Запуск автопоиска для пользователя ${userId}, сессия ${sessionName}`);

            // Останавливаем предыдущий автопоиск если есть
            this.stopAutoSearch(userId);

            const searchSettings = {
                userId,
                sessionId,
                sessionName,
                keywords,
                groups,
                telegramClient,
                isActive: true,
                startedAt: new Date().toISOString(),
                lastCheck: null,
                results: []
            };

            // Получаем последние ID сообщений для каждой группы
            const lastMessageIds = new Map();
            for (const group of groups) {
                try {
                    const lastId = await telegramClient.getLastMessageId(group.id);
                    lastMessageIds.set(group.id, lastId);
                
                } catch (error) {
                    console.error(`Ошибка получения последнего ID для ${group.name}:`, error);
                    lastMessageIds.set(group.id, 0);
                }
            }

            searchSettings.lastMessageIds = lastMessageIds;

            // Запускаем интервал проверки (каждые 30 секунд)
            const interval = setInterval(async () => {
                await this.performAutoSearch(userId);
            }, 30000);

            searchSettings.interval = interval;
            this.userSearches.set(userId, searchSettings);

            return { success: true };

        } catch (error) {
            console.error('Ошибка запуска автопоиска:', error);
            return { success: false, error: error.message };
        }
    }

    // Выполнение одного цикла автопоиска
    async performAutoSearch(userId) {
        const searchSettings = this.userSearches.get(userId);
        if (!searchSettings || !searchSettings.isActive) return;

        try {
     
            console.log(`Автопоиск для пользователя ${userId}, сессия ${searchSettings.sessionName}`);
            
            const newResults = [];
            
            for (const group of searchSettings.groups) {
                const lastMessageId = searchSettings.lastMessageIds.get(group.id) || 0;
                
                // Ищем новые сообщения с задержкой между группами
                await this.delay(2000);
                
                const messages = await searchSettings.telegramClient.autoSearchMessages(
                    searchSettings.keywords,
                    group.id,
                    group.name,
                    lastMessageId
                );

                if (messages.length > 0) {
                    console.log(`Найдено ${messages.length} новых сообщений в ${group.name}`);
                    newResults.push(...messages);
                    
                    // Обновляем последний ID сообщения
                    const maxId = Math.max(...messages.map(msg => msg.id));
                    searchSettings.lastMessageIds.set(group.id, maxId);
                }
            }

            if (newResults.length > 0) {
                // Добавляем результаты
                searchSettings.results.push(...newResults);
                
                // Ограничиваем количество сохраняемых результатов (последние 500)
                if (searchSettings.results.length > 500) {
                    searchSettings.results = searchSettings.results.slice(-500);
                }

                this.saveSearchResults(userId, newResults);
                console.log(`Автопоиск ${searchSettings.sessionName}: найдено ${newResults.length} новых сообщений`);
            }

            searchSettings.lastCheck = new Date().toISOString();
            
        } catch (error) {
            console.error(`Ошибка автопоиска для пользователя ${userId}:`, error);
        }
    }

    // Остановка автопоиска пользователя
    stopAutoSearch(userId) {
        const searchSettings = this.userSearches.get(userId);
        
        if (searchSettings) {
            if (searchSettings.interval) {
                clearInterval(searchSettings.interval);
            }
            searchSettings.isActive = false;
            console.log(`Автопоиск остановлен для пользователя ${userId}`);
            this.userSearches.delete(userId);
        }
    }

    // Получение результатов автопоиска пользователя
    getSearchResults(userId) {
        const searchSettings = this.userSearches.get(userId);
        
        if (searchSettings) {
            return {
                success: true,
                results: searchSettings.results,
                isActive: searchSettings.isActive,
                sessionName: searchSettings.sessionName,
                lastCheck: searchSettings.lastCheck,
                startedAt: searchSettings.startedAt
            };
        }
        
        // Если нет активного автопоиска, загружаем сохраненные результаты
        const savedResults = this.loadSavedResults(userId);
        if (savedResults.length > 0) {
            return {
                success: true,
                results: savedResults,
                isActive: false,
                sessionName: 'Сохраненные результаты',
                lastCheck: null,
                startedAt: null
            };
        }
        
        return { success: false, error: 'Автопоиск не найден' };
    }

    // Получение статуса автопоиска пользователя
    getUserAutoSearch(userId) {
        const searchSettings = this.userSearches.get(userId);
        
        if (searchSettings) {
            return {
                userId: userId,
                sessionId: searchSettings.sessionId,
                sessionName: searchSettings.sessionName,
                isActive: searchSettings.isActive,
                lastCheck: searchSettings.lastCheck,
                startedAt: searchSettings.startedAt,
                resultsCount: searchSettings.results.length
            };
        }
        
        return null;
    }

    // Сохранение результатов поиска
    saveSearchResults(userId, newResults) {
        try {
            const userDir = path.join(this.searchResultsDir, userId);
            if (!fs.existsSync(userDir)) {
                fs.mkdirSync(userDir);
            }
            
            const resultsFile = path.join(userDir, 'autosearch_results.json');
            
            // Загружаем существующие результаты
            let allResults = [];
            if (fs.existsSync(resultsFile)) {
                allResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
            }
            
            // Добавляем новые результаты
            allResults.push(...newResults);
            
            // Ограничиваем размер файла (последние 1000 результатов)
            if (allResults.length > 1000) {
                allResults = allResults.slice(-1000);
            }
            
            fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
        } catch (error) {
            console.error('Ошибка сохранения результатов:', error);
        }
    }

    

    // Загрузка сохраненных результатов из файла
    loadSavedResults(userId) {
        try {
            const userDir = path.join(this.searchResultsDir, userId);
            const resultsFile = path.join(userDir, 'autosearch_results.json');
            
            if (fs.existsSync(resultsFile)) {
                const savedResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
                return savedResults || [];
            }
            
            return [];
        } catch (error) {
            console.error('Ошибка загрузки сохраненных результатов:', error);
            return [];
        }
    }

    // Задержка для избежания лимитов
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = AutoSearchManager;