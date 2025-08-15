const axios = require('axios');
const parseTorrent = require('parse-torrent');

class YtsController {
  constructor() {
    this.baseApi = 'https://yts.mx/api/v2';
  }

  async search(query, page = 1) {
    const url = `${this.baseApi}/list_movies.json?query_term=${encodeURIComponent(query)}&page=${page}&limit=20`;
    const { data } = await axios.get(url, { timeout: 15000 });
    if (!data || data.status !== 'ok' || !data.data) return [];
    const movies = data.data.movies || [];
    // Нормализуем в список "торрентов"
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
          magnet: this.buildMagnet(t.hash, `${m.title}.${t.quality}`)
        });
      }
    }
    return results;
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
}

module.exports = YtsController;