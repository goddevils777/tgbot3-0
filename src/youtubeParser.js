const { google } = require('googleapis');

class YouTubeParser {
    constructor() {
        this.youtube = google.youtube({
            version: 'v3',
            auth: process.env.YOUTUBE_API_KEY
        });
    }


// Поиск видео по ключевому слову
async searchVideos(keyword, maxResults = 200, options = {}) {
    try {
        console.log(`YouTube поиск по ключевику: "${keyword}"`);
        
        const allVideos = [];
        const maxPerRequest = 50; // Максимум за один запрос
        let nextPageToken = null;
        let totalRequested = 0;
        
        while (totalRequested < maxResults) {
            const remainingResults = Math.min(maxPerRequest, maxResults - totalRequested);
            
            const searchParams = {
                part: 'snippet',
                q: keyword,
                type: 'video',
                maxResults: remainingResults,
                order: 'relevance',
                videoDuration: 'medium' // Исключает короткие видео (< 4 мин)
            };
            
            // Добавляем токен следующей страницы
            if (nextPageToken) {
                searchParams.pageToken = nextPageToken;
            }
            
            // Добавляем фильтры дат если есть
            if (options.publishedAfter) {
                searchParams.publishedAfter = options.publishedAfter;
            }
            if (options.publishedBefore) {
                searchParams.publishedBefore = options.publishedBefore;
            }
            
            console.log(`Запрос ${Math.floor(totalRequested/50) + 1}: получаем ${remainingResults} видео`);
            
            const response = await this.youtube.search.list(searchParams);
            
            if (response.data.items && response.data.items.length > 0) {
                allVideos.push(...response.data.items);
                totalRequested += response.data.items.length;
                
                console.log(`Получено ${response.data.items.length} видео, всего: ${allVideos.length}`);
                
                // Проверяем есть ли следующая страница
                nextPageToken = response.data.nextPageToken;
                if (!nextPageToken) {
                    console.log('Больше страниц нет');
                    break;
                }
                
                // Небольшая пауза между запросами
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                console.log('Больше результатов нет');
                break;
            }
        }
        
        console.log(`Итого найдено ${allVideos.length} видео`);
        
        // Получаем полные описания видео
        console.log('Получаем полные описания видео...');
        
        const videoIds = allVideos.map(item => item.id.videoId);
        const videoDetails = await this.getVideoDetails(videoIds);
        
        // Обновляем описания на полные
        const videosWithFullDescriptions = allVideos.map(video => {
            const detail = videoDetails.find(d => d.id === video.id.videoId);
            if (detail) {
                video.snippet.description = detail.snippet.description;
                console.log(`✅ Обновлено описание для: ${video.snippet.title.substring(0, 50)}...`);
            }
            return video;
        });
        
        // Логируем первые 5 видео
        videosWithFullDescriptions.slice(0, 5).forEach((item, index) => {
            console.log(`${index + 1}. ${item.snippet.title}`);
            console.log(`   Канал: ${item.snippet.channelTitle}`);
            console.log(`   ID: ${item.id.videoId}`);
            console.log('---');
        });
        
        return videosWithFullDescriptions
            .filter(item => {
                const title = item.snippet.title.toLowerCase();
                const isShorts = title.includes('#shorts') || title.includes('shorts');
                
                if (isShorts) {
                    console.log(`   ⏭️ Пропускаем Shorts: ${item.snippet.title}`);
                    return false;
                }
                
                return true;
            })
            .map(item => ({
                videoId: item.id.videoId,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                thumbnails: item.snippet.thumbnails
            }));

    } catch (error) {
        console.error('Ошибка поиска YouTube:', error);
        throw new Error(`YouTube API ошибка: ${error.message}`);
    }
}


// Извлечение Telegram ссылок из описаний
extractTelegramLinks(videos) {
    const telegramLinks = [];
    
    console.log('\n=== АНАЛИЗ ВИДЕО НА TELEGRAM ССЫЛКИ ===');
    
    videos.forEach((video, videoIndex) => {
        const description = video.description || '';
        
        console.log(`\n${videoIndex + 1}. Видео: ${video.title}`);
        console.log(`   Канал: ${video.channelTitle}`);
        console.log(`   URL: https://www.youtube.com/watch?v=${video.videoId}`);
        console.log(`   📄 ПОЛНОЕ ОПИСАНИЕ: "${description}"`);
        
        // Тестовая строка для проверки
        const testDescription = "https://t.me/grayacademybot?start=7video https://t.me/+8G7ajy7RfQY4Y2Y6 https://t.me/+OOg3OhKVdboxOWVk";
        console.log(`   🧪 ТЕСТ на примере: "${testDescription}"`);
        
        // Разные регулярки для тестирования
        const regex1 = /(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/|telegram\.dog\/)([a-zA-Z0-9_+\-\.\/=\?]{1,100})/gi;
        const regex2 = /https?:\/\/t\.me\/[^\s]+/gi;
        const regex3 = /t\.me\/[^\s]+/gi;
        
        console.log(`   📊 ТЕСТИРОВАНИЕ РЕГУЛЯРОК:`);
        
        const test1 = [...testDescription.matchAll(regex1)];
        const test2 = [...testDescription.matchAll(regex2)];
        const test3 = [...testDescription.matchAll(regex3)];
        
        console.log(`      Regex1 нашла: ${test1.length} - ${test1.map(m => m[0]).join(', ')}`);
        console.log(`      Regex2 нашла: ${test2.length} - ${test2.map(m => m[0]).join(', ')}`);
        console.log(`      Regex3 нашла: ${test3.length} - ${test3.map(m => m[0]).join(', ')}`);
        
        // Применяем к реальному описанию
        const matches1 = [...description.matchAll(regex1)];
        const matches2 = [...description.matchAll(regex2)];
        const matches3 = [...description.matchAll(regex3)];
        
        console.log(`   📊 НА РЕАЛЬНОМ ОПИСАНИИ:`);
        console.log(`      Regex1 нашла: ${matches1.length} - ${matches1.map(m => m[0]).join(', ')}`);
        console.log(`      Regex2 нашла: ${matches2.length} - ${matches2.map(m => m[0]).join(', ')}`);
        console.log(`      Regex3 нашла: ${matches3.length} - ${matches3.map(m => m[0]).join(', ')}`);
        
        // Используем самую успешную регулярку
        const bestMatches = matches2.length > 0 ? matches2 : (matches3.length > 0 ? matches3 : matches1);
        
        if (bestMatches.length > 0) {
            console.log(`   🎯 ИСПОЛЬЗУЕМ: ${bestMatches.length} ссылок`);
            
            bestMatches.forEach((match, linkIndex) => {
                const fullLink = match[0];
                
                // Добавляем https:// если нет
                const completeLink = fullLink.startsWith('http') ? fullLink : `https://${fullLink}`;
                const isInvite = fullLink.includes('/+');
                
                console.log(`      ${linkIndex + 1}. ${completeLink} (${isInvite ? 'invite' : 'public'})`);
                
                telegramLinks.push({
                    videoId: video.videoId,
                    videoTitle: video.title,
                    channelTitle: video.channelTitle,
                    telegramLink: completeLink,
                    identifier: fullLink.split('/').pop(),
                    isInviteLink: isInvite
                });
            });
        } else {
            console.log(`   ❌ НИ ОДНА РЕГУЛЯРКА НЕ НАШЛА ССЫЛКИ`);
        }
    });
    
    // Остальной код без изменений...
    const uniqueLinks = [];
    const seenLinks = new Set();
    
    telegramLinks.forEach(link => {
        if (!seenLinks.has(link.telegramLink)) {
            seenLinks.add(link.telegramLink);
            uniqueLinks.push(link);
        }
    });
    
    console.log(`\n📊 ИТОГО: найдено ${telegramLinks.length} ссылок, уникальных: ${uniqueLinks.length}`);

    
    
    return uniqueLinks;
}

// Получение полных описаний видео
async getVideoDetails(videoIds) {
    try {
        console.log(`Получаем полные описания для ${videoIds.length} видео...`);
        
        // YouTube API позволяет запрашивать до 50 видео за раз
        const batchSize = 50;
        const allDetails = [];
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
            const batch = videoIds.slice(i, i + batchSize);
            
            const response = await this.youtube.videos.list({
                part: 'snippet',
                id: batch.join(',')
            });
            
            if (response.data.items) {
                allDetails.push(...response.data.items);
            }
            
            // Пауза между запросами
            if (i + batchSize < videoIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`Получено полных описаний: ${allDetails.length}`);
        
        return allDetails;
    } catch (error) {
        console.error('Ошибка получения деталей видео:', error);
        return [];
    }
}
}

module.exports = YouTubeParser;