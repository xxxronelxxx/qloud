const axios = require('axios');
const cheerio = require('cheerio');
const Settings = require('../models/SettingsModel');
const RussianMoviesDB = require('./RussianMoviesDatabase');

class RussianMovieService {
    constructor() {
        this.baseURL = 'https://api.themoviedb.org/3';
        this.cache = new Map();
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа
        
        // Русские источники данных
        this.sources = {
            kinopoisk: 'https://kinopoisk.ru',
            kinozal: 'https://kinozal.tv',
            rutracker: 'https://rutracker.org'
        };
    }

    // Получение API ключа TMDB
    getApiKey() {
        const settings = Settings.readConfig();
        return settings.tmdbApiKey || process.env.TMDB_API_KEY || '';
    }

    // Поиск русских фильмов с приоритетом локальной базы
    async searchRussianMovies(query, year = null) {
        try {
            console.log(`🔍 Поиск русских фильмов: "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `russian_movie_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
            }

            // 1. Сначала ищем в локальной базе данных
            console.log('🔍 Поиск в локальной базе русских фильмов...');
            const localResults = RussianMoviesDB.search(query, year);
            
            if (localResults.length > 0) {
                const bestMatch = localResults[0];
                console.log(`✅ Найден в локальной базе: ${bestMatch.title} (${bestMatch.year})`);
                
                // Форматируем результат в нужном формате
                const result = this.formatLocalResult(bestMatch);
                
                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
                
                return result;
            }

            // 2. Если не найден в локальной базе, пробуем TMDB с фильтрацией
            console.log('🔍 Поиск в TMDB с фильтрацией русских фильмов...');
            const tmdbResult = await this.searchTMDBWithFiltering(query, year);
            
            if (tmdbResult) {
                this.cache.set(cacheKey, {
                    data: tmdbResult,
                    timestamp: Date.now()
                });
                return tmdbResult;
            }

            // 3. Если ничего не найдено, возвращаем null
            console.log('❌ Русский фильм не найден ни в одном источнике');
            return null;
            
        } catch (error) {
            console.error('💥 Russian Movie Search Error:', error.message);
            return null;
        }
    }

    // Форматирование результата из локальной базы
    formatLocalResult(item) {
        return {
            id: item.id,
            title: item.title,
            original_title: item.original_title,
            year: item.year,
            rating: item.rating,
            overview: item.overview,
            genres: item.genres,
            runtime: item.runtime || item.episodes,
            poster_path: null, // Локальная база не содержит постеров
            backdrop_path: null,
            release_date: `${item.year}-01-01`,
            budget: null,
            revenue: null,
            director: item.director,
            cast: item.cast,
            production_companies: [],
            tagline: '',
            status: 'Released',
            original_language: 'ru',
            is_russian: true,
            is_translation: false,
            type: item.type,
            episodes: item.episodes,
            source: 'local_database'
        };
    }

