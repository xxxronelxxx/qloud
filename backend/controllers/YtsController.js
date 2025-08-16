const axios = require('axios');
const Settings = require('../models/SettingsModel');
const https = require('https');

class YtsController {
  constructor() {
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      timeout: 10000
    });
    this.movieCache = new Map(); // Кэш для найденных фильмов
    this.baseURL = 'https://api.kinopoisk.dev';
  }

  // Получение API ключа Kinopoisk
  getApiKey() {
    const settings = Settings.readConfig();
    return settings.kinopoiskApiKey || process.env.KINOPOISK_API_KEY || 'N6SXSYN-P1PM36E-Q6Y1NK4-GBFNPK7';
  }

  // Поиск фильмов через Kinopoisk API
  async search(query, page = 1) {
    console.log(`[KINOPOISK] Поиск: "${query}" (страница ${page})`);
    
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.log('[KINOPOISK] API ключ не настроен');
        return [];
      }

      // Поиск фильмов через официальный API
      const searchURL = `${this.baseURL}/v1.4/movie/search`;
      const params = {
        page: page,
        limit: 10,
        query: query
      };

      console.log(`[KINOPOISK] Запрос к: ${searchURL}`);
      console.log(`[KINOPOISK] Параметры:`, params);
      console.log(`[KINOPOISK] API ключ: ${apiKey.substring(0, 10)}...`);

      const response = await axios.get(searchURL, {
        params: params,
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000,
        httpsAgent: this.httpsAgent
      });

      console.log(`[KINOPOISK] Ответ получен, статус: ${response.status}`);

      if (response.data && response.data.docs && response.data.docs.length > 0) {
        const films = response.data.docs;
        console.log(`[KINOPOISK] Найдено ${films.length} фильмов`);
        
        // Получаем детали первого найденного фильма
        const film = films[0];
        const details = await this.getFilmDetails(film.id);
        
        if (details) {
          // Сохраняем в кэше
          const movieId = `kinopoisk_${film.id}`;
          this.movieCache.set(movieId, details);
          
          // Форматируем результат
          return this.formatKinopoiskResult(details);
        }
      }

      console.log(`[KINOPOISK] Фильм не найден для "${query}"`);
      return [];
      
    } catch (error) {
      console.log(`[KINOPOISK] Ошибка поиска:`, error.message);
      if (error.response) {
        console.log(`[KINOPOISK] Статус ответа: ${error.response.status}`);
        console.log(`[KINOPOISK] Данные ответа:`, error.response.data);
      }
      return [];
    }
  }

  // Получение детальной информации о фильме
  async getFilmDetails(filmId) {
    try {
      const apiKey = this.getApiKey();
      const detailsURL = `${this.baseURL}/v1.4/movie/${filmId}`;
      
      const response = await axios.get(detailsURL, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000,
        httpsAgent: this.httpsAgent
      });

      if (response.data) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(`[KINOPOISK] Ошибка получения деталей:`, error.message);
      return null;
    }
  }

  // Форматирование результата Kinopoisk
  formatKinopoiskResult(film) {
    return [{
      id: `kinopoisk_${film.id}`,
      movieId: `kinopoisk_${film.id}`,
      title: `${film.name || film.alternativeName || film.enName} (${film.year || 'N/A'})`,
      quality: 'Unknown',
      type: film.isSeries ? 'series' : 'movie',
      size: 'Unknown',
      seeds: 0,
      leeches: 0,
      date: film.year ? `${film.year}-01-01` : new Date().toISOString(),
      hash: '', // Нет торрентов
      torrentUrl: '', // Нет торрентов
      magnet: '',
      poster: film.poster?.url || '',
      year: film.year,
      rating: film.rating?.kp || film.rating?.imdb,
      overview: film.description || '',
      director: film.persons?.find(p => p.profession === 'режиссеры')?.name || '',
      cast: film.persons?.filter(p => p.profession === 'актеры').slice(0, 10).map(p => p.name) || [],
      genres: film.genres?.map(g => g.name) || [],
      runtime: film.movieLength,
      source: 'kinopoisk',
      is_russian: film.countries?.some(c => c.name === 'Россия') || false,
      original_title: film.alternativeName || film.enName || film.name,
      countries: film.countries?.map(c => c.name) || [],
      ratingKinopoisk: film.rating?.kp,
      ratingImdb: film.rating?.imdb,
      ageRating: film.ageRating,
      budget: film.budget,
      fees: film.fees,
      premiere: film.premiere
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
            id: cachedMovie.id,
            title: cachedMovie.name || cachedMovie.alternativeName || cachedMovie.enName,
            year: cachedMovie.year,
            rating: cachedMovie.rating?.kp || cachedMovie.rating?.imdb,
            runtime: cachedMovie.movieLength,
            genres: cachedMovie.genres?.map(g => g.name) || [],
            description: cachedMovie.description || '',
            poster: cachedMovie.poster?.url || '',
            background: cachedMovie.backdrop?.url || '',
            imdbCode: cachedMovie.externalId?.imdb || '',
            cast: cachedMovie.persons?.filter(p => p.profession === 'актеры').slice(0, 12).map(p => p.name) || [],
            director: cachedMovie.persons?.find(p => p.profession === 'режиссеры')?.name || '',
            source: 'kinopoisk',
            is_russian: cachedMovie.countries?.some(c => c.name === 'Россия') || false,
            overview: cachedMovie.description,
            original_title: cachedMovie.alternativeName || cachedMovie.enName || cachedMovie.name,
            countries: cachedMovie.countries?.map(c => c.name) || [],
            ratingKinopoisk: cachedMovie.rating?.kp,
            ratingImdb: cachedMovie.rating?.imdb,
            ageRating: cachedMovie.ageRating,
            budget: cachedMovie.budget,
            fees: cachedMovie.fees,
            premiere: cachedMovie.premiere,
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
      name: 'Kinopoisk API Search',
      description: 'Поиск фильмов через официальный Kinopoisk API',
      sources: ['kinopoisk']
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