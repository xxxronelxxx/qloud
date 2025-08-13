const path = require('path');
const fs = require('fs').promises;
const TMDBService = require('./TMDBService');
const MediaInfoService = require('./MediaInfoService');

class SmartFileProcessor {
    constructor() {
        this.videoExtensions = new Set([
            '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ogv'
        ]);
        
        this.audioExtensions = new Set([
            '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.opus'
        ]);
        
        this.subtitleExtensions = new Set([
            '.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'
        ]);
    }

    // Основной метод для обработки файла
    async processFile(filePath, options = {}) {
        try {
            const fileInfo = await this.analyzeFile(filePath);
            
            if (!fileInfo) {
                return { success: false, error: 'Не удалось проанализировать файл' };
            }

            // Определяем тип файла
            if (this.isVideoFile(filePath)) {
                return await this.processVideoFile(filePath, fileInfo, options);
            } else if (this.isAudioFile(filePath)) {
                return await this.processAudioFile(filePath, fileInfo, options);
            } else if (this.isSubtitleFile(filePath)) {
                return await this.processSubtitleFile(filePath, fileInfo, options);
            }

            return { success: false, error: 'Неподдерживаемый тип файла' };
        } catch (error) {
            console.error('SmartFileProcessor Error:', error);
            return { success: false, error: error.message };
        }
    }

    // Анализ файла
    async analyzeFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const fileName = path.basename(filePath, ext);

            const result = {
                fileName,
                extension: ext,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };

            // Получаем медиаинформацию для видео и аудио файлов
            if (this.isVideoFile(filePath) || this.isAudioFile(filePath)) {
                const mediaInfo = await MediaInfoService.getMediaInfo(filePath);
                if (mediaInfo) {
                    result.mediaInfo = mediaInfo;
                    result.duration = MediaInfoService.getDuration(mediaInfo);
                    
                    if (this.isVideoFile(filePath)) {
                        result.resolution = MediaInfoService.getVideoResolution(mediaInfo);
                        result.quality = MediaInfoService.getVideoQuality(mediaInfo);
                        result.audioTracks = MediaInfoService.getAudioTracks(mediaInfo);
                        result.subtitles = MediaInfoService.getSubtitles(mediaInfo);
                    }
                }
            }

