const axios = require('axios');
const parseTorrent = require('parse-torrent');
const Settings = require('../models/SettingsModel');
const https = require('https');

class YtsController {
  constructor() {
    this.baseApi = 'https://yts.mx/api/v2';
    const cfg = Settings.readConfig();
    this.tmdbApiKey = (cfg && cfg.tmdbApiKey) || process.env.TMDB_API_KEY || '';
    this.httpsAgent = new https.Agent({ keepAlive: false });
  }

  hasNonAscii(text) {
    return /[^\x00-\x7F]/.test(text || '');
  }

  translitRuToEn(text) {
    if (!text) return '';
    const map = {
      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya'
    };
    return Array.from(text).map(ch => map[ch] ?? ch).join('');
  }

  async tmdbResolveQuery(query) {
    if (!this.tmdbApiKey) return null;
    try {
      const url = `https://api.themoviedb.org/3/search/movie?api_key=${this.tmdbApiKey}&language=ru-RU&query=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { timeout: 12000, proxy: false, httpsAgent: this.httpsAgent });
      const results = (data && data.results) || [];
      if (!results.length) return null;
      const best = results[0];
      // Получим внешние ID (IMDB)
      let imdb_id = '';
      try {
        const ext = await axios.get(`https://api.themoviedb.org/3/movie/${best.id}/external_ids?api_key=${this.tmdbApiKey}`, { timeout: 12000, proxy: false, httpsAgent: this.httpsAgent });
        imdb_id = (ext && ext.data && ext.data.imdb_id) || '';
      } catch(_) {}
      return {
        original_title: best.original_title || best.title,
        year: (best.release_date || '').slice(0,4),
        imdb_id
      };
    } catch (_) {
      return null;
    }
  }

  normalizeMovies(movies) {
    const results = [];
    for (const m of movies) {
      const title = `${m.title} (${m.year})`;
      const torrents = m.torrents || [];
      for (const t of torrents) {
        results.push({
          id: `${m.id}_${t.hash}`,
          movieId: m.id,
          title: `${title} [${t.quality} ${t.type}]`,
          quality: t.quality,
          type: t.type,
          size: t.size,
          seeds: t.seeds,
          leeches: t.peers,
          date: t.date_uploaded,
          hash: t.hash,
          torrentUrl: t.url, // ссылка на .torrent
          magnet: this.buildMagnet(t.hash, `${m.title}.${t.quality}`),
          poster: m.medium_cover_image || m.small_cover_image || '',
          year: m.year,
          rating: m.rating
        });
      }
    }
    return results;
  }

  async search(query, page = 1) {
    // обновляем ключ на случай изменения в настройках без перезапуска
    try {
      const cfg = Settings.readConfig();
      this.tmdbApiKey = (cfg && cfg.tmdbApiKey) || process.env.TMDB_API_KEY || '';
    } catch (_) {}

    // Прямой поиск на YTS (принудительно без прокси)
    const url = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(query)}&page=${page}&limit=20`;
    const { data } = await axios.get(url, { timeout: 15000, proxy: false, httpsAgent: this.httpsAgent });
    if (data && data.status === 'ok' && data.data) {
      const movies = data.data.movies || [];
      if (movies.length) return this.normalizeMovies(movies);
    }

    // Если кириллица — пробуем транслит и ещё раз на YTS
    if (this.hasNonAscii(query)) {
      const tr = this.translitRuToEn(query);
      if (tr && tr !== query) {
        const urlTr = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(tr)}&page=${page}&limit=20`;
        const { data: dataTr } = await axios.get(urlTr, { timeout: 15000, proxy: false, httpsAgent: this.httpsAgent });
        if (dataTr && dataTr.status === 'ok' && dataTr.data) {
          const moviesTr = dataTr.data.movies || [];
          if (moviesTr.length) return this.normalizeMovies(moviesTr);
        }
      }
    }

    // Fallback через TMDB для русскоязычных запросов
    if (this.tmdbApiKey && this.hasNonAscii(query)) {
      const resolved = await this.tmdbResolveQuery(query);
      if (resolved) {
        // Пробуем сперва по IMDB id, затем по оригинальному названию
        let url2 = '';
        if (resolved.imdb_id) {
          url2 = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(resolved.imdb_id)}&limit=20`;
        } else {
          url2 = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(resolved.original_title)}&limit=20`;
        }
        const { data: data2 } = await axios.get(url2, { timeout: 15000, proxy: false, httpsAgent: this.httpsAgent });
        if (data2 && data2.status === 'ok' && data2.data) {
          const movies2 = data2.data.movies || [];
          if (movies2.length) return this.normalizeMovies(movies2);
        }
      }
    }

    return [];
  }

  buildMagnet(hash, name) {
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

  async getFilesByTorrentUrl(torrentUrl) {
    const resp = await axios.get(torrentUrl, { responseType: 'arraybuffer', timeout: 20000, proxy: false, httpsAgent: this.httpsAgent });
    const tor = parseTorrent(Buffer.from(resp.data));
    const files = (tor.files || []).map(f => ({
      name: f.name,
      path: f.path,
      length: f.length
    }));
    return { name: tor.name, files };
  }

  async details(movieId) {
    const url = `${this.baseApi}/movie_details.json?movie_id=${encodeURIComponent(movieId)}&with_images=true&with_cast=true`;
    const { data } = await axios.get(url, { timeout: 15000, proxy: false, httpsAgent: this.httpsAgent });
    const m = data && data.data && data.data.movie;
    if (!m) return null;
    return {
      id: m.id,
      title: m.title,
      year: m.year,
      rating: m.rating,
      runtime: m.runtime,
      genres: m.genres || [],
      description: m.description_full || m.summary || '',
      poster: m.large_cover_image || m.medium_cover_image || m.small_cover_image || '',
      background: m.background_image_original || m.background_image || '',
      imdbCode: m.imdb_code || '',
      cast: (m.cast || []).map(c => ({ name: c.name, character: c.character_name, url: c.url_small_image })),
      torrents: (m.torrents || []).map(t => ({
        quality: t.quality,
        type: t.type,
        size: t.size,
        seeds: t.seeds,
        peers: t.peers,
        hash: t.hash,
        url: t.url,
        magnet: this.buildMagnet(t.hash, `${m.title}.${t.quality}`)
      }))
    };
  }
}

module.exports = YtsController;