const SmartFileProcessor = require('../services/SmartFileProcessor');
const TMDBService = require('../services/TMDBService');
const MediaInfoService = require('../services/MediaInfoService');
const path = require('path');
const fs = require('fs').promises;

class SmartFileController {
    constructor() {
        this.processingQueue = new Map();
    }

    // Обработка одного файла
    processFile = async (req, res) => {
        try {
            const { filePath, options = {} } = req.body;

            if (!filePath) {
                return res.json({ success: false, error: 'Путь к файлу не указан' });
            }

            // Проверяем существование файла
            try {
                await fs.access(filePath);
            } catch (error) {
                return res.json({ success: false, error: 'Файл не найден' });
            }

            // Проверяем, не обрабатывается ли уже файл
            if (this.processingQueue.has(filePath)) {
                return res.json({ success: false, error: 'Файл уже обрабатывается' });
            }

            // Добавляем в очередь
            this.processingQueue.set(filePath, { status: 'processing', startTime: Date.now() });

            try {
                const result = await SmartFileProcessor.processFile(filePath, options);
                
                // Обновляем статус
                this.processingQueue.set(filePath, { 
                    status: result.success ? 'completed' : 'failed',
                    result: result,
                    endTime: Date.now()
                });

                res.json(result);
            } catch (error) {
                this.processingQueue.set(filePath, { 
                    status: 'failed',
                    error: error.message,
                    endTime: Date.now()
                });
                
                res.json({ success: false, error: error.message });
            }
        } catch (error) {
            console.error('SmartFileController Error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Обработка папки (рекурсивно)
    processDirectory = async (req, res) => {
        try {
            const { directoryPath, options = {} } = req.body;

            if (!directoryPath) {
                return res.json({ success: false, error: 'Путь к папке не указан' });
            }

            // Проверяем существование папки
            try {
                const stats = await fs.stat(directoryPath);
                if (!stats.isDirectory()) {
                    return res.json({ success: false, error: 'Указанный путь не является папкой' });
                }
            } catch (error) {
                return res.json({ success: false, error: 'Папка не найдена' });
            }

            // Запускаем обработку в фоне
            this.processDirectoryAsync(directoryPath, options);

            res.json({ 
                success: true, 
                message: 'Обработка папки запущена в фоновом режиме',
                directoryPath: directoryPath
            });
        } catch (error) {
            console.error('SmartFileController Error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Асинхронная обработка папки
    async processDirectoryAsync(directoryPath, options) {
        try {
            const results = {
                processed: 0,
                success: 0,
                failed: 0,
                errors: []
            };

            const files = await this.getVideoFiles(directoryPath);

            for (const file of files) {
                try {
                    const result = await SmartFileProcessor.processFile(file, options);
                    
                    results.processed++;
                    if (result.success) {
                        results.success++;
                    } else {
                        results.failed++;
                        results.errors.push({ file, error: result.error });
                    }
                } catch (error) {
                    results.processed++;
                    results.failed++;
                    results.errors.push({ file, error: error.message });
                }
            }

            console.log('Directory processing completed:', results);
        } catch (error) {
            console.error('Directory processing error:', error);
        }
    }

    // Получение всех видео файлов в папке (рекурсивно)
    async getVideoFiles(directoryPath) {
        const videoFiles = [];
        
        async function scanDirectory(dir) {
            try {
                const items = await fs.readdir(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stats = await fs.stat(fullPath);
                    
                    if (stats.isDirectory()) {
                        await scanDirectory(fullPath);
                    } else if (SmartFileProcessor.isVideoFile(fullPath)) {
                        videoFiles.push(fullPath);
                    }
                }
            } catch (error) {
                console.error(`Error scanning directory ${dir}:`, error);
            }
        }

        await scanDirectory(directoryPath);
        return videoFiles;
    }

    // Получение статуса обработки
    getProcessingStatus = (req, res) => {
        try {
            const { filePath } = req.query;
            
            if (filePath) {
                const status = this.processingQueue.get(filePath);
                res.json({ success: true, status: status || null });
            } else {
                const allStatus = Array.from(this.processingQueue.entries()).map(([path, status]) => ({
                    filePath: path,
                    ...status
                }));
                res.json({ success: true, status: allStatus });
            }
        } catch (error) {
            console.error('Get status error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Анализ файла (без переименования)
    analyzeFile = async (req, res) => {
        try {
            const { filePath } = req.body;

            if (!filePath) {
                return res.json({ success: false, error: 'Путь к файлу не указан' });
            }

            // Проверяем существование файла
            try {
                await fs.access(filePath);
            } catch (error) {
                return res.json({ success: false, error: 'Файл не найден' });
            }

            const fileInfo = await SmartFileProcessor.analyzeFile(filePath);
            
            if (!fileInfo) {
                return res.json({ success: false, error: 'Не удалось проанализировать файл' });
            }

            // Если это видео файл, пытаемся найти информацию о фильме
            let movieInfo = null;
            if (SmartFileProcessor.isVideoFile(filePath)) {
                movieInfo = SmartFileProcessor.extractMovieInfo(fileInfo.fileName);
                
                if (movieInfo) {
                    const tmdbInfo = await TMDBService.searchMovie(movieInfo.title, movieInfo.year);
                    if (tmdbInfo) {
                        movieInfo.tmdb = tmdbInfo;
                    }
                }
            }

            res.json({
                success: true,
                fileInfo: fileInfo,
                movieInfo: movieInfo
            });
        } catch (error) {
            console.error('Analyze file error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Поиск фильма в TMDB
    searchMovie = async (req, res) => {
        try {
            const { query, year } = req.body;

            if (!query) {
                return res.json({ success: false, error: 'Запрос не указан' });
            }

            const result = await TMDBService.searchMovie(query, year);
            
            if (result) {
                const details = await TMDBService.getMovieDetails(result.id);
                res.json({ success: true, movie: details });
            } else {
                res.json({ success: false, error: 'Фильм не найден' });
            }
        } catch (error) {
            console.error('Search movie error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Получение статистики
    getStats = (req, res) => {
        try {
            const stats = SmartFileProcessor.getStats();
            res.json({ success: true, stats: stats });
        } catch (error) {
            console.error('Get stats error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Очистка кэшей
    clearCaches = (req, res) => {
        try {
            SmartFileProcessor.clearCaches();
            res.json({ success: true, message: 'Кэши очищены' });
        } catch (error) {
            console.error('Clear caches error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Проверка доступности MediaInfo
    checkMediaInfo = async (req, res) => {
        try {
            const isAvailable = await MediaInfoService.isMediaInfoAvailable();
            res.json({ success: true, available: isAvailable });
        } catch (error) {
            console.error('Check MediaInfo error:', error);
            res.json({ success: false, error: error.message });
        }
    };

    // Проверка доступности TMDB API
    checkTMDB = async (req, res) => {
        try {
            const isAvailable = TMDBService.isApiAvailable();
            res.json({ success: true, available: isAvailable });
        } catch (error) {
            console.error('Check TMDB error:', error);
            res.json({ success: false, error: error.message });
        }
    };
}

module.exports = new SmartFileController();