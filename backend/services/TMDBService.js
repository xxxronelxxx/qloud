// Принудительно сбрасываем глобальные настройки Node.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
process.env.HTTPS_PROXY = '';
process.env.HTTP_PROXY = '';
process.env.NO_PROXY = '';

const https = require('https');
const { URL } = require('url');
const dns = require('dns').promises;
const Settings = require('../models/SettingsModel');

// Известные IP адреса TMDB API (резервные)
const TMDB_IPS = [
    '52.85.151.18',
    '52.85.151.24', 
    '52.85.151.28',
    '52.85.65.125',
    '52.85.151.48'
];

// Словарь переводов имен актеров и режиссеров
const ACTOR_TRANSLATIONS = {
    // Популярные актеры
    'Tom Hanks': 'Том Хэнкс',
    'Leonardo DiCaprio': 'Леонардо ДиКаприо',
    'Brad Pitt': 'Брэд Питт',
    'Johnny Depp': 'Джонни Депп',
    'Robert Downey Jr.': 'Роберт Дауни мл.',
    'Chris Hemsworth': 'Крис Хемсворт',
    'Scarlett Johansson': 'Скарлетт Йоханссон',
    'Jennifer Lawrence': 'Дженнифер Лоуренс',
    'Emma Watson': 'Эмма Уотсон',
    'Angelina Jolie': 'Анджелина Джоли',
    'Will Smith': 'Уилл Смит',
    'Tom Cruise': 'Том Круз',
    'Denzel Washington': 'Дензел Вашингтон',
    'Morgan Freeman': 'Морган Фриман',
    'Al Pacino': 'Аль Пачино',
    'Robert De Niro': 'Роберт Де Ниро',
    'Jack Nicholson': 'Джек Николсон',
    'Meryl Streep': 'Мерил Стрип',
    'Julia Roberts': 'Джулия Робертс',
    'Sandra Bullock': 'Сандра Буллок',
    
    // Популярные режиссеры
    'Christopher Nolan': 'Кристофер Нолан',
    'Steven Spielberg': 'Стивен Спилберг',
    'James Cameron': 'Джеймс Кэмерон',
    'Quentin Tarantino': 'Квентин Тарантино',
    'Martin Scorsese': 'Мартин Скорсезе',
    'Ridley Scott': 'Ридли Скотт',
    'Peter Jackson': 'Питер Джексон',
    'Tim Burton': 'Тим Бёртон',
    'David Fincher': 'Дэвид Финчер',
    'Danny Boyle': 'Дэнни Бойл',
    'Guy Ritchie': 'Гай Ричи',
    'Zack Snyder': 'Зак Снайдер',
    'J.J. Abrams': 'Дж.Дж. Абрамс',
    'Michael Bay': 'Майкл Бэй',
    'Roland Emmerich': 'Роланд Эммерих',
    'Baz Luhrmann': 'Баз Лурманн',
    'Sam Raimi': 'Сэм Рэйми',
    'Gore Verbinski': 'Гор Вербински',
    'Jon Favreau': 'Джон Фавро',
    'Joss Whedon': 'Джосс Уидон'
};

// Функция для перевода имени на русский язык
function translateName(name) {
    if (!name) return name;
    
    // Проверяем точное совпадение
    if (ACTOR_TRANSLATIONS[name]) {
        return ACTOR_TRANSLATIONS[name];
    }
    
    // Проверяем частичные совпадения (для случаев с разными вариантами написания)
    for (const [english, russian] of Object.entries(ACTOR_TRANSLATIONS)) {
        if (name.toLowerCase().includes(english.toLowerCase()) || 
            english.toLowerCase().includes(name.toLowerCase())) {
            return russian;
        }
    }
    
    // Если перевод не найден, возвращаем оригинальное имя
    return name;
}

