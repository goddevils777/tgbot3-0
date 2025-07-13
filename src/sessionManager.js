const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode'); // Добавь эту строку

class SessionManager {
        constructor(userSessionsDir = null) {
            this.sessions = new Map();
            this.currentSessionId = null;
            this.userSessionsDir = userSessionsDir || './sessions'; // Устанавливаем дефолтный путь
        }
    
    // Установка пользовательской папки сессий
    async setUserSessionsDir(userSessionsDir) {

        if (this.sessionsDir === userSessionsDir) {
            return;
        }
       
        this.sessionsDir = userSessionsDir;
        
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
            console.log(`Создана папка: ${this.sessionsDir}`);
        }
        
        const savedCurrentSessionId = this.currentSessionId;
        const savedActiveSessionData = savedCurrentSessionId ? this.sessions.get(savedCurrentSessionId) : null; // Исправлено!

        this.sessions.clear();
        this.currentSessionId = null;
        this.loadSavedSessions();

        // Восстанавливаем активную сессию если она есть
        if (savedCurrentSessionId && this.sessions.has(savedCurrentSessionId)) {
            this.currentSessionId = savedCurrentSessionId;
            
            // Восстанавливаем состояние подключения если сессия была активной
            const activeSession = this.sessions.get(savedCurrentSessionId);
            if (activeSession && savedActiveSessionData) {
                activeSession.isConnected = savedActiveSessionData.isConnected;
                activeSession.client = savedActiveSessionData.client;
                activeSession.connectedAt = savedActiveSessionData.connectedAt;
            }
            
            console.log(`Восстановлена активная сессия: ${savedCurrentSessionId}`);
        }
            // ДОБАВЬ ЭТИ СТРОКИ - автоподключение к последней сессии:
        try {
            await this.autoConnectToLastSession();
        } catch (error) {
            console.error('Ошибка автоподключения:', error);
        }
        
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
            this.currentSessionId = sessionId;
            this.saveLastSessionId(sessionId);

            // Устанавливаем сессию как подключенную
            const createdSession = this.sessions.get(sessionId);
            if (createdSession) {
                createdSession.isConnected = true;
            }

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
            console.log(`Начинаем переключение на сессию: ${sessionId}`);
            
            const sessionData = this.sessions.get(sessionId);
            if (!sessionData) {
                console.log('Сессия не найдена в памяти');
                return { success: false, error: 'Сессия не найдена' };
            }

            console.log(`Найдена сессия: ${sessionData.name}, sessionString: ${sessionData.sessionString ? 'есть' : 'нет'}`);

            // Отключаем текущую сессию если есть
            if (this.currentSessionId) {
                console.log(`Отключаем текущую сессию: ${this.currentSessionId}`);
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
            
            // Сохраняем ID последней сессии
            this.saveLastSessionId(sessionId);
            
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
        console.log('getActiveClient вызван, currentSessionId:', this.currentSessionId);
        
        if (!this.currentSessionId) {
            console.log('Нет текущей сессии');
            return null;
        }
        
        const session = this.sessions.get(this.currentSessionId);
        console.log('Найдена сессия:', session ? session.name : 'нет');
        console.log('isConnected:', session ? session.isConnected : 'нет сессии');
        console.log('client:', session && session.client ? 'есть' : 'нет');
        
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

    // Сохранение ID последней сессии
    saveLastSessionId(sessionId) {
        try {
            const lastSessionPath = path.join(this.sessionsDir, 'last_session.txt');
            fs.writeFileSync(lastSessionPath, sessionId);
            console.log(`Последняя сессия сохранена: ${sessionId}`);
        } catch (error) {
            console.error('Ошибка сохранения последней сессии:', error);
        }
    }

    // Загрузка ID последней сессии
    loadLastSessionId() {
        try {
            const lastSessionPath = path.join(this.sessionsDir, 'last_session.txt');
            if (fs.existsSync(lastSessionPath)) {
                const sessionId = fs.readFileSync(lastSessionPath, 'utf8').trim();
                console.log(`Найдена последняя сессия: ${sessionId}`);
                return sessionId;
            }
        } catch (error) {
            console.error('Ошибка загрузки последней сессии:', error);
        }
        return null;
    }

    // Автоподключение к последней сессии
    async autoConnectToLastSession() {
        const lastSessionId = this.loadLastSessionId();
        if (lastSessionId && this.sessions.has(lastSessionId)) {
            console.log('Автоподключение к последней сессии...');
            const result = await this.switchToSession(lastSessionId);
            if (result.success) {
                console.log('Автоподключение успешно');
                return true;
            }
        }
        console.log('Автоподключение не выполнено');
        return false;
    }

    
}

module.exports = SessionManager;