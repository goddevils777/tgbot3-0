const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode'); // Добавь эту строку

class SessionManager {
    constructor() {
        this.sessions = new Map(); // Хранилище активных сессий
        this.currentSessionId = null;
        this.sessionsDir = './sessions'; // Папка для хранения файлов сессий
        this.qrSessions = new Map(); // Добавь эту строку
        
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

            // Устанавливаем как текущую сессию
            this.currentSessionId = sessionId;
            
            // Сохраняем как последнюю сессию
            this.saveLastSessionId(sessionId);

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
            
            // Автоподключение к последней сессии
            setTimeout(async () => {
                await this.autoConnectToLastSession();
            }, 1000);
            
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

    // Генерация QR-кода для авторизации
    async generateQRCode(sessionName) {
        try {
            const token = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            
            // Создаем временную сессию для QR авторизации
            const session = new StringSession('');
            const client = new TelegramClient(session, config.apiId, config.apiHash, {
                connectionRetries: 5,
            });

            console.log('Генерируем QR-код для авторизации...');
            
            // Правильный способ QR авторизации
            const qrCodePromise = client.signInUserWithQrCode(
                { apiId: config.apiId, apiHash: config.apiHash },
                {
                    qrCode: async (qrCode) => {
                        console.log('QR-код получен:', qrCode.token);
                        
                        // Сохраняем данные QR сессии
                        const qrSession = this.qrSessions.get(token);
                        if (qrSession) {
                            qrSession.qrToken = qrCode.token;
                            qrSession.qrCode = qrCode;
                        }
                        
                        return qrCode.token;
                    },
                    password: async () => {
                        console.log('Требуется пароль для QR авторизации');
                        return ''; // Возвращаем пустой пароль - обычно не требуется для QR
                    },
                    onError: (err) => console.log('QR Auth Error:', err),
                }
            );
            
            // Создаем временный токен QR для мониторинга
            const tempQRToken = `qr_${Date.now()}`;
            
            // Сохраняем данные QR сессии
            this.qrSessions.set(token, {
                sessionName: sessionName,
                client: client,
                session: session,
                qrCodePromise: qrCodePromise,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + (2 * 60 * 1000), // 2 минуты
                qrToken: tempQRToken
            });
            
            // Генерируем QR-код изображение
            // Генерируем QR-код изображение
            const qrCodeUrl = await this.generateQRCodeImage(tempQRToken);
            
            console.log('QR-код сгенерирован, токен:', token);
            
            // Запускаем мониторинг авторизации
            this.monitorQRAuth(token);
            
            return {
                success: true,
                token: token,
                qrCodeUrl: qrCodeUrl
            };
            
        } catch (error) {
            console.error('Ошибка генерации QR-кода:', error);
            return { success: false, error: error.message };
        }
    }

    // Мониторинг QR авторизации
    async monitorQRAuth(token) {
        const qrSession = this.qrSessions.get(token);
        if (!qrSession) return;
        
        const checkAuth = async () => {
            try {
                // Проверяем не истек ли QR-код
                if (Date.now() > qrSession.expiresAt) {
                    qrSession.status = 'expired';
                    return;
                }
                
                // Проверяем статус авторизации
                const authResult = await qrSession.qrCodeData();
                
                if (authResult) {
                    // Авторизация успешна
                    console.log('QR авторизация успешна');
                    
                    const sessionId = Date.now().toString();
                    const sessionData = {
                        id: sessionId,
                        name: qrSession.sessionName,
                        phone: authResult.user.phone || 'QR Auth',
                        createdAt: new Date().toISOString(),
                        sessionString: qrSession.session.save(),
                        client: qrSession.client,
                        isConnected: true,
                        connectedAt: new Date().toISOString()
                    };
                    
                    // Сохраняем сессию
                    this.sessions.set(sessionId, sessionData);
                    this.saveSessionData(sessionId, sessionData);
                    this.currentSessionId = sessionId;
                    this.saveLastSessionId(sessionId);
                    
                    qrSession.status = 'authorized';
                    qrSession.sessionId = sessionId;
                    
                    console.log(`QR сессия создана: ${qrSession.sessionName}`);
                    return;
                }
                
                // Продолжаем проверку через 2 секунды
                if (qrSession.status === 'pending') {
                    setTimeout(checkAuth, 2000);
                }
                
            } catch (error) {
                console.error('Ошибка мониторинга QR авторизации:', error);
                qrSession.status = 'error';
            }
        };
        
        checkAuth();
    }

    // Проверка статуса QR авторизации
    async checkQRStatus(token) {
        const qrSession = this.qrSessions.get(token);
        
        if (!qrSession) {
            return { status: 'expired' };
        }
        
        // Проверяем не истек ли токен
        if (Date.now() > qrSession.expiresAt) {
            qrSession.status = 'expired';
            this.qrSessions.delete(token);
        }
        
        return {
            status: qrSession.status,
            sessionId: qrSession.sessionId || null
        };
    }

    // Отмена QR авторизации
    async cancelQRCode(token) {
        const qrSession = this.qrSessions.get(token);
        
        if (qrSession) {
            try {
                if (qrSession.client) {
                    await qrSession.client.disconnect();
                }
            } catch (error) {
                console.error('Ошибка отключения QR клиента:', error);
            }
            
            this.qrSessions.delete(token);
            console.log('QR авторизация отменена:', token);
        }
    }

    // Генерация простого SVG QR-кода (заглушка)
    generateQRSVG(token) {
        return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="200" height="200" fill="white"/>
            <text x="100" y="100" text-anchor="middle" font-family="Arial" font-size="12" fill="black">
                QR Code: ${token.substr(0, 20)}...
            </text>
            <text x="100" y="120" text-anchor="middle" font-family="Arial" font-size="10" fill="gray">
                Scan in Telegram
            </text>
        </svg>`;
    }

    // Генерация QR-кода как Data URL
    async generateQRCodeImage(token) {
        try {
            const qrCodeDataURL = await QRCode.toDataURL(token, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            return qrCodeDataURL;
        } catch (error) {
            console.error('Ошибка генерации QR-кода:', error);
            // Возвращаем заглушку в случае ошибки
            return `data:image/svg+xml;base64,${Buffer.from(this.generateQRSVG(token)).toString('base64')}`;
        }
    }
}

module.exports = SessionManager;