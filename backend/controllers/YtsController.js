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
    this.movieCache = new Map(); // Кэш для найденных фильмов
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
        
        // Сохраняем данные фильма в кэше для деталей
        const movieId = `russian_${russianMovie.id}`;
        this.movieCache.set(movieId, russianMovie);
        
        const ytsFormatResult = this.formatRussianMovie(russianMovie);
        
        return ytsFormatResult;
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
  async details(movieId) {
    try {
      console.log(`[RUSSIAN] Получение деталей фильма: ${movieId}`);
      
      // Если это русский фильм, получаем детали из кэша
      if (movieId.startsWith('russian_')) {
        const cachedMovie = this.movieCache.get(movieId);
        
        if (cachedMovie) {
          return {
            id: cachedMovie.id,
            title: cachedMovie.title,
            year: cachedMovie.year,
            rating: cachedMovie.rating,
            runtime: cachedMovie.runtime,
            genres: cachedMovie.genres || [],
            description: cachedMovie.overview || '',
            poster: cachedMovie.poster_path ? `https://image.tmdb.org/t/p/w500${cachedMovie.poster_path}` : '',
            background: cachedMovie.backdrop_path ? `https://image.tmdb.org/t/p/original${cachedMovie.backdrop_path}` : '',
            imdbCode: '',
            cast: cachedMovie.cast || [],
            director: cachedMovie.director,
            source: cachedMovie.source,
            is_russian: cachedMovie.is_russian,
            overview: cachedMovie.overview,
            original_title: cachedMovie.original_title,
            torrents: [] // Русские фильмы не имеют торрентов в системе
          };
        }
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

  // Создание magnet-ссылки (заглушка для совместимости)
  buildMagnet(hash, name = '') {
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://opentracker.i2p.rocks:6969/announce',
      'udp://tracker.tiny-vps.com:6969/announce',
      'udp://tracker.internetwarriors.net:1337/announce'
    ];
    const tr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    const dn = name ? `&dn=${encodeURIComponent(name)}` : '';
    return `magnet:?xt=urn:btih:${hash}${dn}${tr}`;
  }

  // Получение файлов по URL торрента (заглушка для совместимости)
  async getFilesByTorrentUrl(torrentUrl) {
    return {
      name: 'Russian Movie',
      files: []
    };
  }
}

module.exports = YtsController;