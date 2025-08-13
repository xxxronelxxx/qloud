const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class MediaInfoService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 60 * 60 * 1000; // 1 час
    }

    // Проверка доступности MediaInfo
    async isMediaInfoAvailable() {
        try {
            await execAsync('mediainfo --version');
            return true;
        } catch (error) {
            return false;
        }
    }

    // Получение медиаинформации из файла
    async getMediaInfo(filePath) {
        try {
            const cacheKey = filePath;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            // Проверяем существование файла
            await fs.access(filePath);

            // Получаем информацию через MediaInfo
            const { stdout } = await execAsync(`mediainfo --Output=JSON "${filePath}"`);
            const mediaInfo = JSON.parse(stdout);

            const result = this.parseMediaInfo(mediaInfo);

            // Кэшируем результат
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('MediaInfo Error:', error.message);
            return null;
        }
    }

    // Парсинг медиаинформации
    parseMediaInfo(mediaInfo) {
        const result = {
            general: {},
            video: [],
            audio: [],
            text: []
        };

        if (mediaInfo.media && mediaInfo.media.track) {
            const tracks = Array.isArray(mediaInfo.media.track) 
                ? mediaInfo.media.track 
                : [mediaInfo.media.track];

            tracks.forEach(track => {
                switch (track['@type']) {
                    case 'General':
                        result.general = {
                            format: track.Format,
                            duration: track.Duration,
                            file_size: track.File_size,
                            overall_bit_rate: track.OverallBitRate
                        };
                        break;
                    case 'Video':
                        result.video.push({
                            format: track.Format,
                            width: track.Width,
                            height: track.Height,
                            bit_rate: track.BitRate,
                            frame_rate: track.FrameRate,
                            aspect_ratio: track.DisplayAspectRatio,
                            color_space: track.ColorSpace,
                            bit_depth: track.BitDepth
                        });
                        break;
                    case 'Audio':
                        result.audio.push({
                            format: track.Format,
                            channels: track.Channels,
                            channel_layout: track.ChannelLayout,
                            sample_rate: track.SamplingRate,
                            bit_rate: track.BitRate,
                            language: track.Language
                        });
                        break;
                    case 'Text':
                        result.text.push({
                            format: track.Format,
                            language: track.Language,
                            title: track.Title
                        });
                        break;
                }
            });
        }

        return result;
    }

    // Получение разрешения видео
    getVideoResolution(mediaInfo) {
        if (mediaInfo.video && mediaInfo.video.length > 0) {
            const video = mediaInfo.video[0];
            if (video.width && video.height) {
                return `${video.width}x${video.height}`;
            }
        }
        return null;
    }

    // Получение аудиодорожек
    getAudioTracks(mediaInfo) {
        if (mediaInfo.audio && mediaInfo.audio.length > 0) {
            return mediaInfo.audio.map(audio => ({
                format: audio.format,
                channels: audio.channels,
                language: audio.language || 'Unknown'
            }));
        }
        return [];
    }

    // Получение субтитров
    getSubtitles(mediaInfo) {
        if (mediaInfo.text && mediaInfo.text.length > 0) {
            return mediaInfo.text.map(text => ({
                format: text.format,
                language: text.language || 'Unknown',
                title: text.title
            }));
        }
        return [];
    }

    // Определение качества видео
    getVideoQuality(mediaInfo) {
        const resolution = this.getVideoResolution(mediaInfo);
        if (!resolution) return 'Unknown';

        const [width, height] = resolution.split('x').map(Number);
        
        if (width >= 3840 && height >= 2160) return '4K';
        if (width >= 1920 && height >= 1080) return '1080p';
        if (width >= 1280 && height >= 720) return '720p';
        if (width >= 854 && height >= 480) return '480p';
        
        return 'SD';
    }

    // Получение длительности в формате HH:MM:SS
    getDuration(mediaInfo) {
        if (mediaInfo.general.duration) {
            const seconds = parseFloat(mediaInfo.general.duration);
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return null;
    }

    // Очистка кэша
    clearCache() {
        this.cache.clear();
    }

    // Получение размера кэша
    getCacheSize() {
        return this.cache.size;
    }
}

module.exports = new MediaInfoService();