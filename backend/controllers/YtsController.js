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
          
          // Ищем торренты для фильма
          const torrents = await this.searchTorrents(details);
          
          // Форматируем результат
          return this.formatKinopoiskResult(details, torrents);
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
  formatKinopoiskResult(film, torrents) {
    // Выбираем лучший торрент (с наибольшим количеством сидов)
    const bestTorrent = torrents.length > 0 ? torrents[0] : null;
    
    return [{
      id: `kinopoisk_${film.id}`,
      movieId: `kinopoisk_${film.id}`,
      title: `${film.name || film.alternativeName || film.enName} (${film.year || 'N/A'})`,
      quality: bestTorrent ? 'Found' : 'Unknown',
      type: film.isSeries ? 'series' : 'movie',
      size: bestTorrent ? bestTorrent.size : 'Unknown',
      seeds: bestTorrent ? bestTorrent.seeds : 0,
      leeches: bestTorrent ? bestTorrent.leeches : 0,
      date: film.year ? `${film.year}-01-01` : new Date().toISOString(),
      hash: bestTorrent ? bestTorrent.link : '',
      torrentUrl: bestTorrent ? bestTorrent.link : '',
      magnet: bestTorrent ? bestTorrent.link : '',
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
      premiere: film.premiere,
      torrents: torrents // Добавляем найденные торренты
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
          // Ищем торренты для фильма, если их еще нет
          let torrents = [];
          if (!cachedMovie.torrents) {
            torrents = await this.searchTorrents(cachedMovie);
            // Обновляем кэш с торрентами
            cachedMovie.torrents = torrents;
            this.movieCache.set(movieId, cachedMovie);
          } else {
            torrents = cachedMovie.torrents;
          }

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
            torrents: torrents
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

  // Поиск торрентов для фильма
  async searchTorrents(film) {
    try {
      console.log(`[TORRENT] Поиск торрентов для: ${film.name || film.alternativeName || film.enName}`);
      
      // Формируем поисковые запросы, исключая null значения
      const searchQueries = [];
      
      if (film.name) {
        searchQueries.push(film.name);
        if (film.year) {
          searchQueries.push(`${film.name} ${film.year}`);
        }
      }
      
      if (film.alternativeName && film.alternativeName !== film.name) {
        searchQueries.push(film.alternativeName);
        if (film.year) {
          searchQueries.push(`${film.alternativeName} ${film.year}`);
        }
      }
      
      if (film.enName && film.enName !== film.name && film.enName !== film.alternativeName) {
        searchQueries.push(film.enName);
        if (film.year) {
          searchQueries.push(`${film.enName} ${film.year}`);
        }
      }

      console.log(`[TORRENT] Поисковые запросы:`, searchQueries);

      const allTorrents = [];

      for (const query of searchQueries) {
        try {
          console.log(`[TORRENT] Поиск для запроса: "${query}"`);
          
          // Поиск на Rutor
          const rutorTorrents = await this.searchRutor(query);
          allTorrents.push(...rutorTorrents);

          // Поиск на Nyaa (для аниме)
          if (film.genres?.some(g => g.name.toLowerCase().includes('аниме'))) {
            const nyaaTorrents = await this.searchNyaa(query);
            allTorrents.push(...nyaaTorrents);
          }
        } catch (error) {
          console.log(`[TORRENT] Ошибка поиска для "${query}":`, error.message);
        }
      }

      // Убираем дубликаты и сортируем по размеру
      const uniqueTorrents = this.removeDuplicateTorrents(allTorrents);
      console.log(`[TORRENT] Найдено ${uniqueTorrents.length} уникальных торрентов`);

      return uniqueTorrents;
    } catch (error) {
      console.log(`[TORRENT] Ошибка поиска торрентов:`, error.message);
      return [];
    }
  }

  // Поиск на Rutor
  async searchRutor(query) {
    try {
      console.log(`[RUTOR] Поиск: "${query}"`);
      const searchURL = 'http://rutor.info/search/' + encodeURIComponent(query);
      console.log(`[RUTOR] URL: ${searchURL}`);
      
      const response = await axios.get(searchURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000, // Увеличиваем таймаут до 30 секунд
        httpsAgent: this.httpsAgent,
        maxRedirects: 5
      });

      console.log(`[RUTOR] Ответ получен, статус: ${response.status}`);
      console.log(`[RUTOR] Размер ответа: ${response.data.length} символов`);
      
      const $ = require('cheerio').load(response.data);
      const torrents = [];

      // Попробуем разные селекторы
      const selectors = [
        'tr.gai', 
        'tr.tum', 
        '.gai', 
        '.tum', 
        'table tr:not(:first-child)',
        'tbody tr'
      ];
      
      for (const selector of selectors) {
        const elements = $(selector);
        console.log(`[RUTOR] Селектор "${selector}": найдено ${elements.length} элементов`);
        
        if (elements.length > 0) {
          elements.each((i, element) => {
            try {
              const $el = $(element);
              const titleElement = $el.find('a').first();
              const title = titleElement.text().trim();
              const link = titleElement.attr('href');
              
              // Ищем размер, сиды и личи в разных колонках
              const cells = $el.find('td');
              let size = '';
              let seeds = 0;
              let leeches = 0;
              
              if (cells.length >= 6) {
                size = $(cells[3]).text().trim();
                seeds = parseInt($(cells[4]).text().trim()) || 0;
                leeches = parseInt($(cells[5]).text().trim()) || 0;
              } else if (cells.length >= 4) {
                size = $(cells[2]).text().trim();
                seeds = parseInt($(cells[3]).text().trim()) || 0;
                leeches = 0;
              }

              if (title && link && title.length > 5) {
                // Фильтруем служебные записи
                const lowerTitle = title.toLowerCase();
                if (!lowerTitle.includes('новый адрес') && 
                    !lowerTitle.includes('блокировка') && 
                    !lowerTitle.includes('путеводитель') &&
                    !lowerTitle.includes('правила') &&
                    !lowerTitle.includes('руководства')) {
                  
                  torrents.push({
                    title: title,
                    size: size,
                    seeds: seeds,
                    leeches: leeches,
                    link: 'http://rutor.info' + link,
                    source: 'rutor'
                  });
                  console.log(`[RUTOR] Найден торрент: ${title.substring(0, 50)}... (${size}, ${seeds}↑)`);
                }
              }
            } catch (error) {
              console.log(`[RUTOR] Ошибка парсинга элемента ${i}:`, error.message);
            }
          });
          
          if (torrents.length > 0) {
            console.log(`[RUTOR] Найдено ${torrents.length} торрентов с селектором "${selector}"`);
            break;
          }
        }
      }

      // Если ничего не найдено, попробуем альтернативный подход
      if (torrents.length === 0) {
        console.log(`[RUTOR] Попытка альтернативного поиска...`);
        const allLinks = $('a[href*="/torrent/"]');
        console.log(`[RUTOR] Найдено ${allLinks.length} ссылок на торренты`);
        
        allLinks.each((i, element) => {
          try {
            const $el = $(element);
            const title = $el.text().trim();
            const link = $el.attr('href');
            
            if (title && link && title.length > 5) {
              const lowerTitle = title.toLowerCase();
              if (!lowerTitle.includes('новый адрес') && 
                  !lowerTitle.includes('блокировка') && 
                  !lowerTitle.includes('путеводитель')) {
                
                torrents.push({
                  title: title,
                  size: 'Unknown',
                  seeds: 0,
                  leeches: 0,
                  link: 'http://rutor.info' + link,
                  source: 'rutor'
                });
                console.log(`[RUTOR] Альтернативный поиск: ${title.substring(0, 50)}...`);
              }
            }
          } catch (error) {
            console.log(`[RUTOR] Ошибка альтернативного поиска:`, error.message);
          }
        });
      }

      return torrents;
    } catch (error) {
      console.log(`[RUTOR] Ошибка поиска:`, error.message);
      if (error.code === 'ECONNABORTED') {
        console.log(`[RUTOR] Таймаут соединения - сайт может быть медленным`);
      } else if (error.response) {
        console.log(`[RUTOR] HTTP ошибка: ${error.response.status}`);
      }
      return [];
    }
  }

  // Поиск на Nyaa
  async searchNyaa(query) {
    try {
      const searchURL = 'https://nyaa.si/?f=0&c=0_0&q=' + encodeURIComponent(query);
      
      const response = await axios.get(searchURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
        httpsAgent: this.httpsAgent
      });

      const $ = require('cheerio').load(response.data);
      const torrents = [];

      $('tbody tr').each((i, element) => {
        const $el = $(element);
        const title = $el.find('td').eq(1).find('a').last().text().trim();
        const size = $el.find('td').eq(3).text().trim();
        const seeds = parseInt($el.find('td').eq(5).text().trim()) || 0;
        const leeches = parseInt($el.find('td').eq(6).text().trim()) || 0;
        const link = $el.find('td').eq(1).find('a').last().attr('href');

        if (title && link) {
          torrents.push({
            title: title,
            size: size,
            seeds: seeds,
            leeches: leeches,
            link: 'https://nyaa.si' + link,
            source: 'nyaa'
          });
        }
      });

      return torrents;
    } catch (error) {
      console.log(`[NYAA] Ошибка поиска:`, error.message);
      return [];
    }
  }

  // Удаление дубликатов торрентов
  removeDuplicateTorrents(torrents) {
    const seen = new Set();
    return torrents.filter(torrent => {
      const key = `${torrent.title}_${torrent.size}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).sort((a, b) => b.seeds - a.seeds); // Сортировка по количеству сидов
  }
}

module.exports = YtsController;