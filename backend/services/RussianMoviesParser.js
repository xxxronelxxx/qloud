const axios = require('axios');
const cheerio = require('cheerio');

class RussianMoviesParser {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа
    }

    // Поиск через Rutor.info (русский торрент-трекер)
    async searchRutor(query, year = null) {
        try {
            console.log(`🔍 Поиск в Rutor.info: "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `rutor_search_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
            }

            const searchUrl = `http://rutor.info/search/${encodeURIComponent(query)}`;
            
            const response = await axios.get(searchUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const results = [];

            // Парсим результаты поиска
            $('tr.gai, tr.tum').each((i, elem) => {
                const $row = $(elem);
                const $titleCell = $row.find('td.name');
                const $titleLink = $titleCell.find('a');
                
                if ($titleLink.length > 0) {
                    const title = $titleLink.text().trim();
                    const size = $row.find('td.s').text().trim();
                    const date = $row.find('td.date').text().trim();
                    
                    // Проверяем соответствие году
                    if (!year || title.includes(year.toString())) {
                        results.push({
                            title: title,
                            size: size,
                            date: date,
                            source: 'rutor'
                        });
                    }
                }
            });

            if (results.length > 0) {
                console.log(`✅ Найдено в Rutor: ${results.length} результатов`);
                
                const result = {
                    title: results[0].title,
                    year: year || this.extractYear(results[0].title),
                    source: 'rutor',
                    results: results,
                    is_russian: true
                };

                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });

                return result;
            }

            console.log('❌ Не найдено в Rutor');
            return null;

        } catch (error) {
            console.error('💥 Rutor Search Error:', error.message);
            return null;
        }
    }

    // Поиск через KinoPoisk (парсинг)
    async searchKinopoiskWeb(query, year = null) {
        try {
            console.log(`🔍 Поиск в Kinopoisk (парсинг): "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `kinopoisk_web_search_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
            }

            const searchUrl = `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query)}`;
            
            const response = await axios.get(searchUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
                }
            });

            const $ = cheerio.load(response.data);
            const results = [];

            // Парсим результаты поиска
            $('.search_results .element').each((i, elem) => {
                const $elem = $(elem);
                const title = $elem.find('.name a').text().trim();
                const yearText = $elem.find('.year').text().trim();
                const rating = $elem.find('.rating').text().trim();
                const description = $elem.find('.descr').text().trim();
                
                const extractedYear = this.extractYear(yearText);
                
                if (!year || extractedYear === year) {
                    results.push({
                        title: title,
                        year: extractedYear,
                        rating: rating,
                        description: description,
                        source: 'kinopoisk_web'
                    });
                }
            });

            if (results.length > 0) {
                console.log(`✅ Найдено в Kinopoisk: ${results.length} результатов`);
                
                const result = {
                    title: results[0].title,
                    year: results[0].year,
                    rating: results[0].rating,
                    description: results[0].description,
                    source: 'kinopoisk_web',
                    results: results,
                    is_russian: this.isRussianContent(results[0].title, results[0].description)
                };

                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });

                return result;
            }

            console.log('❌ Не найдено в Kinopoisk');
            return null;

        } catch (error) {
            console.error('💥 Kinopoisk Web Search Error:', error.message);
            return null;
        }
    }

    // Поиск через IMDb (для русских фильмов)
    async searchIMDb(query, year = null) {
        try {
            console.log(`🔍 Поиск в IMDb: "${query}"${year ? ` (${year})` : ''}`);

            const cacheKey = `imdb_search_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📋 Результат найден в кэше');
                return cached.data;
            }

            const searchUrl = `https://www.imdb.com/find?q=${encodeURIComponent(query)}&s=tt&ttype=ft,tv`;
            
            const response = await axios.get(searchUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const results = [];

            // Парсим результаты поиска
            $('.find-result-item').each((i, elem) => {
                const $elem = $(elem);
                const title = $elem.find('.result_text a').text().trim();
                const yearText = $elem.find('.result_text').text().trim();
                const extractedYear = this.extractYear(yearText);
                
                if (!year || extractedYear === year) {
                    results.push({
                        title: title,
                        year: extractedYear,
                        source: 'imdb'
                    });
                }
            });

            if (results.length > 0) {
                console.log(`✅ Найдено в IMDb: ${results.length} результатов`);
                
                const result = {
                    title: results[0].title,
                    year: results[0].year,
                    source: 'imdb',
                    results: results,
                    is_russian: this.isRussianTitle(results[0].title)
                };

                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });

                return result;
            }

            console.log('❌ Не найдено в IMDb');
            return null;

        } catch (error) {
            console.error('💥 IMDb Search Error:', error.message);
            return null;
        }
    }

    // Мультиисточниковый поиск
    async searchMultiSource(query, year = null) {
        console.log(`🔍 Мультиисточниковый поиск: "${query}"${year ? ` (${year})` : ''}`);

        const results = [];

        // Пробуем разные источники параллельно
        const promises = [
            this.searchRutor(query, year),
            this.searchKinopoiskWeb(query, year),
            this.searchIMDb(query, year)
        ];

        try {
            const searchResults = await Promise.allSettled(promises);
            
            searchResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    results.push(result.value);
                }
            });

            if (results.length > 0) {
                // Сортируем по приоритету источников
                results.sort((a, b) => {
                    const priority = { 'kinopoisk_web': 1, 'rutor': 2, 'imdb': 3 };
                    return (priority[a.source] || 999) - (priority[b.source] || 999);
                });

                console.log(`✅ Найдено в ${results.length} источниках`);
                return results[0]; // Возвращаем лучший результат
            }

            console.log('❌ Не найдено ни в одном источнике');
            return null;

        } catch (error) {
            console.error('💥 Multi-source Search Error:', error.message);
            return null;
        }
    }

    // Извлечение года из текста
    extractYear(text) {
        if (!text) return null;
        const yearMatch = text.match(/\b(19|20)\d{2}\b/);
        return yearMatch ? parseInt(yearMatch[0]) : null;
    }

    // Проверка, является ли контент русским
    isRussianContent(title, description = '') {
        const text = (title + ' ' + description).toLowerCase();
        return /[а-яё]/i.test(text);
    }

    // Проверка, является ли название русским
    isRussianTitle(title) {
        return /[а-яё]/i.test(title);
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
            sources: ['rutor', 'kinopoisk_web', 'imdb']
        };
    }
}

module.exports = new RussianMoviesParser();