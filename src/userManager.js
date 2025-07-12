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
        const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
        userData.lastActiveAt = new Date().toISOString();
        
        fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
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
        const userDir = path.join(this.usersDir, userId);
        const sessionsDir = path.join(userDir, 'sessions');
        
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir);
        }
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir);
        }
    }
}

module.exports = UserManager;