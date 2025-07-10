const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const config = require('../config');
const fs = require('fs');
const path = require('path');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // Хранилище активных сессий
        this.currentSessionId = null;
        this.sessionsDir = './sessions'; // Папка для хранения файлов сессий
        
        // Создаем папку для сессий если её нет
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir);
        }
        
        this.loadSavedSessions();
    }

    // Сохранение данных сессии в файл
    saveSessionData(sessionId, sessionData) {
        try {
            const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
            const dataToSave = {
                id: sessionData.id,
                name: sessionData.name,
                phone: sessionData.phone,
                createdAt: sessionData.createdAt,
                sessionString: sessionData.sessionString
            };
            
            fs.writeFileSync(sessionPath, JSON.stringify(dataToSave, null, 2));
        } catch (error) {
            console.error('Ошибка сохранения сессии:', error);
        }
    }

    // Получение списка всех сессий
    getAllSessions() {
        return Array.from(this.sessions.values()).map(session => ({
            id: session.id,
            name: session.name,
            phone: session.phone,
            createdAt: session.createdAt,
            isActive: session.id === this.currentSessionId,
            isConnected: session.isConnected
        }));
    }

    // Получение текущей активной сессии
    getCurrentSession() {
        if (!this.currentSessionId) return null;
        
        const session = this.sessions.get(this.currentSessionId);
        if (!session) return null;
        
        return {
            id: session.id,
            name: session.name,
            phone: session.phone,
            connectedAt: session.connectedAt,
            isConnected: session.isConnected
        };
    }
    
    // Создание новой сессии
    async createSession(name, phone) {
        const sessionId = Date.now().toString();
        
        try {
            // Создаем новую сессию Telegram
            const session = new StringSession('');
            const client = new TelegramClient(session, config.apiId, config.apiHash, {
                connectionRetries: 5,
            });

            console.log(`Создание сессии для ${phone}...`);
            
            await client.start({
                phoneNumber: async () => phone,
                password: async () => await input.text('Введите пароль (если есть): '),
                phoneCode: async () => await input.text('Введите код из SMS: '),
                onError: (err) => console.log(err),
            });

            const sessionData = {
                id: sessionId,
                name: name,
                phone: phone,
                createdAt: new Date().toISOString(),
                sessionString: session.save(),
                client: client,
                isConnected: true,
                connectedAt: new Date().toISOString()
            };

            // Сохраняем в память и файл
            this.sessions.set(sessionId, sessionData);
            this.saveSessionData(sessionId, sessionData);

            console.log(`Сессия ${name} успешно создана`);
            return { success: true, sessionId };

        } catch (error) {
            console.error('Ошибка создания сессии:', error);
            return { success: false, error: error.message };
        }
    }

    // Переключение на другую сессию
    async switchToSession(sessionId) {
        try {
            const sessionData = this.sessions.get(sessionId);
            if (!sessionData) {
                return { success: false, error: 'Сессия не найдена' };
            }

            // Отключаем текущую сессию если есть
            if (this.currentSessionId) {
                await this.disconnectSession(this.currentSessionId);
            }

            // Подключаемся к новой сессии
            const session = new StringSession(sessionData.sessionString);
            const client = new TelegramClient(session, config.apiId, config.apiHash, {
                connectionRetries: 5,
            });

            await client.connect();
            
            // Обновляем данные сессии
            sessionData.client = client;
            sessionData.isConnected = true;
            sessionData.connectedAt = new Date().toISOString();
            
            this.currentSessionId = sessionId;
            
            console.log(`Переключено на сессию: ${sessionData.name}`);
            return { success: true };

        } catch (error) {
            console.error('Ошибка переключения сессии:', error);
            return { success: false, error: error.message };
        }
    }

    // Отключение сессии
    async disconnectSession(sessionId) {
        try {
            const sessionData = this.sessions.get(sessionId);
            if (sessionData && sessionData.client) {
                await sessionData.client.disconnect();
                sessionData.isConnected = false;
                sessionData.client = null;
            }
        } catch (error) {
            console.error('Ошибка отключения сессии:', error);
        }
    }

    // Удаление сессии
    async deleteSession(sessionId) {
        try {
            // Отключаем если подключена
            await this.disconnectSession(sessionId);
            
            // Удаляем из памяти
            this.sessions.delete(sessionId);
            
            // Удаляем файл
            const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
            if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
            }
            
            // Если это была текущая сессия, сбрасываем
            if (this.currentSessionId === sessionId) {
                this.currentSessionId = null;
            }
            
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления сессии:', error);
            return { success: false, error: error.message };
        }
    }

    // Получение активного клиента
    getActiveClient() {
        if (!this.currentSessionId) return null;
        
        const session = this.sessions.get(this.currentSessionId);
        return session && session.isConnected ? session.client : null;
    }
    
    // Загрузка сохраненных сессий при запуске
    loadSavedSessions() {
        try {
            const sessionFiles = fs.readdirSync(this.sessionsDir);
            
            sessionFiles.forEach(file => {
                if (file.endsWith('.json')) {
                    const sessionId = file.replace('.json', '');
                    const sessionPath = path.join(this.sessionsDir, file);
                    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                    
                    this.sessions.set(sessionId, {
                        ...sessionData,
                        client: null,
                        isConnected: false
                    });
                }
            });
            
            console.log(`Загружено ${this.sessions.size} сохраненных сессий`);
        } catch (error) {
            console.error('Ошибка загрузки сессий:', error);
        }
    }
}

module.exports = SessionManager;