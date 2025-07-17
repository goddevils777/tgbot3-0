const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class UserManager {
    constructor() {
        this.usersDir = './users'; // Папка для данных пользователей
        this.sessions = new Map(); // Активные пользовательские сессии
        
        // Создаем папку для пользователей если её нет
        if (!fs.existsSync(this.usersDir)) {
            fs.mkdirSync(this.usersDir);
        }
    }

    // Генерация уникального ID пользователя
    generateUserId() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Создание нового пользователя
    createUser() {
        const userId = this.generateUserId();
        const userDir = path.join(this.usersDir, userId);
        const sessionsDir = path.join(userDir, 'sessions');
        
        // Создаем папки для пользователя
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir);
        }
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir);
        }
        
        // Сохраняем данные пользователя
        const userData = {
            id: userId,
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
        };
        
        fs.writeFileSync(
            path.join(userDir, 'user.json'), 
            JSON.stringify(userData, null, 2)
        );
        
        console.log(`Создан новый пользователь: ${userId}`);
        return userId;
    }


    // Проверка существования пользователя
    userExists(userId) {
        const usersFile = path.join(this.usersDir, 'users.json');
        
        if (!fs.existsSync(usersFile)) {
            return false;
        }
        
        try {
            const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            
            // Ищем пользователя по userId в данных users.json
            for (const login in users) {
                if (users[login].id === userId) {
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    // Получение пути к папке сессий пользователя
    getUserSessionsDir(userId) {
        return path.join(this.usersDir, userId, 'sessions');
    }

    // Обновление времени последней активности
    updateLastActive(userId) {
        if (!this.userExists(userId)) return;
        
        const userFile = path.join(this.usersDir, userId, 'user.json');
        
        // Проверяем существует ли файл пользователя
        if (!fs.existsSync(userFile)) {
            console.log(`Файл пользователя не найден: ${userFile}`);
            return;
        }
        
        try {
            const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
            userData.lastActiveAt = new Date().toISOString();
            
            fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
        } catch (error) {
            console.error('Ошибка обновления активности пользователя:', error);
        }
    }

    // Регистрация пользователя
    registerUser(login, password) {
        const usersFile = path.join(this.usersDir, 'users.json');
        let users = {};
        
        // Загружаем существующих пользователей
        if (fs.existsSync(usersFile)) {
            users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        }
        
        // Проверяем что логин свободен
        if (users[login]) {
            return { success: false, error: 'Пользователь уже существует' };
        }
        
        const userId = this.generateUserId();
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        
        users[login] = {
            id: userId,
            login: login,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        this.createUserDirectory(userId);
        
        return { success: true, userId: userId };
    }

    // Авторизация пользователя
    loginUser(login, password) {
        const usersFile = path.join(this.usersDir, 'users.json');
        
        if (!fs.existsSync(usersFile)) {
            return { success: false, error: 'Пользователь не найден' };
        }
        
        const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        
        if (!users[login]) {
            return { success: false, error: 'Пользователь не найден' };
        }
        
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        
        if (users[login].password !== hashedPassword) {
            return { success: false, error: 'Неверный пароль' };
        }
        
        // Обновляем время последней активности
        users[login].lastActiveAt = new Date().toISOString();
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        
        return { success: true, userId: users[login].id };
    }


    // Создание директории пользователя
    createUserDirectory(userId) {
        console.log(`Создание директории для пользователя: ${userId}`);
        
        const userDir = path.join(this.usersDir, userId);
        const sessionsDir = path.join(userDir, 'sessions');
        
        // ВАЖНО: НЕ создавай папку userId внутри sessions!
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir);
            console.log(`Создана папка: ${userDir}`);
        }
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir);
            console.log(`Создана папка сессий: ${sessionsDir}`);
        }
        
        // Создаем файл user.json
        const userFile = path.join(userDir, 'user.json');
        if (!fs.existsSync(userFile)) {
            const userData = {
                id: userId,
                createdAt: new Date().toISOString(),
                lastActiveAt: new Date().toISOString()
            };
            
            fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
            console.log(`Создан файл пользователя: ${userFile}`);
        } else {
            console.log(`Файл пользователя уже существует: ${userFile}`);
        }
    }

    // Получение информации о пользователе по userId
    getUserInfo(userId) {
        const usersFile = path.join(this.usersDir, 'users.json');
        
        if (!fs.existsSync(usersFile)) {
            return null;
        }
        
        const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        
        // Ищем пользователя по userId
        for (const login in users) {
            if (users[login].id === userId) {
                return {
                    login: login,
                    userId: userId,
                    createdAt: users[login].createdAt,
                    lastActiveAt: users[login].lastActiveAt
                };
            }
        }
        
        return null;
    }

    // Поиск пользователя по Google ID
    findUserByGoogleId(googleId) {
        const users = this.loadUsers();
        return users.find(user => user.googleId === googleId);
    }

    // Создание пользователя через Google
    createGoogleUser(googleData) {
        const users = this.loadUsers();
        
        // Проверяем не существует ли уже пользователь с таким email
        const existingUser = users.find(user => user.email === googleData.email);
        if (existingUser) {
            // Обновляем существующего пользователя данными Google
            existingUser.googleId = googleData.googleId;
            existingUser.avatar = googleData.avatar;
            existingUser.provider = 'google';
            this.saveUsers(users);
            return existingUser;
        }

        // Создаем нового пользователя
        const newUser = {
            id: this.generateUserId(),
            login: googleData.name.replace(/\s+/g, '').toLowerCase(), // Убираем пробелы из имени
            email: googleData.email,
            name: googleData.name,
            avatar: googleData.avatar,
            googleId: googleData.googleId,
            provider: 'google',
            createdAt: googleData.createdAt,
            isActive: true
        };

        users.push(newUser);
        this.saveUsers(users);
        
        console.log('Создан новый пользователь через Google:', newUser.login);
        return newUser;
    }

    // Получение пользователя по ID
    getUserById(id) {
        const users = this.loadUsers();
        return users.find(user => user.id === id);
    }

    // Обновление данных пользователя
    updateUser(userId, updateData) {
        const users = this.loadUsers();
        const userIndex = users.findIndex(user => user.id === userId);
        
        if (userIndex !== -1) {
            users[userIndex] = { ...users[userIndex], ...updateData };
            this.saveUsers(users);
            return users[userIndex];
        }
        
        return null;
    }

    // Привязка Google аккаунта к существующему пользователю
    linkGoogleAccount(userId, googleData) {
        return this.updateUser(userId, {
            googleId: googleData.googleId,
            avatar: googleData.avatar,
            provider: 'both' // И локальный и Google
        });
    }
    // Загрузка всех пользователей
    loadUsers() {
        const usersFile = path.join(this.usersDir, 'users.json');
        
        if (!fs.existsSync(usersFile)) {
            return [];
        }
        
        try {
            const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            
            // Конвертируем объект в массив
            const usersArray = [];
            for (const login in usersData) {
                usersArray.push({
                    login: login,
                    ...usersData[login]
                });
            }
            
            return usersArray;
        } catch (error) {
            console.error('Ошибка загрузки пользователей:', error);
            return [];
        }
    }

    // Сохранение пользователей
    saveUsers(usersArray) {
        const usersFile = path.join(this.usersDir, 'users.json');
        
        try {
            // Конвертируем массив обратно в объект
            const usersData = {};
            usersArray.forEach(user => {
                const login = user.login;
                const userData = { ...user };
                delete userData.login; // Удаляем login из данных, т.к. он станет ключом
                usersData[login] = userData;
            });
            
            fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));
        } catch (error) {
            console.error('Ошибка сохранения пользователей:', error);
        }
    }

    // Генерация ID для пользователя
    generateUserId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // Создание пользователя через Telegram
    createTelegramUser(telegramData) {
        const users = this.loadUsers();
        
        // Проверяем не существует ли уже пользователь с таким Telegram ID
        const existingUser = users.find(user => user.telegramId === telegramData.telegramId);
        if (existingUser) {
            return existingUser;
        }

        // Создаем нового пользователя
        const newUser = {
            id: this.generateUserId(),
            login: telegramData.username || `user_${telegramData.telegramId}`,
            telegramId: telegramData.telegramId,
            username: telegramData.username,
            firstName: telegramData.firstName,
            lastName: telegramData.lastName,
            name: `${telegramData.firstName || ''} ${telegramData.lastName || ''}`.trim(),
            provider: 'telegram',
            createdAt: new Date().toISOString(),
            isActive: true
        };

        users.push(newUser);
        this.saveUsers(users);
        
        console.log('Создан новый пользователь через Telegram:', newUser.login);
        return newUser;
    }

    // Поиск пользователя по Telegram ID
    findUserByTelegramId(telegramId) {
        const users = this.loadUsers();
        return users.find(user => user.telegramId === telegramId);
    }
    // Получение всех пользователей для админа
    getAllUsers() {
        try {
            const users = this.loadUsers();
            
            // Добавляем дополнительную информацию о каждом пользователе
            const usersWithInfo = users.map(user => {
                const userInfo = this.getUserInfo(user.id);
                const userDir = path.join(this.usersDir, user.id);
                
                // Подсчитываем количество сессий
                const sessionsDir = path.join(userDir, 'sessions');
                let sessionsCount = 0;
                if (fs.existsSync(sessionsDir)) {
                    const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
                    sessionsCount = sessionFiles.length;
                }
                
                return {
                    ...user,
                    lastActiveAt: userInfo ? userInfo.lastActiveAt : user.createdAt,
                    sessionsCount,
                    isBlocked: user.isBlocked || false
                };
            });
            
            // Сортируем по последней активности
            usersWithInfo.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));
            
            return usersWithInfo;
        } catch (error) {
            console.error('Ошибка получения списка пользователей:', error);
            return [];
        }
    }

    // Блокировка/разблокировка пользователя
    toggleUserStatus(userId, action) {
        try {
            const users = this.loadUsers();
            const userIndex = users.findIndex(user => user.id === userId);
            
            if (userIndex === -1) {
                return { success: false, error: 'Пользователь не найден' };
            }
            
            if (action === 'block') {
                users[userIndex].isBlocked = true;
                users[userIndex].blockedAt = new Date().toISOString();
            } else if (action === 'unblock') {
                users[userIndex].isBlocked = false;
                delete users[userIndex].blockedAt;
            } else {
                return { success: false, error: 'Неизвестное действие' };
            }
            
            this.saveUsers(users);
            
            console.log(`Пользователь ${userId} ${action === 'block' ? 'заблокирован' : 'разблокирован'}`);
            return { success: true };
        } catch (error) {
            console.error('Ошибка изменения статуса пользователя:', error);
            return { success: false, error: error.message };
        }
    }

    // Удаление пользователя (полное удаление всех данных)
    deleteUser(userId) {
        try {
            // Удаляем из списка пользователей
            const users = this.loadUsers();
            const filteredUsers = users.filter(user => user.id !== userId);
            this.saveUsers(filteredUsers);
            
            // Удаляем папку пользователя со всеми данными
            const userDir = path.join(this.usersDir, userId);
            if (fs.existsSync(userDir)) {
                fs.rmSync(userDir, { recursive: true, force: true });
            }
            
            console.log(`Пользователь ${userId} полностью удален`);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления пользователя:', error);
            return { success: false, error: error.message };
        }
    }
    // Импорт пользователя из внешнего источника (с обновлением существующих)
    importUser(userData) {
        try {
            const existingUser = this.getUserById(userData.id);
            
            if (existingUser) {
                console.log(`Обновляем существующего пользователя ${userData.id}`);
                // Обновляем данные существующего пользователя
                const users = this.loadUsers();
                const userIndex = users.findIndex(user => user.id === userData.id);
                if (userIndex !== -1) {
                    users[userIndex] = { ...users[userIndex], ...userData, updatedAt: new Date().toISOString() };
                    this.saveUsers(users);
                    console.log(`Пользователь ${userData.id} обновлен`);
                }
            } else {
                console.log(`Создаем нового пользователя ${userData.id}`);
                // Создаем нового пользователя
                const users = this.loadUsers();
                users.push(userData);
                this.saveUsers(users);
                console.log(`Пользователь ${userData.id} создан`);
            }
            
            // Создаем/обновляем папку пользователя
            this.createUserFolder(userData.id);
            
            console.log(`Пользователь ${userData.login || userData.id} успешно импортирован/обновлен`);
            return { success: true };
            
        } catch (error) {
            console.error('Ошибка импорта пользователя:', error);
            return { success: false, error: error.message };
        }
    }
}




module.exports = UserManager;