            return result;
        } catch (error) {
            console.error('File analysis error:', error);
            return null;
        }
    }

    // Обработка видео файла
    async processVideoFile(filePath, fileInfo, options) {
        try {
            // Извлекаем информацию о фильме из названия
            const movieInfo = this.extractMovieInfo(fileInfo.fileName);
            
            if (!movieInfo) {
                return { success: false, error: 'Не удалось извлечь информацию о фильме из названия' };
            }

            // Ищем фильм в TMDB
            const tmdbInfo = await TMDBService.searchMovie(movieInfo.title, movieInfo.year);
            
            if (!tmdbInfo) {
                return { success: false, error: 'Фильм не найден в базе данных' };
            }

            // Получаем детальную информацию
            const details = await TMDBService.getMovieDetails(tmdbInfo.id);
            
            // Формируем новое имя файла
            const newFileName = this.generateMovieFileName(details, fileInfo, options);
            
            // Создаем структуру папок
            const newPath = await this.createMovieStructure(details, filePath, newFileName);
            
            return {
                success: true,
                originalPath: filePath,
                newPath: newPath,
                movieInfo: details,
                fileInfo: fileInfo
            };
        } catch (error) {
            console.error('Video processing error:', error);
            return { success: false, error: error.message };
        }
    }

    // Обработка аудио файла
    async processAudioFile(filePath, fileInfo, options) {
        // Пока что просто возвращаем информацию о файле
        return {
            success: true,
            originalPath: filePath,
            fileInfo: fileInfo,
            message: 'Аудио файл обработан (переименование пока не реализовано)'
        };
    }

    // Обработка субтитров
    async processSubtitleFile(filePath, fileInfo, options) {
        // Пока что просто возвращаем информацию о файле
        return {
            success: true,
            originalPath: filePath,
            fileInfo: fileInfo,
            message: 'Субтитры обработаны (переименование пока не реализовано)'
        };
    }

    // Извлечение информации о фильме из названия файла
    extractMovieInfo(fileName) {
        // Удаляем лишние символы и приводим к нормальному виду
        let cleanName = fileName
            .replace(/[._-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Паттерны для извлечения года
        const yearPatterns = [
            /\((\d{4})\)/,  // (2023)
            /\[(\d{4})\]/,  // [2023]
            /\.(\d{4})\./,  // .2023.
            /_(\d{4})_/,    // _2023_
            /-(\d{4})-/,    // -2023-
            /\s(\d{4})\s/,  // 2023
        ];

        let year = null;
        let title = cleanName;

        // Ищем год в названии
        for (const pattern of yearPatterns) {
            const match = cleanName.match(pattern);
            if (match) {
                year = parseInt(match[1]);
                title = cleanName.replace(pattern, '').trim();
                break;
            }
        }

        // Удаляем качество и другие технические параметры
        const qualityPatterns = [
            /1080p|720p|480p|4K|HDRip|BRRip|BDRip|WEB-DL|BluRay|DVD/i,
            /x264|x265|HEVC|AVC/i,
            /AAC|AC3|DTS|FLAC/i,
            /RARBG|YIFY|YTS/i
        ];

        for (const pattern of qualityPatterns) {
            title = title.replace(pattern, '').trim();
        }

        // Очищаем от лишних символов
        title = title.replace(/[\[\](){}]/g, '').trim();

        return title ? { title, year } : null;
    }

    // Генерация нового имени файла для фильма
    generateMovieFileName(movieInfo, fileInfo, options) {
        const template = options.template || '{Title} ({Year}) [{Rating}] {Quality}.{Extension}';
        
        let fileName = template
            .replace('{Title}', movieInfo.title || 'Unknown')
            .replace('{Year}', movieInfo.year || 'Unknown')
            .replace('{Rating}', movieInfo.rating ? movieInfo.rating.toFixed(1) : 'N/A')
            .replace('{Quality}', fileInfo.quality || 'Unknown')
            .replace('{Extension}', fileInfo.extension);

        // Очищаем от недопустимых символов и лишних точек
        fileName = fileName.replace(/[<>:"/\\|?*]/g, '');
        fileName = fileName.replace(/\.+/g, '.'); // Заменяем множественные точки на одну
        fileName = fileName.replace(/\s+/g, ' ').trim(); // Убираем лишние пробелы
        
        return fileName;
    }

    // Создание структуры папок для фильма
    async createMovieStructure(movieInfo, originalPath, newFileName) {
        try {
            const dir = path.dirname(originalPath);
            const movieDir = path.join(dir, 'Фильмы', `${movieInfo.title} (${movieInfo.year})`);
            
            // Создаем папки
            await fs.mkdir(movieDir, { recursive: true });
            
            const newPath = path.join(movieDir, newFileName);
            
            // Перемещаем файл
            await fs.rename(originalPath, newPath);
            
            return newPath;
        } catch (error) {
            console.error('Error creating movie structure:', error);
            throw error;
        }
    }

    // Проверка типа файла
    isVideoFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.videoExtensions.has(ext);
    }

    isAudioFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.audioExtensions.has(ext);
    }

    isSubtitleFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.subtitleExtensions.has(ext);
    }

    // Получение статистики обработки
    getStats() {
        return {
            tmdbCacheSize: TMDBService.getCacheSize(),
            mediaInfoCacheSize: MediaInfoService.getCacheSize()
        };
    }

    // Очистка кэшей
    clearCaches() {
        TMDBService.clearCache();
        MediaInfoService.clearCache();
    }
}

module.exports = new SmartFileProcessor();