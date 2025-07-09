const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const config = require('../config');

class TelegramClientAPI {
    constructor() {
        const fs = require('fs');
        const path = './telegram_session.txt';
        
        let sessionString = '';
        if (fs.existsSync(path)) {
            sessionString = fs.readFileSync(path, 'utf8');
        }
        
        this.session = new StringSession(sessionString);
        this.client = new TelegramClient(this.session, config.apiId, config.apiHash, {
            connectionRetries: 5,
        });
        this.isConnected = false;
    }

    async connect() {
        try {
            await this.client.start({
                phoneNumber: async () => await input.text('Введи номер телефона: '),
                password: async () => await input.text('Введи пароль (если есть): '),
                phoneCode: async () => await input.text('Введи код из SMS: '),
                onError: (err) => console.log(err),
            });
            
            this.isConnected = true;
            
            // Сохраняем сессию в файл
            const fs = require('fs');
            fs.writeFileSync('./telegram_session.txt', this.session.save());
            
            console.log('Telegram Client подключен');
            return true;
        } catch (error) {
            console.error('Ошибка подключения:', error);
            return false;
        }
    }
    
    async getChats() {
        if (!this.isConnected) {
            console.log('Клиент не подключен');
            return [];
        }

        try {
            const dialogs = await this.client.getDialogs();
            const chats = [];
            
            for (const dialog of dialogs) {
                // Проверяем, можно ли писать в чат
                if (dialog.entity && !dialog.entity.left && !dialog.entity.kicked) {
                    if (dialog.isGroup || (dialog.isChannel && !dialog.entity.broadcast)) {
                        // Получаем информацию о количестве участников
                        let participantsCount = 0;
                        try {
                            if (dialog.entity.participantsCount) {
                                participantsCount = dialog.entity.participantsCount;
                            } else if (dialog.entity.membersCount) {
                                participantsCount = dialog.entity.membersCount;
                            }
                        } catch (e) {
                            // Если не удается получить количество, попробуем получить полную информацию
                            try {
                                const fullChat = await this.client.getEntity(dialog.id);
                                participantsCount = fullChat.participantsCount || fullChat.membersCount || 0;
                            } catch (err) {
                                participantsCount = 0;
                            }
                        }

                        chats.push({
                            id: dialog.id,
                            name: dialog.title || dialog.name,
                            type: dialog.isGroup ? 'group' : 'channel',
                            participantsCount: participantsCount
                        });
                    }
                }
            }
            
            return chats;
        } catch (error) {
            console.error('Ошибка получения чатов:', error);
            return [];
        }
    }

