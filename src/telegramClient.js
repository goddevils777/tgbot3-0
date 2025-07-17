const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const config = require('../config');

class TelegramClientAPI {
    constructor(client) {
        this.client = client; // Используем переданный клиент
        this.isConnected = true; // Клиент уже подключен
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
            console.log('Клиент не подключен, возвращаем пустой массив');
            return [];
        }

        try {
            
    

            // Используем правильную проверку
            // Используем правильную проверку
            if (!this.client._connected) {
                console.log('Клиент отключен, создаем новый клиент с той же сессией...');
                
                // Получаем сессию из текущего клиента
                const sessionString = this.client.session.save();
                console.log('SessionString получен, длина:', sessionString.length);
                
                // Создаем новый клиент с той же сессией
                const { StringSession } = require('telegram/sessions');
                const session = new StringSession(sessionString);
                const newClient = new TelegramClient(session, config.apiId, config.apiHash, {
                    connectionRetries: 5,
                });
                
                await newClient.connect();
                this.client = newClient; // Заменяем клиент
                console.log('Новый клиент создан и подключен');
            }
            
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

    async getChannels() {
        if (!this.isConnected) {
            return [];
        }

        try {
            const dialogs = await this.client.getDialogs();
            const channels = [];
            
            for (const dialog of dialogs) {
                // Ищем только каналы (не группы)
                if (dialog.isChannel && dialog.entity && !dialog.entity.left && !dialog.entity.kicked) {
                    // Проверяем что это именно канал, а не супергруппа
                    if (dialog.entity.broadcast) {
                        let subscribersCount = 0;
                        try {
                            if (dialog.entity.participantsCount) {
                                subscribersCount = dialog.entity.participantsCount;
                            } else if (dialog.entity.membersCount) {
                                subscribersCount = dialog.entity.membersCount;
                            }
                        } catch (e) {
                            try {
                                const fullChannel = await this.client.getEntity(dialog.id);
                                subscribersCount = fullChannel.participantsCount || fullChannel.membersCount || 0;
                            } catch (err) {
                                subscribersCount = 0;
                            }
                        }

                        channels.push({
                            id: dialog.id,
                            name: dialog.title || dialog.name,
                            type: 'channel',
                            subscribersCount: subscribersCount
                        });
                    }
                }
            }
            
            
            return channels;
        } catch (error) {
            console.error('Ошибка получения каналов:', error);
            return [];
        }
    }

    async searchMessages(keywords, groups, limit) {
    if (!this.isConnected) {
        console.log('❌ Клиент не подключен');
        return [];
    }

    try {
        const results = [];
        let processedGroups = 0;
        const totalGroups = groups.length;
        
        console.log(`🚀 Начинаем поиск в ${totalGroups} группах по ключевым словам: ${keywords.join(', ')}`);
        
        for (const group of groups) {
            console.log(`🔍 Поиск в группе "${group.name}" (${processedGroups + 1}/${totalGroups})`);
            
            const groupId = parseInt(group.id);
            
            try {
                // Получаем сообщения с правильным лимитом
                const messages = await this.client.getMessages(groupId, {
                    limit: Math.max(limit * 2, 200)
                });

                console.log(`📨 Получено ${messages.length} сообщений из группы "${group.name}"`);
                
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
                    const containsKeyword = keywords.some(keyword => {
                        const keywordLower = keyword.toLowerCase().trim();
                        
                        // Ищем как отдельное слово с учётом русских символов
                        const patterns = [
                            // Слово в начале строки или после пробела/знака препинания
                            new RegExp(`(^|[\\s\\n\\r\\t.,!?;:'"(){}\\[\\]<>«»""\\/\\-])${keywordLower}($|[\\s\\n\\r\\t.,!?;:'"(){}\\[\\]<>«»""\\/\\-])`, 'i'),
                            // Дополнительная проверка для коротких слов
                            keywordLower.length <= 3 ? new RegExp(`\\s${keywordLower}\\s`, 'i') : null
                        ].filter(Boolean);
                        
                        return patterns.some(pattern => pattern.test(' ' + lowerMessageText + ' '));
                    });

                    // Добавь после проверки ключевых слов:
                    if (containsKeyword) {
                        console.log(`Найдено совпадение: "${messageText.substring(0, 100)}..."`);
                    }


                                        
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
                
                processedGroups++;
                console.log(`✅ Группа "${group.name}" обработана (${processedGroups}/${totalGroups}). Найдено: ${foundInGroup} сообщений`);
                
                // Небольшая пауза между группами
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                processedGroups++;
                console.error(`❌ Ошибка в группе "${group.name}":`, error.message);
                
                // Если это flood wait, показываем время ожидания
                if (error.message.includes('flood wait') || error.message.includes('FLOOD_WAIT')) {
                    const waitTime = error.seconds || 'неизвестно';
                    console.log(`⏳ ОЖИДАНИЕ ${waitTime} секунд из-за ограничений Telegram. Поиск продолжится автоматически...`);
                    console.log(`📊 Прогресс: ${processedGroups}/${totalGroups} групп обработано`);
                }
                
                // Даже при ошибке ждём перед следующей группой
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`🎉 Поиск завершен! Всего найдено ${results.length} сообщений в ${totalGroups} группах`);
        
        results.sort((a, b) => b.timestamp - a.timestamp);
        return results.slice(0, limit);
        
    } catch (error) {
        console.error('💥 Общая ошибка поиска:', error);
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

        async checkLiveStream(channelId, channelName) {
        if (!this.isConnected) {
            return { isLive: false, streamInfo: null, participants: [] };
        }

        try {
            const channelIdNum = parseInt(channelId);
            console.log(`Проверяем стрим в канале: ${channelName} (ID: ${channelIdNum})`);
            
            let isLive = false;
            let streamInfo = null;
            
            // Проверяем активный групповой звонок через API
            try {
                const entity = await this.client.getEntity(channelIdNum);
                const fullChannel = await this.client.invoke(new Api.channels.GetFullChannel({
                    channel: entity
                }));
                
                // Проверяем наличие активного звонка
                if (fullChannel.fullChat.call) {
                    isLive = true;
                    streamInfo = {
                        channelName: channelName,
                        callId: fullChannel.fullChat.call.id,
                        participantsCount: fullChannel.fullChat.call.participantsCount || 0,
                        startTime: new Date().toISOString()
                    };
                    console.log('Найден активный групповой звонок!');
                } else {
                    console.log('Активный групповой звонок не найден');
                    
                    // Резервная проверка через сообщения
                    const messages = await this.client.getMessages(channelIdNum, {
                        limit: 20
                    });
                    
                    for (const message of messages) {
                        if (message.action && 
                            message.action.className === 'MessageActionGroupCall' &&
                            !message.action.call?.ended) { // Проверяем что звонок не завершен
                            // Проверяем, что сообщение недавнее
                            const messageDate = new Date(message.date * 1000);
                            const now = new Date();
                            const hoursDiff = (now - messageDate) / (1000 * 60 * 60);

                            console.log(`Дата сообщения: ${messageDate.toLocaleString()}`);
                            console.log(`Текущее время: ${now.toLocaleString()}`);
                            console.log(`Разница в часах: ${hoursDiff.toFixed(2)}`);
                            console.log(`Разница в минутах: ${Math.round(hoursDiff * 60)}`);
                            
                            if (hoursDiff < 0.02) {
                                isLive = true;
                                streamInfo = {
                                    channelName: channelName,
                                    messageId: message.id,
                                    startTime: messageDate.toISOString()
                                };
                                console.log(`Найден недавний групповой звонок через сообщения (${Math.round(hoursDiff * 60)} мин назад)!`);
                                break;
                            } else {
                                console.log(`Сообщение о звонке слишком старое (${Math.round(hoursDiff * 60)} мин назад), пропускаем`);
                            }
                        }
                    }
                }
            } catch (callError) {
                console.log('Ошибка проверки группового звонка:', callError.message);
            }
            
            let participants = [];
            
            if (isLive) {
                console.log('Стрим активен, пытаемся получить участников...');
                try {
                    console.log('Пытаемся получить участников через разные методы...');
                    
                    // Метод 1: Попробуем получить участников канала
                    const result = await this.client.invoke(
                        new Api.channels.GetParticipants({
                            channel: channelIdNum,
                            filter: new Api.ChannelParticipantsRecent(),
                            offset: 0,
                            limit: 200,
                            hash: 0
                        })
                    );
                    
                    if (result.users && result.users.length > 0) {
                        console.log(`Найдено участников: ${result.users.length}`);
                        participants = result.users.map(user => ({
                            id: user.id,
                            name: user.firstName ? 
                                (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) 
                                : null,
                            username: user.username || null,
                            phone: user.phone || null
                        }));
                    }
                } catch (participantsError) {
                    console.log('Ошибка получения участников:', participantsError.message);
                    participants = [];
                }
            } else {
                console.log('Активный стрим не обнаружен');
            }
            
            const result = {
                isLive: isLive,
                streamInfo: streamInfo,
                participants: participants
            };
            
            // Если стрим закончился, сообщаем об этом
            if (!isLive) {
                result.streamEnded = true;
                result.message = 'Live Stream завершен';
                console.log(`Live Stream в канале ${channelId} завершен`);
            }
            
            return result;
            
        } catch (error) {
            console.error('Ошибка проверки live stream:', error);
            return { 
                isLive: false, 
                streamInfo: null, 
                participants: [],
                streamEnded: true,
                message: 'Ошибка проверки стрима'
            };
        }
    }

    async getStreamParticipants(channelId) {
        try {
            console.log('Пытаемся получить участников через разные методы...');
            
            // Метод 1: Попробуем получить участников канала
            try {
                const result = await this.client.invoke(
                    new Api.channels.GetParticipants({
                        channel: channelId,
                        filter: new Api.ChannelParticipantsRecent(),
                        offset: 0,
                        limit: 200,
                        hash: 0
                    })
                );
                
                if (result.users && result.users.length > 0) {
                    console.log(`Найдено участников канала: ${result.users.length}`);
                    return result.users.map(user => ({
                        id: user.id,
                        name: user.firstName ? 
                            (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) 
                            : null,
                        username: user.username || null,
                        phone: user.phone || null
                    }));
                }
            } catch (e) {
                console.log('Метод 1 не удался:', e.message);
            }
            
            // Метод 2: Попробуем получить участников группового звонка
            try {
                const callResult = await this.client.invoke(
                    new Api.phone.GetGroupCall({
                        call: channelId,
                        limit: 100
                    })
                );
                
                if (callResult.users && callResult.users.length > 0) {
                    console.log(`Найдено участников звонка: ${callResult.users.length}`);
                    return callResult.users.map(user => ({
                        id: user.id,
                        name: user.firstName ? 
                            (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName) 
                            : null,
                        username: user.username || null,
                        phone: user.phone || null
                    }));
                }
            } catch (e) {
                console.log('Метод 2 не удался:', e.message);
            }
            
            // Метод 3: Попробуем получить активных пользователей
            try {
                const entity = await this.client.getEntity(channelId);
                console.log('Информация о канале получена');
                return [];
            } catch (e) {
                console.log('Метод 3 не удался:', e.message);
            }
            
            console.log('Все методы получения участников не удались');
            return [];
            
        } catch (error) {
            console.error('Общая ошибка получения участников:', error);
            return [];
        }
    }

    // Задержка для избежания лимитов
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Проверка статуса стрима
    async checkStreamStatus(channelId) {
        try {
            const entity = await this.client.getEntity(channelId);
            const fullChannel = await this.client(new Api.channels.GetFullChannel({
                channel: entity
            }));
            
            // Проверяем есть ли активная трансляция
            const hasLiveStream = fullChannel.fullChat.call ? true : false;
            
            return {
                isActive: hasLiveStream,
                info: hasLiveStream ? {
                    title: fullChannel.fullChat.call?.title || 'Live Stream',
                    participantsCount: fullChannel.fullChat.call?.participantsCount || 0
                } : null
            };
        } catch (error) {
            console.error('Ошибка проверки статуса стрима:', error);
            return {
                isActive: false,
                info: null
            };
        }
    }
}

module.exports = TelegramClientAPI;