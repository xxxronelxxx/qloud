const https = require('https');
const { URL } = require('url');
const Settings = require('../models/SettingsModel');

// Функция для выполнения HTTPS запросов
function makeHttpsRequest(url, params = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        // Добавляем параметры к URL
        Object.keys(params).forEach(key => {
            urlObj.searchParams.append(key, params[key]);
        });
        
        console.log(`🌐 Выполняем HTTPS запрос: ${urlObj.toString()}`);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Qloud/1.0',
                'Accept': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ HTTPS ответ получен, статус: ${res.statusCode}`);
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ status: res.statusCode, data: jsonData });
                } catch (error) {
                    reject(new Error(`Ошибка парсинга JSON: ${error.message}`));
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`💥 HTTPS ошибка: ${error.message}`);
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Таймаут запроса'));
        });
        
        req.end();
    });
}

class TMDBService {
    constructor() {
        this.baseURL = 'https://api.themoviedb.org/3';
        
        // Кэш для результатов поиска
        this.cache = new Map();
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа
    }

    // Получение API ключа из настроек
    getApiKey() {
        const settings = Settings.readConfig();
        return settings.tmdbApiKey || process.env.TMDB_API_KEY || '';
    }

    // Проверка доступности API
    isApiAvailable() {
        return !!this.getApiKey();
    }

    // Поиск фильма по названию
    async searchMovie(query, year = null) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('TMDB API ключ не настроен');
                return null;
            }

            console.log(`🔍 Поиск фильма: "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `movie_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
            }

            // Сначала пробуем поиск на русском языке
            let params = {
                api_key: apiKey,
                query: query,
                language: 'ru-RU',
                include_adult: false
            };

            if (year) {
                params.year = year;
            }

            console.log(`🌐 Запрос к TMDB API: ${this.baseURL}/search/movie`);
            console.log(`📝 Параметры:`, params);

            let response = await makeHttpsRequest(`${this.baseURL}/search/movie`, params);
            
            console.log(`✅ Ответ получен, статус: ${response.status}`);
            
            // Если не найдено на русском, пробуем на английском
            if (!response.data.results || response.data.results.length === 0) {
                console.log('Не найдено на русском, пробуем на английском...');
                params.language = 'en-US';
                response = await makeHttpsRequest(`${this.baseURL}/search/movie`, params);
            }
            
            if (response.data.results && response.data.results.length > 0) {
                const movie = response.data.results[0];
                console.log(`🎬 Найден фильм: ${movie.title} (${movie.release_date})`);
                
                // Получаем детальную информацию о фильме
                const details = await this.getMovieDetails(movie.id);
                
                if (details) {
                    // Кэшируем результат
                    this.cache.set(cacheKey, {
                        data: details,
                        timestamp: Date.now()
                    });
                    return details;
                }
            } else {
                console.log('❌ Фильм не найден');
            }

            return null;
        } catch (error) {
            console.error('💥 TMDB API Error:', error.message);
            if (error.code) {
                console.error('Код ошибки:', error.code);
            }
            if (error.response) {
                console.error('Ответ сервера:', error.response.status, error.response.data);
            }
            return null;
        }
    }

    // Получение детальной информации о фильме
    async getMovieDetails(movieId) {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('TMDB API ключ не настроен');
                return null;
            }

            console.log(`📋 Получение деталей фильма ID: ${movieId}`);

            const cacheKey = `movie_details_${movieId}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Детали найдены в кэше');
                return cached.data;
            }

            const params = {
                api_key: apiKey,
                language: 'ru-RU',
                append_to_response: 'credits,genres'
            };

            console.log(`🌐 Запрос деталей: ${this.baseURL}/movie/${movieId}`);

            const response = await makeHttpsRequest(`${this.baseURL}/movie/${movieId}`, params);
            
            console.log(`✅ Детали получены, статус: ${response.status}`);
            
            const movie = response.data;

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
                director: movie.credits?.crew?.find(c => c.job === 'Director')?.name,
                cast: movie.credits?.cast?.slice(0, 10).map(a => a.name),
                production_companies: movie.production_companies?.map(c => c.name),
                tagline: movie.tagline,
                status: movie.status
            };

            console.log(`🎬 Обработаны детали: ${result.title} (${result.year})`);

            // Кэшируем результат
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('💥 TMDB API Error (детали):', error.message);
            if (error.code) {
                console.error('Код ошибки:', error.code);
            }
            if (error.response) {
                console.error('Ответ сервера:', error.response.status, error.response.data);
            }
            return null;
        }
    }

    // Получение жанров
    async getGenres() {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('TMDB API ключ не настроен');
                return [];
            }

            const cacheKey = 'genres';
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            const params = {
                api_key: apiKey,
                language: 'ru-RU'
            };

            const response = await makeHttpsRequest(`${this.baseURL}/genre/movie/list`, params);
            
            // Кэшируем результат
            this.cache.set(cacheKey, {
                data: response.data.genres,
                timestamp: Date.now()
            });

            return response.data.genres;
        } catch (error) {
            console.error('TMDB API Error:', error.message);
            return [];
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
}

module.exports = new TMDBService();