// Функция для выполнения HTTPS запросов с принудительным DNS
async function makeHttpsRequest(url, params = {}) {
    try {
        const urlObj = new URL(url);
        
        // Принудительно разрешаем DNS
        console.log(`🔍 Разрешаем DNS для: ${urlObj.hostname}`);
        let addresses;
        
        try {
            addresses = await dns.resolve4(urlObj.hostname);
            console.log(`✅ DNS разрешен: ${addresses.join(', ')}`);
            
            // Проверяем, не разрешился ли DNS в localhost
            if (addresses.includes('127.0.0.1') || addresses.includes('::1')) {
                console.log('⚠️ DNS разрешился в localhost, используем резервные IP');
                addresses = TMDB_IPS;
            }
        } catch (dnsError) {
            console.log('⚠️ DNS ошибка, используем резервные IP:', dnsError.message);
            addresses = TMDB_IPS;
        }
        
        // Добавляем параметры к URL
        Object.keys(params).forEach(key => {
            urlObj.searchParams.append(key, params[key]);
        });
        
        console.log(`🌐 Выполняем HTTPS запрос: ${urlObj.toString()}`);
        
        // Пробуем подключиться к каждому IP адресу
        for (const ip of addresses) {
            try {
                console.log(`🔌 Пробуем подключиться к ${ip}...`);
                
                const options = {
                    hostname: ip, // Используем IP напрямую
                    port: 443,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Qloud/1.0',
                        'Accept': 'application/json',
                        'Host': urlObj.hostname // Важно: указываем оригинальный hostname
                    },
                    family: 4,
                    rejectUnauthorized: false
                };
                
                const result = await new Promise((resolve, reject) => {
                    const req = https.request(options, (res) => {
                        let data = '';
                        
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        
                        res.on('end', () => {
                            console.log(`✅ HTTPS ответ получен от ${ip}, статус: ${res.statusCode}`);
                            try {
                                const jsonData = JSON.parse(data);
                                resolve({ status: res.statusCode, data: jsonData });
                            } catch (error) {
                                reject(new Error(`Ошибка парсинга JSON: ${error.message}`));
                            }
                        });
                    });
                    
                    req.on('error', (error) => {
                        console.error(`💥 HTTPS ошибка для ${ip}: ${error.message}`);
                        reject(error);
                    });
                    
                    req.setTimeout(5000, () => {
                        req.destroy();
                        reject(new Error(`Таймаут для ${ip}`));
                    });
                    
                    req.end();
                });
                
                // Если успешно подключились, возвращаем результат
                return result;
                
            } catch (ipError) {
                console.log(`❌ Не удалось подключиться к ${ip}: ${ipError.message}`);
                // Продолжаем с следующим IP
                continue;
            }
        }
        
        // Если не удалось подключиться ни к одному IP
        throw new Error('Не удалось подключиться ни к одному IP адресу TMDB');
        
    } catch (error) {
        console.error(`💥 Ошибка DNS или запроса: ${error.message}`);
        throw error;
    }
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
                // Передаем язык, на котором был найден фильм
                const searchLanguage = params.language;
                const details = await this.getMovieDetails(movie.id, searchLanguage);
                
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
    async getMovieDetails(movieId, searchLanguage = 'ru-RU') {
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                console.warn('TMDB API ключ не настроен');
                return null;
            }

            console.log(`📋 Получение деталей фильма ID: ${movieId} на языке: ${searchLanguage}`);

            const cacheKey = `movie_details_${movieId}_${searchLanguage}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Детали найдены в кэше');
                return cached.data;
            }

            // Сначала пробуем получить детали на русском языке
            let params = {
                api_key: apiKey,
                language: 'ru-RU',
                append_to_response: 'credits,genres'
            };

            console.log(`🌐 Запрос деталей на русском: ${this.baseURL}/movie/${movieId}`);

            let response = await makeHttpsRequest(`${this.baseURL}/movie/${movieId}`, params);
            
            console.log(`✅ Детали получены, статус: ${response.status}`);
            
            let movie = response.data;

            // Если русская локализация недоступна (overview пустой или на английском), 
            // пробуем получить на языке поиска
            if (!movie.overview || movie.overview.length < 10 || 
                (searchLanguage === 'en-US' && !movie.overview.match(/[а-яё]/i))) {
                console.log('Русская локализация недоступна, пробуем на языке поиска...');
                
                params.language = searchLanguage;
                response = await makeHttpsRequest(`${this.baseURL}/movie/${movieId}`, params);
                movie = response.data;
            }

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
                director: translateName(movie.credits?.crew?.find(c => c.job === 'Director')?.name),
                cast: movie.credits?.cast?.slice(0, 10).map(a => translateName(a.name)),
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

    // Добавление перевода имени в словарь
    addTranslation(englishName, russianName) {
        if (englishName && russianName) {
            ACTOR_TRANSLATIONS[englishName] = russianName;
            console.log(`📝 Добавлен перевод: ${englishName} -> ${russianName}`);
        }
    }

    // Получение всех переводов
    getTranslations() {
        return { ...ACTOR_TRANSLATIONS };
    }

    // Получение статистики локализации
    getLocalizationStats() {
        return {
            totalTranslations: Object.keys(ACTOR_TRANSLATIONS).length,
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout
        };
    }

    // Экспорт функции перевода для тестирования
    translateName(name) {
        return translateName(name);
    }
}

module.exports = new TMDBService();
