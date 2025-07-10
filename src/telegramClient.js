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
                            try {
                                const fullChat = await this.client.getEntity(dialog.id);
                                participantsCount = fullChat.participantsCount || fullChat.membersCount || 0;
                            } catch (err) {
                                participantsCount = 0;
                            }
                        }

                        // Показываем только группы с участниками
                        if (participantsCount > 0) {
                            chats.push({
                                id: dialog.id,
                                name: dialog.title || dialog.name,
                                type: dialog.isGroup ? 'group' : 'channel',
                                participantsCount: participantsCount
                            });
                        }
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
            const groupId = parseInt(group.id);
            
            console.log(`\n=== Поиск в группе: ${group.name} (ID: ${groupId}) ===`);
            
            // Получаем сообщения с правильным лимитом
            const messages = await this.client.getMessages(groupId, {
                limit: Math.max(limit * 2, 200) // Получаем в 2 раза больше или минимум 200
            });

            console.log(`Получено сообщений: ${messages.length}`);
            
            let foundInGroup = 0;
            for (const message of messages) {
                // Пропускаем служебные сообщения
                if (message.className === 'MessageService') {
                    continue;
                }
                
                // Получаем текст сообщения
                let messageText = '';
                if (message.message) {
                    messageText = message.message;
                } else if (message.text) {
                    messageText = message.text;
                } else if (message.caption) {
                    messageText = message.caption;
                }

                if (!messageText) continue;

                // Проверяем наличие ключевых слов
                const lowerMessageText = messageText.toLowerCase();
                const containsKeyword = keywords.some(keyword => 
                    lowerMessageText.includes(keyword.toLowerCase())
                );
                
                if (containsKeyword) {
                    foundInGroup++;
                    const messageDate = new Date(message.date * 1000);
                    results.push({
                        id: message.id,
                        groupName: group.name,
                        text: messageText,
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
            
            console.log(`Найдено в группе ${group.name}: ${foundInGroup} сообщений`);
        }

            results.sort((a, b) => b.timestamp - a.timestamp);
            return results.slice(0, limit);
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


        async autoSearchMessages(keywords, groupId, groupName, lastMessageId) {
            if (!this.isConnected) {
                console.log('Клиент не подключен');
                return [];
            }

            try {
                const groupIdNum = parseInt(groupId);
                
                // Получаем только последние 30 сообщений
                const messages = await this.client.getMessages(groupIdNum, {
                    limit: 30
                });
                
                const results = [];
                
                for (const message of messages) {
                    // ВАЖНО: берем только сообщения новее lastMessageId
                    if (message.id <= lastMessageId) continue;
                    
                    // Пропускаем служебные сообщения
                    if (message.className === 'MessageService') continue;
                    
                    // Получаем текст сообщения
                    let messageText = '';
                    if (message.message) {
                        messageText = message.message;
                    } else if (message.text) {
                        messageText = message.text;
                    } else if (message.caption) {
                        messageText = message.caption;
                    }

                    if (!messageText) continue;

                    // Проверяем наличие ключевых слов
                    const lowerMessageText = messageText.toLowerCase();
                    const containsKeyword = keywords.some(keyword => 
                        lowerMessageText.includes(keyword.toLowerCase())
                    );
                    
                    if (containsKeyword) {
                        console.log(`Найдено новое сообщение ID: ${message.id} в группе ${groupName}`);
                        const messageDate = new Date(message.date * 1000);
                        results.push({
                            id: message.id,
                            groupName: groupName,
                            text: messageText,
                            date: messageDate.toLocaleString('ru-RU'),
                            timestamp: messageDate.getTime(),
                            sender: message.sender ? (
                                message.sender.username ? `@${message.sender.username}` :
                                message.sender.phone ? `+${message.sender.phone}` :
                                message.sender.firstName ? message.sender.firstName :
                                'Аноним'
                            ) : 'Аноним',
                            link: (() => {
                                const groupIdStr = String(Math.abs(groupIdNum));
                                const chatId = groupIdStr.startsWith('100') ? groupIdStr.substring(3) : groupIdStr;
                                return `https://t.me/c/${chatId}/${message.id}`;
                            })()
                        });
                    }
                }
                
                return results;
            } catch (error) {
                console.error('Ошибка автопоиска:', error);
                return [];
            }
        }

}


module.exports = TelegramClientAPI;