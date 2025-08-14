const axios = require('axios');
const cheerio = require('cheerio');

class KinozalController {
  constructor() {
    this.baseUrl = 'https://kinozal.tv';
    this.session = null;
  }

  // Авторизация на сайте
  async login(login, password) {
    try {
      // Получаем страницу входа для получения токенов
      const loginPageResponse = await axios.get(`${this.baseUrl}/takelogin.php`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(loginPageResponse.data);
      
      // Ищем скрытые поля формы
      const formData = new URLSearchParams();
      formData.append('username', login);
      formData.append('password', password);
      formData.append('returnto', '');
      
      // Добавляем скрытые поля из формы
      $('input[type="hidden"]').each((i, elem) => {
        const name = $(elem).attr('name');
        const value = $(elem).attr('value');
        if (name && value) {
          formData.append(name, value);
        }
      });

      // Выполняем авторизацию
      const loginResponse = await axios.post(`${this.baseUrl}/takelogin.php`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Принимаем редиректы
        }
      });

      // Сохраняем cookies для последующих запросов
      this.session = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      // Копируем cookies из ответа
      if (loginResponse.headers['set-cookie']) {
        this.session.defaults.headers.Cookie = loginResponse.headers['set-cookie'].join('; ');
      }

      return true;
    } catch (error) {
      console.error('Kinozal login error:', error.message);
      return false;
    }
  }

  // Поиск торрентов
  async searchTorrents(query, page = 1) {
    try {
      if (!this.session) {
        throw new Error('Не выполнена авторизация');
      }

      const searchUrl = `${this.baseUrl}/browse.php?s=${encodeURIComponent(query)}&g=0&c=0&v=0&d=0&w=0&t=0&f=0&o=1&p=${page}`;
      
      const response = await this.session.get(searchUrl);
      const $ = cheerio.load(response.data);

      const torrents = [];

      // Парсим результаты поиска
      $('.t_peer').each((i, elem) => {
        const $row = $(elem);
        const $titleCell = $row.find('.nam');
        const $titleLink = $titleCell.find('a');
        
        if ($titleLink.length > 0) {
          const title = $titleLink.text().trim();
          const torrentUrl = $titleLink.attr('href');
          const torrentId = torrentUrl ? torrentUrl.match(/id=(\d+)/)?.[1] : null;
          
          const size = $row.find('.s').text().trim();
          const seeds = $row.find('.sl_s').text().trim();
          const leeches = $row.find('.sl_l').text().trim();
          const date = $row.find('.s').next().text().trim();

          if (torrentId) {
            torrents.push({
              id: torrentId,
              title: title,
              size: size,
              seeds: seeds,
              leeches: leeches,
              date: date,
              url: `${this.baseUrl}${torrentUrl}`
            });
          }
        }
      });

      return torrents;
    } catch (error) {
      console.error('Kinozal search error:', error.message);
      throw error;
    }
  }

  // Получение списка файлов торрента
  async getTorrentFiles(torrentId) {
    try {
      if (!this.session) {
        throw new Error('Не выполнена авторизация');
      }

      const torrentUrl = `${this.baseUrl}/details.php?id=${torrentId}`;
      const response = await this.session.get(torrentUrl);
      const $ = cheerio.load(response.data);

      const files = [];

      // Парсим список файлов
      $('.t_files tr').each((i, elem) => {
        const $row = $(elem);
        const $cells = $row.find('td');
        
        if ($cells.length >= 3) {
          const fileName = $cells.eq(0).text().trim();
          const fileSize = $cells.eq(1).text().trim();
          const filePath = $cells.eq(0).find('span').attr('title') || fileName;

          if (fileName && fileSize) {
            files.push({
              name: fileName,
              path: filePath,
              size: fileSize
            });
          }
        }
      });

      return files;
    } catch (error) {
      console.error('Kinozal get files error:', error.message);
      throw error;
    }
  }

  // Получение magnet-ссылки
  async getMagnetLink(torrentId) {
    try {
      if (!this.session) {
        throw new Error('Не выполнена авторизация');
      }

      const downloadUrl = `${this.baseUrl}/download.php?id=${torrentId}`;
      const response = await this.session.get(downloadUrl, {
        responseType: 'arraybuffer'
      });

      // Проверяем, что получили .torrent файл
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/x-bittorrent')) {
        // Возвращаем magnet-ссылку (в реальности нужно парсить .torrent файл)
        return `magnet:?xt=urn:btih:${torrentId}`;
      }

      throw new Error('Не удалось получить торрент файл');
    } catch (error) {
      console.error('Kinozal get magnet error:', error.message);
      throw error;
    }
  }

  // Тест подключения
  async testConnection(login, password) {
    try {
      const success = await this.login(login, password);
      if (success) {
        // Пробуем выполнить простой поиск для проверки
        await this.searchTorrents('test', 1);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Kinozal test connection error:', error.message);
      return false;
    }
  }
}

module.exports = KinozalController;