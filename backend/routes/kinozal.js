const { Router } = require('express');
const router = Router();
const KinozalController = require('../controllers/KinozalController');
const SettingsModel = require('../models/SettingsModel');

// Создаем экземпляр контроллера
const kinozalController = new KinozalController();
const settingsModel = SettingsModel;

// Тест подключения к Kinozal.tv
router.post('/test', async (req, res) => {
  try {
    const { login, password } = req.body;
    
    if (!login || !password) {
      return res.json({ success: false, msg: 'Необходимо указать логин и пароль' });
    }

    const success = await kinozalController.testConnection(login, password);
    
    if (success) {
      res.json({ success: true, msg: 'Подключение успешно' });
    } else {
      res.json({ success: false, msg: 'Неверный логин или пароль' });
    }
  } catch (error) {
    console.error('Kinozal test error:', error);
    res.json({ success: false, msg: 'Ошибка подключения: ' + error.message });
  }
});

// Поиск торрентов
router.get('/search', async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    
    if (!query) {
      return res.json({ success: false, msg: 'Необходимо указать поисковый запрос' });
    }

    // Получаем настройки авторизации
    const config = settingsModel.readConfig();
    if (!config.kinozalLogin || !config.kinozalPassword) {
      return res.json({ success: false, msg: 'Не настроена авторизация Kinozal.tv' });
    }

    // Выполняем авторизацию
    const loginSuccess = await kinozalController.login(config.kinozalLogin, config.kinozalPassword);
    if (!loginSuccess) {
      return res.json({ success: false, msg: 'Ошибка авторизации на Kinozal.tv' });
    }

    // Выполняем поиск
    const torrents = await kinozalController.searchTorrents(query, parseInt(page));
    
    res.json({ success: true, torrents });
  } catch (error) {
    console.error('Kinozal search error:', error);
    res.json({ success: false, msg: 'Ошибка поиска: ' + error.message });
  }
});

// Получение списка файлов торрента
router.get('/files/:torrentId', async (req, res) => {
  try {
    const { torrentId } = req.params;
    
    if (!torrentId) {
      return res.json({ success: false, msg: 'Необходимо указать ID торрента' });
    }

    // Получаем настройки авторизации
    const config = settingsModel.readConfig();
    if (!config.kinozalLogin || !config.kinozalPassword) {
      return res.json({ success: false, msg: 'Не настроена авторизация Kinozal.tv' });
    }

    // Выполняем авторизацию
    const loginSuccess = await kinozalController.login(config.kinozalLogin, config.kinozalPassword);
    if (!loginSuccess) {
      return res.json({ success: false, msg: 'Ошибка авторизации на Kinozal.tv' });
    }

    // Получаем список файлов
    const files = await kinozalController.getTorrentFiles(torrentId);
    
    res.json({ success: true, files });
  } catch (error) {
    console.error('Kinozal get files error:', error);
    res.json({ success: false, msg: 'Ошибка получения файлов: ' + error.message });
  }
});

// Получение magnet-ссылки
router.get('/magnet/:torrentId', async (req, res) => {
  try {
    const { torrentId } = req.params;
    
    if (!torrentId) {
      return res.json({ success: false, msg: 'Необходимо указать ID торрента' });
    }

    // Получаем настройки авторизации
    const config = settingsModel.readConfig();
    if (!config.kinozalLogin || !config.kinozalPassword) {
      return res.json({ success: false, msg: 'Не настроена авторизация Kinozal.tv' });
    }

    // Выполняем авторизацию
    const loginSuccess = await kinozalController.login(config.kinozalLogin, config.kinozalPassword);
    if (!loginSuccess) {
      return res.json({ success: false, msg: 'Ошибка авторизации на Kinozal.tv' });
    }

    // Получаем magnet-ссылку
    const magnetLink = await kinozalController.getMagnetLink(torrentId);
    
    res.json({ success: true, magnetLink });
  } catch (error) {
    console.error('Kinozal get magnet error:', error);
    res.json({ success: false, msg: 'Ошибка получения magnet-ссылки: ' + error.message });
  }
});

module.exports = router;