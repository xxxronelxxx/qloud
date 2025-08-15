const axios = require('axios');
const parseTorrent = require('parse-torrent');
const Settings = require('../models/SettingsModel');

class YtsController {
  constructor() {
    this.baseApi = 'https://yts.mx/api/v2';
    const cfg = Settings.readConfig();
    this.tmdbApiKey = (cfg && cfg.tmdbApiKey) || process.env.TMDB_API_KEY || '';
  }

  hasNonAscii(text) {
    return /[^\x00-\x7F]/.test(text || '');
  }

  async tmdbResolveQuery(query) {
    if (!this.tmdbApiKey) return null;
    try {
      const url = `https://api.themoviedb.org/3/search/movie?api_key=${this.tmdbApiKey}&language=ru-RU&query=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { timeout: 12000 });
      const results = (data && data.results) || [];
      if (!results.length) return null;
      const best = results[0];
      // Получим внешние ID (IMDB)
      let imdb_id = '';
      try {
        const ext = await axios.get(`https://api.themoviedb.org/3/movie/${best.id}/external_ids?api_key=${this.tmdbApiKey}`, { timeout: 12000 });
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
    // Пробуем прямой поиск на YTS
    const url = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(query)}&page=${page}&limit=20`;
    const { data } = await axios.get(url, { timeout: 15000 });
    if (data && data.status === 'ok' && data.data) {
      const movies = data.data.movies || [];
      if (movies.length) return this.normalizeMovies(movies);
    }

    // Fallback: если есть кириллица/не ASCII и задан TMDB ключ — резолвим на TMDB
    if (this.tmdbApiKey && this.hasNonAscii(query)) {
      const resolved = await this.tmdbResolveQuery(query);
      if (resolved) {
        // Пробуем сперва по IMDB id (если поддерживается), иначе по оригинальному названию
        let url2 = '';
        if (resolved.imdb_id) {
          url2 = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(resolved.imdb_id)}&limit=20`;
        } else {
          url2 = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(resolved.original_title)}&limit=20`;
        }
        const { data: data2 } = await axios.get(url2, { timeout: 15000 });
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
    const resp = await axios.get(torrentUrl, { responseType: 'arraybuffer', timeout: 20000 });
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
    const { data } = await axios.get(url, { timeout: 15000 });
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