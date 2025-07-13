const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class RequestManager {
    constructor() {
        this.requestsDir = './requests'; // Папка для заявок
        
        // Создаем папку для заявок если её нет
        if (!fs.existsSync(this.requestsDir)) {
            fs.mkdirSync(this.requestsDir);
        }
    }

    // Генерация уникального ID заявки
    generateRequestId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }

    // Создание новой заявки
    createRequest(userId, sessionName, phoneNumber) {
        try {
            const requestId = this.generateRequestId();
            
            const requestData = {
                id: requestId,
                userId: userId,
                sessionName: sessionName,
                phoneNumber: phoneNumber,
                status: 'pending', // pending, processing, completed, rejected
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            const requestFile = path.join(this.requestsDir, `${requestId}.json`);
            fs.writeFileSync(requestFile, JSON.stringify(requestData, null, 2));
            
            console.log(`Создана заявка: ${requestId} для пользователя ${userId}`);
            return { success: true, requestId: requestId };
            
        } catch (error) {
            console.error('Ошибка создания заявки:', error);
            return { success: false, error: error.message };
        }
    }

    // Получение заявки по ID
    getRequest(requestId) {
        try {
            const requestFile = path.join(this.requestsDir, `${requestId}.json`);
            
            if (!fs.existsSync(requestFile)) {
                return null;
            }
            
            return JSON.parse(fs.readFileSync(requestFile, 'utf8'));
        } catch (error) {
            console.error('Ошибка получения заявки:', error);
            return null;
        }
    }

    // Обновление статуса заявки
    updateRequestStatus(requestId, status, notes = '') {
        try {
            const requestData = this.getRequest(requestId);
            if (!requestData) {
                return { success: false, error: 'Заявка не найдена' };
            }
            
            requestData.status = status;
            requestData.updatedAt = new Date().toISOString();
            if (notes) {
                requestData.notes = notes;
            }
            
            const requestFile = path.join(this.requestsDir, `${requestId}.json`);
            fs.writeFileSync(requestFile, JSON.stringify(requestData, null, 2));
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Получение всех заявок для админа
    getAllRequests() {
        try {
            const files = fs.readdirSync(this.requestsDir);
            const requests = [];
            
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    const requestData = JSON.parse(fs.readFileSync(path.join(this.requestsDir, file), 'utf8'));
                    requests.push(requestData);
                }
            });
            
            // Сортируем по дате создания (новые сверху)
            requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return requests;
        } catch (error) {
            console.error('Ошибка получения списка заявок:', error);
            return [];
        }
    }

    // Получение заявок пользователя
    getUserRequests(userId) {
        try {
            const allRequests = this.getAllRequests();
            return allRequests.filter(request => request.userId === userId);
        } catch (error) {
            console.error('Ошибка получения заявок пользователя:', error);
            return [];
        }
    }
    // Список админов (логины)
    getAdminLogins() {
        return ['avue']; // Добавь нужные логины
    }

    // Проверка админских прав
    isAdmin(userLogin) {
        const adminLogins = this.getAdminLogins();
        return adminLogins.includes(userLogin.toLowerCase());
    }

    // Проверка админских прав по userId
    isAdminByUserId(userId, userManager) {
        try {
            const userInfo = userManager.getUserInfo(userId);
            if (!userInfo) return false;
            
            return this.isAdmin(userInfo.login);
        } catch (error) {
            return false;
        }
    }
    // Удаление заявки
    deleteRequest(requestId) {
        try {
            const requestFile = path.join(this.requestsDir, `${requestId}.json`);
            
            if (!fs.existsSync(requestFile)) {
                return { success: false, error: 'Заявка не найдена' };
            }
            
            // Удаляем файл заявки
            fs.unlinkSync(requestFile);
            
            console.log(`Заявка ${requestId} удалена`);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления заявки:', error);
            return { success: false, error: error.message };
        }
    }
}



module.exports = RequestManager;