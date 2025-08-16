const axios = require('axios');
const parseTorrent = require('parse-torrent');
const Settings = require('../models/SettingsModel');
const RussianMovieService = require('../services/RussianMovieService');
const https = require('https');

class YtsController {
  constructor() {
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      timeout: 10000
    });
  }

  // Проверка наличия не-ASCII символов (кириллица)
  hasNonAscii(str) {
    return /[^\x00-\x7F]/.test(str);
  }

  // Форматирование русских фильмов (без торрентов)
  formatRussianMovie(russianMovie) {
    // Определяем URL постера
    let posterUrl = '';
    if (russianMovie.poster_path) {
      if (russianMovie.poster_path.startsWith('http')) {
        posterUrl = russianMovie.poster_path;
      } else {
        posterUrl = `https://image.tmdb.org/t/p/w500${russianMovie.poster_path}`;
      }
    }
    
    return [{
      id: `russian_${russianMovie.id}`,
      movieId: russianMovie.id,
      title: `${russianMovie.title} (${russianMovie.year}) [Русский фильм]`,
      quality: 'Unknown',
      type: 'movie',
      size: 'Unknown',
      seeds: 0,
      leeches: 0,
      date: russianMovie.release_date || new Date().toISOString(),
      hash: '',
      torrentUrl: '',
      magnet: '',
      poster: posterUrl,
      year: russianMovie.year,
      rating: russianMovie.rating,
      overview: russianMovie.overview,
      director: russianMovie.director,
      cast: russianMovie.cast,
      genres: russianMovie.genres,
      runtime: russianMovie.runtime,
      source: russianMovie.source,
      is_russian: russianMovie.is_russian,
      type: russianMovie.type,
      original_title: russianMovie.original_title
    }];
  }

  async search(query, page = 1) {
    console.log(`[RUSSIAN] Поиск: "${query}" (страница ${page})`);
    
    // Поиск русских фильмов через RussianMovieService
    try {
      console.log(`[RUSSIAN] Поиск русских фильмов для "${query}"...`);
      const russianMovie = await RussianMovieService.searchRussianMovies(query);
      
      if (russianMovie) {
        console.log(`[RUSSIAN] Найден русский фильм: ${russianMovie.title} (${russianMovie.source})`);
        return this.formatRussianMovie(russianMovie);
      } else {
        console.log(`[RUSSIAN] Русский фильм не найден для "${query}"`);
        return [];
      }
    } catch (error) {
      console.log(`[RUSSIAN] Ошибка поиска русских фильмов:`, error.message);
      return [];
    }
  }

  // Получение детальной информации о фильме
  async getMovieDetails(movieId) {
    try {
      console.log(`[RUSSIAN] Получение деталей фильма: ${movieId}`);
      
      // Если это русский фильм, получаем детали через RussianMovieService
      if (movieId.startsWith('russian_')) {
        const actualId = movieId.replace('russian_', '');
        const details = await RussianMovieService.getRussianMovieDetails(actualId);
        return details;
      }
      
      return null;
    } catch (error) {
      console.error(`[RUSSIAN] Ошибка получения деталей:`, error.message);
      return null;
    }
  }

  // Получение торрентов для фильма (заглушка для русских фильмов)
  async getMovieTorrents(movieId) {
    try {
      console.log(`[RUSSIAN] Получение торрентов для: ${movieId}`);
      
      // Для русских фильмов возвращаем пустой массив, так как торренты не интегрированы
      if (movieId.startsWith('russian_')) {
        return [];
      }
      
      return [];
    } catch (error) {
      console.error(`[RUSSIAN] Ошибка получения торрентов:`, error.message);
      return [];
    }
  }

  // Статистика
  getStats() {
    return {
      name: 'Russian Movies Search',
      description: 'Поиск русских фильмов через Kinopoisk и другие русские источники',
      sources: ['kinopoisk', 'kinopoisk_web', 'rutor', 'nyaa']
    };
  }
}

module.exports = YtsController;