const axios = require('axios');
const Settings = require('../models/SettingsModel');

class KinopoiskService {
    constructor() {
        this.baseURL = 'https://kinopoiskapiunofficial.tech/api/v2.1/films';
        this.cache = new Map();
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа
    }

    // Получение API ключа Kinopoisk
    getApiKey() {
        const settings = Settings.readConfig();
        return settings.kinopoiskApiKey || process.env.KINOPOISK_API_KEY || '';
    }

    // Поиск фильмов по ключевому слову
    async searchMovies(query, year = null) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('Kinopoisk API ключ не настроен');
                return null;
            }

            console.log(`🔍 Поиск в Kinopoisk: "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `kinopoisk_search_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
            }

            const params = {
                keyword: query
            };

            if (year) {
                params.yearFrom = year;
                params.yearTo = year;
            }

            const response = await this.makeRequest(`${this.baseURL}/search-by-keyword`, params);
            
            if (response.data.films && response.data.films.length > 0) {
                const film = response.data.films[0];
                console.log(`🎬 Найден в Kinopoisk: ${film.nameRu || film.nameEn} (${film.year})`);
                
                // Получаем детальную информацию
                const details = await this.getMovieDetails(film.filmId);
                
                if (details) {
                    this.cache.set(cacheKey, {
                        data: details,
                        timestamp: Date.now()
                    });
                    return details;
                }
            }

            console.log('❌ Фильм не найден в Kinopoisk');
            return null;

        } catch (error) {
            console.error('💥 Kinopoisk Search Error:', error.message);
            return null;
        }
    }

    // Получение детальной информации о фильме
    async getMovieDetails(filmId) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) return null;

            console.log(`📋 Получение деталей фильма Kinopoisk ID: ${filmId}`);

            const cacheKey = `kinopoisk_details_${filmId}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            const response = await this.makeRequest(`${this.baseURL}/${filmId}`);
            const film = response.data;

            const result = {
                id: film.kinopoiskId,
                title: film.nameRu || film.nameEn,
                original_title: film.nameEn || film.nameRu,
                year: film.year,
                rating: film.ratingKinopoisk || film.ratingImdb,
                overview: film.description,
                genres: film.genres?.map(g => g.genre) || [],
                runtime: film.filmLength,
                poster_path: film.posterUrl,
                backdrop_path: film.coverUrl,
                release_date: `${film.year}-01-01`,
                budget: null,
                revenue: null,
                director: film.director,
                cast: film.actors?.split(', ') || [],
                production_companies: [],
                tagline: film.slogan,
                status: 'Released',
                original_language: film.countries?.some(c => c.country === 'Россия') ? 'ru' : 'en',
                is_russian: film.countries?.some(c => c.country === 'Россия') || false,
                is_translation: false,
                type: film.type === 'FILM' ? 'movie' : 'series',
                episodes: film.serial ? film.serial.length : null,
                source: 'kinopoisk',
                kinopoisk_rating: film.ratingKinopoisk,
                imdb_rating: film.ratingImdb
            };

            console.log(`🎬 Обработаны детали: ${result.title} (${result.year})`);

            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('💥 Kinopoisk Details Error:', error.message);
            return null;
        }
    }

    // Поиск топ фильмов
    async getTopMovies(type = 'TOP_250_BEST_FILMS') {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) return [];

            const response = await this.makeRequest(`${this.baseURL}/top`, { type });
            return response.data.films || [];
        } catch (error) {
            console.error('💥 Kinopoisk Top Movies Error:', error.message);
            return [];
        }
    }

    // Выполнение HTTP запросов
    async makeRequest(url, params = {}) {
        try {
            const apiKey = this.getApiKey();
            const response = await axios.get(url, { 
                params,
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response;
        } catch (error) {
            console.error(`Kinopoisk HTTP Request Error: ${error.message}`);
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
            apiKeyConfigured: !!this.getApiKey()
        };
    }
}

module.exports = new KinopoiskService();