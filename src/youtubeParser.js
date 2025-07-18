const { google } = require('googleapis');

class YouTubeParser {
    constructor() {
        this.youtube = google.youtube({
            version: 'v3',
            auth: process.env.YOUTUBE_API_KEY
        });
    }

    // Поиск видео по ключевому слову
    async searchVideos(keyword, maxResults = 50) {
        try {
            console.log(`YouTube поиск по ключевику: "${keyword}"`);
            
            const response = await this.youtube.search.list({
                part: 'snippet',
                q: keyword,
                type: 'video',
                maxResults: maxResults,
                order: 'relevance'
            });

            console.log(`Найдено ${response.data.items.length} видео`);
            
            return response.data.items.map(item => ({
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
        
        videos.forEach(video => {
            const description = video.description || '';
            
            // Регулярка для поиска Telegram ссылок
            const telegramRegex = /(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/|telegram\.dog\/)([a-zA-Z0-9_+]+)/gi;
            const matches = description.matchAll(telegramRegex);
            
            for (const match of matches) {
                const link = match[0];
                const identifier = match[1];
                
                telegramLinks.push({
                    videoId: video.videoId,
                    videoTitle: video.title,
                    channelTitle: video.channelTitle,
                    telegramLink: link.startsWith('http') ? link : `https://t.me/${identifier}`,
                    identifier: identifier,
                    isInviteLink: identifier.startsWith('+'),
                    foundIn: 'description'
                });
            }
        });

        return telegramLinks;
    }

    // Получение детальной информации о видео
    async getVideoDetails(videoId) {
        try {
            const response = await this.youtube.videos.list({
                part: 'snippet,statistics',
                id: videoId
            });

            if (response.data.items.length === 0) {
                return null;
            }

            const video = response.data.items[0];
            return {
                videoId: video.id,
                title: video.snippet.title,
                description: video.snippet.description,
                channelTitle: video.snippet.channelTitle,
                publishedAt: video.snippet.publishedAt,
                viewCount: video.statistics.viewCount,
                likeCount: video.statistics.likeCount
            };

        } catch (error) {
            console.error('Ошибка получения деталей видео:', error);
            return null;
        }
    }
}

module.exports = YouTubeParser;