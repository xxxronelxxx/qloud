const axios = require('axios');
const cheerio = require('cheerio');
const Settings = require('../models/SettingsModel');

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

    // Поиск русских фильмов через TMDB с фильтрацией
    async searchRussianMovies(query, year = null) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('TMDB API ключ не настроен');
                return null;
            }

            console.log(`🔍 Поиск русских фильмов: "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `russian_movie_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
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
                    console.log(`🎬 Найден русский фильм: ${movie.title} (${movie.release_date})`);
                    
                    const details = await this.getRussianMovieDetails(movie.id);
                    
                    if (details) {
                        this.cache.set(cacheKey, {
                            data: details,
                            timestamp: Date.now()
                        });
                        return details;
                    }
                }
            }

            // Если не найдено русских фильмов, пробуем поиск с русскими переводами
            return await this.searchWithRussianTranslation(query, year);
            
        } catch (error) {
            console.error('💥 Russian Movie Search Error:', error.message);
            return null;
        }
    }

    // Поиск фильмов с русскими переводами
    async searchWithRussianTranslation(query, year = null) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) return null;

            console.log(`🔍 Поиск фильмов с русскими переводами: "${query}"`);

            // Поиск на русском языке для получения переведенных названий
            let params = {
                api_key: apiKey,
                query: query,
                language: 'ru-RU',
                include_adult: false
            };

            if (year) {
                params.year = year;
            }

            const response = await this.makeRequest(`${this.baseURL}/search/movie`, params);
            
            if (response.data.results && response.data.results.length > 0) {
                const movie = response.data.results[0];
                console.log(`🎬 Найден фильм с русским переводом: ${movie.title}`);
                
                const details = await this.getRussianMovieDetails(movie.id, true);
                
                if (details) {
                    return details;
                }
            }

            return null;
        } catch (error) {
            console.error('💥 Russian Translation Search Error:', error.message);
            return null;
        }
    }

    // Получение деталей русского фильма
    async getRussianMovieDetails(movieId, isTranslation = false) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) return null;

            console.log(`📋 Получение деталей русского фильма ID: ${movieId}`);

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
                is_translation: isTranslation
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

    // Поиск через Kinopoisk (альтернативный источник)
    async searchKinopoisk(query) {
        try {
            console.log(`🔍 Поиск через Kinopoisk: "${query}"`);
            
            // Здесь можно добавить интеграцию с Kinopoisk API
            // Пока возвращаем заглушку
            return null;
        } catch (error) {
            console.error('💥 Kinopoisk Search Error:', error.message);
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
        return {
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout,
            sources: Object.keys(this.sources)
        };
    }
}

module.exports = new RussianMovieService();