    async searchMessages(keywords, groups, limit) {
        
        if (!this.isConnected) {
            
            return [];
        }

        try {
            const results = [];
            
        for (const group of groups) {
            console.log(`\n=== Поиск в группе: ${group.name} (ID: ${group.id}) ===`);
            console.log(`Ключевые слова для поиска: ${keywords.join(', ')}`);
            
            // Получаем больше сообщений, чтобы найти обычные текстовые
            const messages = await this.client.getMessages(group.id, {
                limit: 100 // Получаем последние 100 сообщений
            });

            console.log(`Получено всего сообщений: ${messages.length}`);

            // Показываем последние 5 сообщений для отладки
            console.log('Последние 5 сообщений:');
            messages.slice(0, 5).forEach((msg, index) => {
                console.log(`  ${index + 1}. ID: ${msg.id}, className: ${msg.className}, message: "${msg.message}"`);
            });
            
            console.log(`Получено сообщений из ${group.name}: ${messages.length}`);
            
            let foundInGroup = 0;
            for (const message of messages) {
                // Отладка: показываем каждое сообщение
                console.log(`  Сообщение ID ${message.id}:`);
                console.log(`  Все свойства:`, Object.keys(message));
                console.log(`  Тип сообщения:`, typeof message);
                console.log(`  message.text:`, message.text);
                console.log(`  message.message:`, message.message);

                // Попробуем разные способы получения текста
                let messageText = '';
                if (message.text) {
                    messageText = message.text;
                } else if (message.message) {
                    messageText = message.message;
                } else if (message.raw_text) {
                    messageText = message.raw_text;
                } else {
                    // Выводим весь объект для анализа
                    console.log(`  Полный объект сообщения:`, JSON.stringify(message, null, 2));
                }

                console.log(`  Итоговый текст: "${messageText}"`);

                
                const containsKeyword = keywords.some(keyword => {
                    const found = messageText.includes(keyword.toLowerCase());
                    console.log(`  Проверка "${keyword.toLowerCase()}" в "${messageText}": ${found}`);
                    return found;
                });
                
                if ((message.text || message.message || message.caption) && containsKeyword) {
                    console.log(`  ✅ НАЙДЕНО СОВПАДЕНИЕ!`);
                    foundInGroup++;
                    const messageDate = new Date(message.date * 1000);
                    results.push({
                        id: message.id,
                        groupName: group.name,
                        text: message.text,
                        date: messageDate.toLocaleString('ru-RU'),
                        timestamp: messageDate.getTime(),
                        sender: message.sender ? (
                            message.sender.username ? `@${message.sender.username}` :
                            message.sender.phone ? `+${message.sender.phone}` :
                            message.sender.firstName ? message.sender.firstName :
                            'Аноним'
                        ) : 'Аноним',
                        link: (() => {
                            const groupIdStr = String(Math.abs(group.id));
                            const chatId = groupIdStr.startsWith('100') ? groupIdStr.substring(3) : groupIdStr;
                            return `https://t.me/c/${chatId}/${message.id}`;
                        })()
                    });
                }
            }
            
            console.log(`Найдено в группе ${group.name}: ${foundInGroup} сообщений`);
        }

            results.sort((a, b) => b.timestamp - a.timestamp);
            return results.slice(0, limit);
        } catch (error) {
            
            return [];
        }
    }
    
        async autoSearchMessages(keywords, groupId, groupName, lastMessageId) {
          
            
            if (!this.isConnected) {
                console.log('Клиент не подключен');
                return [];
            }

            try {
            // Получаем только самые новые сообщения (лимит 5)
            const messages = await this.client.getMessages(groupId, {
                limit: 5
            });
            
            const results = [];
            
            for (const message of messages) {
                // ВАЖНО: берем только сообщения новее lastMessageId
                if (message.id <= lastMessageId) continue;
                
                
                // Проверяем, содержит ли сообщение хотя бы одно из ключевых слов
                const messageText = message.text ? message.text.toLowerCase() : '';
                const containsKeyword = keywords.some(keyword => 
                    messageText.includes(keyword.toLowerCase())
                );
                
                if (message.text && containsKeyword) {
                    console.log(`Найдено совпадение для сообщения ID: ${message.id}`);
                    const messageDate = new Date(message.date * 1000);
                    results.push({
                        id: message.id,
                        groupName: groupName,
                        text: message.text,
                        date: messageDate.toLocaleString('ru-RU'),
                        timestamp: messageDate.getTime(),
                        sender: message.sender ? (
                            message.sender.username ? `@${message.sender.username}` :
                            message.sender.phone ? `+${message.sender.phone}` :
                            message.sender.firstName ? message.sender.firstName :
                            'Аноним'
                        ) : 'Аноним',
                        link: (() => {
                            const groupIdStr = String(Math.abs(groupId));
                            const chatId = groupIdStr.startsWith('100') ? groupIdStr.substring(3) : groupIdStr;
                            return `https://t.me/c/${chatId}/${message.id}`;
                        })()
                    });
                }
            }
            
  
            return results;
        } catch (error) {
            
            return [];
        }
    }
        async getLastMessageId(groupId) {
        if (!this.isConnected) {
            console.log('Клиент не подключен');
            return 0;
        }

        try {
            // Получаем только 1 последнее сообщение
            const messages = await this.client.getMessages(groupId, {
                limit: 1
            });
            
            if (messages.length > 0) {
                return messages[0].id;
            }
            
            return 0;
        } catch (error) {
            console.error('Ошибка получения последнего ID сообщения:', error);
            return 0;
        }
    }
}


module.exports = TelegramClientAPI;