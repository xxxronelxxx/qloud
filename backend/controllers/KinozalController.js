const axios = require('axios');
const cheerio = require('cheerio');
const Settings = require('../models/SettingsModel');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

class KinozalController {
  constructor() {
    this.baseUrl = 'https://kinozal.tv';
    this.session = null;
    this.cookies = [];
    this.proxyAgent = null;

    const cfg = Settings.readConfig();
    this.userCookies = cfg.kinozalCookies || '';
    this.proxyUrl = cfg.kinozalProxy || '';

    if (this.proxyUrl) {
      try {
        if (this.proxyUrl.startsWith('socks')) {
          this.proxyAgent = new SocksProxyAgent(this.proxyUrl);
        } else {
          this.proxyAgent = new HttpsProxyAgent(this.proxyUrl);
        }
      } catch (_) {}
    }
  }

  refreshConfig() {
    const cfg = Settings.readConfig();
    this.userCookies = cfg.kinozalCookies || '';
    this.proxyUrl = cfg.kinozalProxy || '';
    this.proxyAgent = null;
    if (this.proxyUrl) {
      try {
        if (this.proxyUrl.startsWith('socks')) {
          this.proxyAgent = new SocksProxyAgent(this.proxyUrl);
        } else {
          this.proxyAgent = new HttpsProxyAgent(this.proxyUrl);
        }
      } catch (_) {}
    }
  }

