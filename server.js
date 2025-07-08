const express = require('express');
const TelegramClient = require('./src/telegram');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/src', express.static('src'));

const telegram = new TelegramClient();

// API для поиска сообщений
app.post('/api/search', async (req, res) => {
    try {
        const { keyword, groups, limit } = req.body;
        
        // Валидация
        if (!keyword || keyword.length < 2) {
            return res.json({ 
                success: false, 
                error: 'Ключевое слово должно содержать минимум 2 символа' 
            });
        }
        
        if (!groups || groups.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Выберите хотя бы одну группу' 
            });
        }
        
        if (limit < 1 || limit > 10000) {
            return res.json({ 
                success: false, 
                error: 'Количество сообщений должно быть от 1 до 1000' 
            });
        }
        
        // Временные тестовые данные
        const testResults = [
            {
                id: 1,
                groupName: groups[0]?.name || 'Test Group',
                text: `Это тестовое сообщение с ${keyword} для проверки`,
                date: new Date().toLocaleString('ru-RU')
            },
            {
                id: 2,
                groupName: groups[0]?.name || 'Test Group',
                text: `Ещё одно сообщение где упоминается ${keyword} в тексте`,
                date: new Date().toLocaleString('ru-RU')
            }
        ];
        
        res.json({ success: true, results: testResults });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API для получения групп
app.get('/api/groups', async (req, res) => {
    // Пока возвращаем тестовые данные
    res.json({ success: true, groups: [] });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});