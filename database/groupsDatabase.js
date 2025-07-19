const fs = require('fs');
const path = require('path');

class GroupsDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'groups.json');
        this.initDatabase();
    }

    // Инициализация базы данных
    initDatabase() {
        if (!fs.existsSync(this.dbPath)) {
            const initialData = {
                groups: [],
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.dbPath, JSON.stringify(initialData, null, 2));
        }
    }

    // Загрузка данных
    loadData() {
        try {
            return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        } catch (error) {
            console.error('Ошибка загрузки базы групп:', error);
            return { groups: [], lastUpdated: new Date().toISOString() };
        }
    }

    // Сохранение данных
    saveData(data) {
        try {
            data.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Ошибка сохранения базы групп:', error);
            return false;
        }
    }

    // Добавление новой группы
    addGroup(groupData) {
        const data = this.loadData();
        
        // Проверяем, есть ли уже такая группа
        const exists = data.groups.find(g => g.link === groupData.link);
        if (exists) {
            return { success: false, reason: 'exists' };
        }
        
        // Добавляем новую группу
        const newGroup = {
            id: Date.now().toString(),
            ...groupData,
            addedAt: new Date().toISOString(),
            status: 'new'
        };
        
        data.groups.push(newGroup);
        
        if (this.saveData(data)) {
            return { success: true, group: newGroup };
        }
        
        return { success: false, reason: 'save_error' };
    }

    // Получение всех групп
    getAllGroups() {
        const data = this.loadData();
        return data.groups;
    }

    // Поиск групп по ключевому слову
    searchGroups(keyword) {
        const data = this.loadData();
        const searchTerm = keyword.toLowerCase();
        
        return data.groups.filter(group => 
            group.title?.toLowerCase().includes(searchTerm) ||
            group.description?.toLowerCase().includes(searchTerm) ||
            group.source?.toLowerCase().includes(searchTerm)
        );
    }
}

module.exports = GroupsDatabase;