  // Создание axios инстанса с правильными заголовками
  createSession() {
    const instance = axios.create({
      baseURL: this.baseUrl,
      timeout: 45000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...(this.userCookies ? { Cookie: this.userCookies } : {})
      },
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
      httpAgent: this.proxyAgent || undefined,
      httpsAgent: this.proxyAgent || undefined
    });
    return instance;
  }

  // Создание простой сессии с минимальными заголовками
  createSimpleSession() {
    const instance = axios.create({
      baseURL: this.baseUrl,
      timeout: 45000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(this.userCookies ? { Cookie: this.userCookies } : {})
      },
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
      httpAgent: this.proxyAgent || undefined,
      httpsAgent: this.proxyAgent || undefined
    });
    return instance;
  }

  // Обновление cookies в сессии
  updateCookies(response) {
    const dynamicCookies = [];
    if (response && response.headers && response.headers['set-cookie']) {
      dynamicCookies.push(...response.headers['set-cookie'].map(c => c.split(';')[0]));
    }
    const merged = [];
    if (this.userCookies) merged.push(this.userCookies);
    if (dynamicCookies.length) merged.push(dynamicCookies.join('; '));
    const cookieHeader = merged.join('; ');
    if (!this.session) return;
    if (!this.session.defaults.headers) this.session.defaults.headers = {};
    if (!this.session.defaults.headers.common) this.session.defaults.headers.common = {};
    this.session.defaults.headers.common['Cookie'] = cookieHeader;
  }

  // Проверка доступности сайта
  async checkSiteAvailability() {
    try {
      this.refreshConfig();
      console.log('Проверяем доступность сайта...');
      const response = await axios.get(this.baseUrl, {
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(this.userCookies ? { Cookie: this.userCookies } : {})
        },
        httpAgent: this.proxyAgent || undefined,
        httpsAgent: this.proxyAgent || undefined
      });
      console.log('Сайт доступен, статус:', response.status);
      return true;
    } catch (error) {
      console.error('Сайт недоступен:', error.message);
      return false;
    }
  }

  // Авторизация на сайте
  async login(login, password) {
    try {
      console.log('Начинаем авторизацию на Kinozal.tv...');
      
      // Проверяем доступность сайта
      const isAvailable = await this.checkSiteAvailability();
      if (!isAvailable) {
        throw new Error('Сайт недоступен');
      }
      
      // Создаем новую сессию
      this.refreshConfig();
      this.session = this.createSession();
      
      // Получаем главную страницу для получения начальных cookies
      console.log('Получаем главную страницу...');
      const mainPageResponse = await this.session.get('/');
      this.updateCookies(mainPageResponse);
      
      // Получаем страницу входа
      console.log('Получаем страницу входа...');
      const loginPageResponse = await this.session.get('/takelogin.php');
      this.updateCookies(loginPageResponse);
      
      const $ = cheerio.load(loginPageResponse.data);
      
      // Проверяем, что мы на странице входа
      const loginForm = $('form[action*="takelogin"]');
      if (loginForm.length === 0) {
        console.log('Форма входа не найдена, возможно уже авторизованы');
        return true;
      }
      
      // Собираем данные формы
      const formData = new URLSearchParams();
      formData.append('username', login);
      formData.append('password', password);
      formData.append('returnto', '');
      
      // Добавляем скрытые поля из формы
      loginForm.find('input[type="hidden"]').each((i, elem) => {
        const name = $(elem).attr('name');
        const value = $(elem).attr('value');
        if (name && value) {
          formData.append(name, value);
        }
      });
      
      console.log('Отправляем данные авторизации...');
      
      // Выполняем авторизацию
      const loginResponse = await this.session.post('/takelogin.php', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/takelogin.php`
        }
      });
      
      this.updateCookies(loginResponse);
      
      // Проверяем успешность авторизации
      console.log('Проверяем результат авторизации...');
      const checkResponse = await this.session.get('/');
      const $check = cheerio.load(checkResponse.data);
      
      // Ищем признаки успешной авторизации
      const userMenu = $check('.user-menu, .profile, .user-info');
      const logoutLink = $check('a[href*="logout"], a[href*="exit"]');
      const loginFormCheck = $check('form[action*="takelogin"]');
      
      if (userMenu.length > 0 || logoutLink.length > 0 || loginFormCheck.length === 0) {
        console.log('Авторизация успешна!');
        return true;
      } else {
        console.log('Авторизация не удалась');
        return false;
      }
      
    } catch (error) {
      console.error('Kinozal login error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      }
      return false;
    }
  }

  // Поиск торрентов
  async searchTorrents(query, page = 1) {
    try {
      if (!this.session) {
        throw new Error('Не выполнена авторизация');
      }

      console.log(`Поиск торрентов: "${query}", страница ${page}`);
      
      const searchUrl = `/browse.php?s=${encodeURIComponent(query)}&g=0&c=0&v=0&d=0&w=0&t=0&f=0&o=1&p=${page}`;
      
      const response = await this.session.get(searchUrl);
      const $ = cheerio.load(response.data);

      const torrents = [];

      // Парсим результаты поиска
      $('.t_peer, tr[class*="t_"]').each((i, elem) => {
        const $row = $(elem);
        const $titleCell = $row.find('.nam, td:first-child');
        const $titleLink = $titleCell.find('a');
        
        if ($titleLink.length > 0) {
          const title = $titleLink.text().trim();
          const torrentUrl = $titleLink.attr('href');
          const torrentId = torrentUrl ? torrentUrl.match(/id=(\d+)/)?.[1] : null;
          
          const size = $row.find('.s, td:nth-child(2)').text().trim();
          const seeds = $row.find('.sl_s, td:nth-child(3)').text().trim();
          const leeches = $row.find('.sl_l, td:nth-child(4)').text().trim();
          const date = $row.find('td:last-child').text().trim();

          if (torrentId && title) {
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

      console.log(`Найдено торрентов: ${torrents.length}`);
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

      console.log(`Получение файлов торрента: ${torrentId}`);
      
      const torrentUrl = `/details.php?id=${torrentId}`;
      const response = await this.session.get(torrentUrl);
      const $ = cheerio.load(response.data);

      const files = [];

      // Парсим список файлов
      $('.t_files tr, table tr').each((i, elem) => {
        const $row = $(elem);
        const $cells = $row.find('td');
        
        if ($cells.length >= 2) {
          const fileName = $cells.eq(0).text().trim();
          const fileSize = $cells.eq(1).text().trim();
          const filePath = $cells.eq(0).find('span').attr('title') || fileName;

          if (fileName && fileSize && fileName !== 'Имя файла') {
            files.push({
              name: fileName,
              path: filePath,
              size: fileSize
            });
          }
        }
      });

      console.log(`Найдено файлов: ${files.length}`);
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

      console.log(`Получение magnet-ссылки для торрента: ${torrentId}`);
      
      // Сначала получаем страницу торрента
      const detailsUrl = `/details.php?id=${torrentId}`;
      const detailsResponse = await this.session.get(detailsUrl);
      const $ = cheerio.load(detailsResponse.data);
      
      // Ищем magnet-ссылку на странице
      const magnetLink = $('a[href^="magnet:"]').attr('href');
      
      if (magnetLink) {
        console.log('Magnet-ссылка найдена на странице');
        return magnetLink;
      }
      
      // Если magnet-ссылка не найдена, пробуем скачать .torrent файл
      console.log('Magnet-ссылка не найдена, пробуем скачать .torrent файл...');
      
      const downloadUrl = `/download.php?id=${torrentId}`;
      const downloadResponse = await this.session.get(downloadUrl, {
        responseType: 'arraybuffer'
      });

      // Проверяем, что получили .torrent файл
      const contentType = downloadResponse.headers['content-type'];
      if (contentType && contentType.includes('application/x-bittorrent')) {
        // В реальности нужно парсить .torrent файл для получения magnet-ссылки
        // Пока возвращаем заглушку
        console.log('Получен .torrent файл');
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
      console.log('Тестирование подключения к Kinozal.tv...');
      
      const success = await this.login(login, password);
      if (success) {
        // Пробуем выполнить простой поиск для проверки
        console.log('Выполняем тестовый поиск...');
        const torrents = await this.searchTorrents('test', 1);
        console.log('Тестовый поиск выполнен успешно');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Kinozal test connection error:', error.message);
      return false;
    }
  }

  // Простой тест подключения без поиска
  async simpleTestConnection(login, password) {
    try {
      console.log('Простое тестирование подключения к Kinozal.tv...');
      
      // Проверяем доступность сайта
      const isAvailable = await this.checkSiteAvailability();
      if (!isAvailable) {
        throw new Error('Сайт недоступен');
      }
      
      // Создаем новую сессию
      this.refreshConfig();
      this.session = this.createSession();
      
      // Получаем главную страницу
      console.log('Получаем главную страницу...');
      const mainPageResponse = await this.session.get('/');
      this.updateCookies(mainPageResponse);
      console.log('Главная страница получена, статус:', mainPageResponse.status);
      
      // Получаем страницу входа
      console.log('Получаем страницу входа...');
      const loginPageResponse = await this.session.get('/takelogin.php');
      this.updateCookies(loginPageResponse);
      console.log('Страница входа получена, статус:', loginPageResponse.status);
      
      const $ = cheerio.load(loginPageResponse.data);
      
      // Проверяем, что мы на странице входа
      const loginForm = $('form[action*="takelogin"]');
      console.log('Найдено форм входа:', loginForm.length);
      
      if (loginForm.length === 0) {
        console.log('Форма входа не найдена');
        return false;
      }
      
      // Собираем данные формы
      const formData = new URLSearchParams();
      formData.append('username', login);
      formData.append('password', password);
      formData.append('returnto', '');
      
      // Добавляем скрытые поля из формы
      let hiddenFieldsCount = 0;
      loginForm.find('input[type="hidden"]').each((i, elem) => {
        const name = $(elem).attr('name');
        const value = $(elem).attr('value');
        if (name && value) {
          formData.append(name, value);
          hiddenFieldsCount++;
        }
      });
      console.log('Добавлено скрытых полей:', hiddenFieldsCount);
      
      console.log('Отправляем данные авторизации...');
      
      // Выполняем авторизацию
      const loginResponse = await this.session.post('/takelogin.php', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/takelogin.php`
        }
      });
      
      this.updateCookies(loginResponse);
      console.log('Ответ на авторизацию получен, статус:', loginResponse.status);
      
      // Проверяем успешность авторизации
      console.log('Проверяем результат авторизации...');
      const checkResponse = await this.session.get('/');
      const $check = cheerio.load(checkResponse.data);
      
      // Ищем признаки успешной авторизации
      const userMenu = $check('.user-menu, .profile, .user-info');
      const logoutLink = $check('a[href*="logout"], a[href*="exit"]');
      const loginFormCheck = $check('form[action*="takelogin"]');
      
      console.log('Найдено элементов пользователя:', userMenu.length);
      console.log('Найдено ссылок выхода:', logoutLink.length);
      console.log('Найдено форм входа после авторизации:', loginFormCheck.length);
      
      if (userMenu.length > 0 || logoutLink.length > 0 || loginFormCheck.length === 0) {
        console.log('Авторизация успешна!');
        return true;
      } else {
        console.log('Авторизация не удалась');
        return false;
      }
      
    } catch (error) {
      console.error('Kinozal simple test error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      }
      return false;
    }
  }

  // Альтернативный метод авторизации с минимальными заголовками
  async alternativeLogin(login, password) {
    try {
      console.log('Альтернативная авторизация на Kinozal.tv...');
      
      // Проверяем доступность сайта
      const isAvailable = await this.checkSiteAvailability();
      if (!isAvailable) {
        throw new Error('Сайт недоступен');
      }
      
      // Создаем простую сессию
      const simpleSession = this.createSimpleSession();
      
      // Получаем страницу входа
      console.log('Получаем страницу входа...');
      const loginPageResponse = await simpleSession.get('/takelogin.php');
      console.log('Страница входа получена, статус:', loginPageResponse.status);
      
      const $ = cheerio.load(loginPageResponse.data);
      
      // Проверяем, что мы на странице входа
      const loginForm = $('form[action*="takelogin"]');
      console.log('Найдено форм входа:', loginForm.length);
      
      if (loginForm.length === 0) {
        console.log('Форма входа не найдена');
        return false;
      }
      
      // Собираем данные формы
      const formData = new URLSearchParams();
      formData.append('username', login);
      formData.append('password', password);
      formData.append('returnto', '');
      
      // Добавляем скрытые поля из формы
      let hiddenFieldsCount = 0;
      loginForm.find('input[type="hidden"]').each((i, elem) => {
        const name = $(elem).attr('name');
        const value = $(elem).attr('value');
        if (name && value) {
          formData.append(name, value);
          hiddenFieldsCount++;
        }
      });
      console.log('Добавлено скрытых полей:', hiddenFieldsCount);
      
      console.log('Отправляем данные авторизации...');
      
      // Выполняем авторизацию
      const loginResponse = await simpleSession.post('/takelogin.php', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log('Ответ на авторизацию получен, статус:', loginResponse.status);
      
      // Проверяем успешность авторизации
      console.log('Проверяем результат авторизации...');
      const checkResponse = await simpleSession.get('/');
      const $check = cheerio.load(checkResponse.data);
      
      // Ищем признаки успешной авторизации
      const userMenu = $check('.user-menu, .profile, .user-info');
      const logoutLink = $check('a[href*="logout"], a[href*="exit"]');
      const loginFormCheck = $check('form[action*="takelogin"]');
      
      console.log('Найдено элементов пользователя:', userMenu.length);
      console.log('Найдено ссылок выхода:', logoutLink.length);
      console.log('Найдено форм входа после авторизации:', loginFormCheck.length);
      
      if (userMenu.length > 0 || logoutLink.length > 0 || loginFormCheck.length === 0) {
        console.log('Альтернативная авторизация успешна!');
        // Сохраняем сессию для дальнейшего использования
        this.session = simpleSession;
        return true;
      } else {
        console.log('Альтернативная авторизация не удалась');
        return false;
      }
      
    } catch (error) {
      console.error('Kinozal alternative login error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
      }
      return false;
    }
  }

  // Метод для проверки только доступности сайта
  async testSiteAccess() {
    try {
      console.log('Проверяем доступность сайта Kinozal.tv...');
      const isAvailable = await this.checkSiteAvailability();
      if (isAvailable) {
        console.log('Сайт доступен');
        return true;
      } else {
        console.log('Сайт недоступен');
        return false;
      }
    } catch (error) {
      console.error('Ошибка проверки доступности:', error.message);
      return false;
    }
  }
}

module.exports = KinozalController;