    // Поиск в TMDB с фильтрацией русских фильмов
    async searchTMDBWithFiltering(query, year = null) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('TMDB API ключ не настроен');
                return null;
            }

            // Поиск на русском языке
            let params = {
                api_key: apiKey,
                query: query,
                language: 'ru-RU',
                include_adult: false,
                region: 'RU' // Приоритет российским фильмам
            };

            if (year) {
                params.year = year;
            }

            console.log(`🌐 Запрос к TMDB API для русских фильмов`);
            
            const response = await this.makeRequest(`${this.baseURL}/search/movie`, params);
            
            if (response.data.results && response.data.results.length > 0) {
                // Фильтруем результаты для русских фильмов
                const russianMovies = response.data.results.filter(movie => {
                    // Проверяем оригинальный язык фильма
                    const isRussianOriginal = movie.original_language === 'ru';
                    
                    // Проверяем страну производства
                    const isRussianProduction = movie.origin_country && 
                        movie.origin_country.some(country => country === 'RU');
                    
                    // Проверяем название на кириллице
                    const hasRussianTitle = /[а-яё]/i.test(movie.title) || 
                                          /[а-яё]/i.test(movie.original_title);
                    
                    return isRussianOriginal || isRussianProduction || hasRussianTitle;
                });

                if (russianMovies.length > 0) {
                    const movie = russianMovies[0];
                    console.log(`🎬 Найден русский фильм в TMDB: ${movie.title} (${movie.release_date})`);
                    
                    const details = await this.getRussianMovieDetails(movie.id);
                    
                    if (details) {
                        return details;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('💥 TMDB Search Error:', error.message);
            return null;
        }
    }

    // Получение детальной информации о фильме из TMDB
    async getRussianMovieDetails(movieId, isTranslation = false) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) return null;

            console.log(`📋 Получение деталей фильма ID: ${movieId}`);

            const cacheKey = `russian_details_${movieId}_${isTranslation}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            // Получаем детали на русском языке
            const params = {
                api_key: apiKey,
                language: 'ru-RU',
                append_to_response: 'credits,genres,release_dates'
            };

            const response = await this.makeRequest(`${this.baseURL}/movie/${movieId}`, params);
            const movie = response.data;

            // Получаем информацию о релизах в России
            const russianRelease = movie.release_dates?.results?.find(r => r.iso_3166_1 === 'RU');
            const russianRating = russianRelease?.release_dates?.[0]?.certification;

            const result = {
                id: movie.id,
                title: movie.title,
                original_title: movie.original_title,
                year: new Date(movie.release_date).getFullYear(),
                rating: movie.vote_average,
                overview: movie.overview,
                genres: movie.genres.map(g => g.name),
                runtime: movie.runtime,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                release_date: movie.release_date,
                budget: movie.budget,
                revenue: movie.revenue,
                director: this.translateName(movie.credits?.crew?.find(c => c.job === 'Director')?.name),
                cast: movie.credits?.cast?.slice(0, 10).map(a => this.translateName(a.name)),
                production_companies: movie.production_companies?.map(c => c.name),
                tagline: movie.tagline,
                status: movie.status,
                original_language: movie.original_language,
                is_russian: movie.original_language === 'ru',
                russian_rating: russianRating,
                is_translation: isTranslation,
                type: 'movie',
                source: 'tmdb'
            };

            console.log(`🎬 Обработаны детали: ${result.title} (${result.year})`);

            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('💥 Russian Movie Details Error:', error.message);
            return null;
        }
    }

    // Перевод имен актеров и режиссеров
    translateName(name) {
        if (!name) return name;
        
        // Словарь переводов для русских актеров
        const russianActors = {
            'Константин Хабенский': 'Константин Хабенский',
            'Сергей Безруков': 'Сергей Безруков',
            'Владимир Машков': 'Владимир Машков',
            'Евгений Миронов': 'Евгений Миронов',
            'Алексей Серебряков': 'Алексей Серебряков',
            'Дмитрий Нагиев': 'Дмитрий Нагиев',
            'Михаил Пореченков': 'Михаил Пореченков',
            'Андрей Мерзликин': 'Андрей Мерзликин',
            'Сергей Гармаш': 'Сергей Гармаш',
            'Александр Балуев': 'Александр Балуев'
        };

        // Словарь переводов для русских режиссеров
        const russianDirectors = {
            'Андрей Тарковский': 'Андрей Тарковский',
            'Сергей Эйзенштейн': 'Сергей Эйзенштейн',
            'Алексей Герман': 'Алексей Герман',
            'Никита Михалков': 'Никита Михалков',
            'Андрей Звягинцев': 'Андрей Звягинцев',
            'Кирилл Серебренников': 'Кирилл Серебренников',
            'Алексей Попогребский': 'Алексей Попогребский',
            'Валерий Тодоровский': 'Валерий Тодоровский',
            'Федор Бондарчук': 'Федор Бондарчук',
            'Тимур Бекмамбетов': 'Тимур Бекмамбетов'
        };

        // Проверяем точные совпадения
        if (russianActors[name] || russianDirectors[name]) {
            return russianActors[name] || russianDirectors[name];
        }

        // Если имя уже на русском, возвращаем как есть
        if (/[а-яё]/i.test(name)) {
            return name;
        }

        // Для иностранных имен используем существующий словарь
        const foreignTranslations = {
            'Tom Hanks': 'Том Хэнкс',
            'Leonardo DiCaprio': 'Леонардо ДиКаприо',
            'Brad Pitt': 'Брэд Питт',
            'Christopher Nolan': 'Кристофер Нолан',
            'Steven Spielberg': 'Стивен Спилберг'
        };

        return foreignTranslations[name] || name;
    }

    // Выполнение HTTP запросов
    async makeRequest(url, params = {}) {
        try {
            const response = await axios.get(url, { params });
            return response;
        } catch (error) {
            console.error(`HTTP Request Error: ${error.message}`);
            throw error;
        }
    }

    // Очистка кэша
    clearCache() {
        this.cache.clear();
    }

    // Получение размера кэша
    getCacheSize() {
        return this.cache.size;
    }

    // Получение статистики
    getStats() {
        const localStats = RussianMoviesDB.getStats();
        return {
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout,
            sources: Object.keys(this.sources),
            localDatabase: localStats
        };
    }

    // Получение всех фильмов из локальной базы
    getAllLocalMovies() {
        return RussianMoviesDB.getAllMovies();
    }

    // Получение всех сериалов из локальной базы
    getAllLocalSeries() {
        return RussianMoviesDB.getAllSeries();
    }

    // Добавление пользовательского фильма/сериала
    addCustomItem(item) {
        RussianMoviesDB.addCustomItem(item);
    }
}

module.exports = new RussianMovieService();