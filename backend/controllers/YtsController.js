const axios = require('axios');
const cheerio = require('cheerio');
const Settings = require('../models/SettingsModel');
const https = require('https');

class YtsController {
  constructor() {
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      timeout: 10000
    });
    this.movieCache = new Map(); // Кэш для найденных фильмов
  }

  // Поиск фильмов через парсинг Kinopoisk
  async search(query, page = 1) {
    console.log(`[KINOPOISK] Поиск: "${query}" (страница ${page})`);
    
    try {
      // Поиск через парсинг Kinopoisk
      const searchResult = await this.searchKinopoiskWeb(query);
      
      if (searchResult) {
        console.log(`[KINOPOISK] Найден фильм: ${searchResult.title}`);
        
        // Сохраняем в кэше
        const movieId = `kinopoisk_${Date.now()}`;
        this.movieCache.set(movieId, searchResult);
        
        // Форматируем результат
        return this.formatKinopoiskResult(searchResult, movieId);
      }

      console.log(`[KINOPOISK] Фильм не найден для "${query}"`);
      return [];
      
    } catch (error) {
      console.log(`[KINOPOISK] Ошибка поиска:`, error.message);
      return [];
    }
  }

  // Парсинг Kinopoisk
  async searchKinopoiskWeb(query) {
    try {
      console.log(`[KINOPOISK] Парсинг Kinopoisk для: "${query}"`);
      
      const searchURL = 'https://www.kinopoisk.ru/index.php';
      const params = {
        kp_query: query,
        what: ''
      };

      const response = await axios.get(searchURL, {
        params: params,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        httpsAgent: this.httpsAgent
      });

      const $ = cheerio.load(response.data);
      
      // Ищем первый найденный фильм
      const movieElement = $('.search_results .element').first();
      
      if (movieElement.length > 0) {
        const title = movieElement.find('.name a').text().trim();
        const year = movieElement.find('.year').text().trim();
        const rating = movieElement.find('.rating').text().trim();
        const posterUrl = movieElement.find('.pic img').attr('src') || '';
        const description = movieElement.find('.descr').text().trim();
        
        return {
          title: title,
          year: parseInt(year) || null,
          rating: parseFloat(rating) || null,
          posterUrl: posterUrl,
          description: description,
          source: 'kinopoisk_web'
        };
      }
      
      return null;
    } catch (error) {
      console.log(`[KINOPOISK] Ошибка парсинга:`, error.message);
      return null;
    }
  }

  // Форматирование результата Kinopoisk
  formatKinopoiskResult(film, movieId) {
    return [{
      id: movieId,
      movieId: movieId,
      title: `${film.title} (${film.year || 'N/A'})`,
      quality: 'Unknown',
      type: 'movie',
      size: 'Unknown',
      seeds: 0,
      leeches: 0,
      date: film.year ? `${film.year}-01-01` : new Date().toISOString(),
      hash: '', // Нет торрентов
      torrentUrl: '', // Нет торрентов
      magnet: '',
      poster: film.posterUrl || '',
      year: film.year,
      rating: film.rating,
      overview: film.description || '',
      director: '',
      cast: [],
      genres: [],
      runtime: null,
      source: film.source,
      is_russian: true,
      original_title: film.title,
      countries: [],
      ratingKinopoisk: film.rating,
      ratingImdb: null
    }];
  }

  // Получение детальной информации о фильме (для API)
  async details(movieId) {
    try {
      console.log(`[KINOPOISK] Получение деталей фильма: ${movieId}`);
      
      // Если это Kinopoisk фильм, получаем детали из кэша
      if (movieId.startsWith('kinopoisk_')) {
        const cachedMovie = this.movieCache.get(movieId);
        
        if (cachedMovie) {
          return {
            id: movieId,
            title: cachedMovie.title,
            year: cachedMovie.year,
            rating: cachedMovie.rating,
            runtime: null,
            genres: [],
            description: cachedMovie.description || '',
            poster: cachedMovie.posterUrl || '',
            background: '',
            imdbCode: '',
            cast: [],
            director: '',
            source: cachedMovie.source,
            is_russian: true,
            overview: cachedMovie.description,
            original_title: cachedMovie.title,
            countries: ['Россия'],
            ratingKinopoisk: cachedMovie.rating,
            ratingImdb: null,
            torrents: [] // Нет торрентов
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[KINOPOISK] Ошибка получения деталей:`, error.message);
      return null;
    }
  }

  // Получение торрентов для фильма (заглушка)
  async getMovieTorrents(movieId) {
    return [];
  }

  // Статистика
  getStats() {
    return {
      name: 'Kinopoisk Web Search',
      description: 'Поиск фильмов через парсинг Kinopoisk',
      sources: ['kinopoisk_web']
    };
  }

  // Создание magnet-ссылки (заглушка для совместимости)
  buildMagnet(hash, name = '') {
    return `magnet:?xt=urn:btih:${hash}`;
  }

  // Получение файлов по URL торрента (заглушка для совместимости)
  async getFilesByTorrentUrl(torrentUrl) {
    return {
      name: 'Kinopoisk Movie',
      files: []
    };
  }
}

module.exports = YtsController;