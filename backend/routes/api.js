// routes.js (CommonJS)

const { Router } = require('express');
const axios = require('axios');
const https = require('https');

const multer = require('multer');
const storage = multer({ storage: multer.memoryStorage() });
const upload = storage;

const router = Router();

const FileSystemController = require("../controllers/FileSystemController");
const fs = new FileSystemController(); 

const SettingsController = require('../controllers/SettingsController');
const settings = new SettingsController();
const adminOnly = require('../middleware/adminOnly');

const TMDBService = require('../services/TMDBService');
const RussianMovieService = require('../services/RussianMovieService');
const KinopoiskService = require('../services/KinopoiskService');
const RussianMoviesParser = require('../services/RussianMoviesParser');


router.get("/get-host",fs.handleHostConnection);
router.get("/current-path",fs.currentPath);
router.post("/create-folder", adminOnly, fs.createFolder);
router.post('/upload-chunk', adminOnly, upload.single('chunk'), fs.handleUploadFile);
router.delete('/delete-fs', adminOnly, fs.handleDelete);
router.get("/get-sub-directory", fs.handleGetSubdirectory);
router.put("/move-fs", adminOnly, fs.handleMoveFile);
router.patch("/rename-fs", adminOnly, fs.handleRenameItem);

// Settings API
router.get('/settings', adminOnly, settings.get);
router.get('/settings/paths', adminOnly, settings.getPaths);
router.patch('/settings', adminOnly, settings.update);
router.post('/settings/cache/invalidate', adminOnly, settings.invalidateCache);
router.post('/settings/autorun/apply', adminOnly, settings.applyAutorun);
router.post('/settings/chat/clear', adminOnly, settings.clearChat);

// TMDB test
router.post('/tmdb/test', adminOnly, async (req, res) => {
  const keys = ['HTTP_PROXY','http_proxy','HTTPS_PROXY','https_proxy','NO_PROXY','no_proxy'];
  const saved = {};
  keys.forEach(k => { if (Object.prototype.hasOwnProperty.call(process.env, k)) saved[k] = process.env[k]; });
  try {
    const apiKey = (req.body && req.body.apiKey) || '';
    if (!apiKey) return res.json({ success: false, msg: 'Не указан apiKey' });

    // временно отключаем прокси из окружения
    keys.forEach(k => { delete process.env[k]; });

    const r = await axios.get('https://api.themoviedb.org/3/configuration', {
      params: { api_key: apiKey },
      timeout: 15000,
      validateStatus: () => true,
      proxy: false,
      httpsAgent: new https.Agent({ keepAlive: false })
    });
    if (r.status === 200) return res.json({ success: true });
    return res.json({ success: false, msg: `TMDB ответил статусом ${r.status}` });
  } catch (e) {
    return res.json({ success: false, msg: e.message || 'Ошибка сети' });
  } finally {
    // восстанавливаем окружение корректно
    keys.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(saved, k)) process.env[k] = saved[k];
      else delete process.env[k];
    });
  }
});

// TMDB локализация API
router.get('/tmdb/localization/stats', adminOnly, (req, res) => {
  try {
    const stats = TMDBService.getLocalizationStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.get('/tmdb/localization/translations', adminOnly, (req, res) => {
  try {
    const translations = TMDBService.getTranslations();
    res.json({ success: true, data: translations });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.post('/tmdb/localization/translations', adminOnly, (req, res) => {
  try {
    const { englishName, russianName } = req.body;
    
    if (!englishName || !russianName) {
      return res.json({ success: false, msg: 'Не указаны английское и русское имена' });
    }
    
    TMDBService.addTranslation(englishName, russianName);
    res.json({ success: true, msg: 'Перевод добавлен' });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.post('/tmdb/cache/clear', adminOnly, (req, res) => {
  try {
    TMDBService.clearCache();
    res.json({ success: true, msg: 'Кэш TMDB очищен' });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

// Russian Movie API
router.post('/russian-movies/search', adminOnly, async (req, res) => {
  try {
    const { query, year } = req.body;
    
    if (!query) {
      return res.json({ success: false, msg: 'Не указан поисковый запрос' });
    }
    
    const result = await RussianMovieService.searchRussianMovies(query, year);
    
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.json({ success: false, msg: 'Русский фильм не найден' });
    }
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.get('/russian-movies/stats', adminOnly, (req, res) => {
  try {
    const stats = RussianMovieService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.post('/russian-movies/cache/clear', adminOnly, (req, res) => {
  try {
    RussianMovieService.clearCache();
    res.json({ success: true, msg: 'Кэш русских фильмов очищен' });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

// Локальная база русских фильмов API
router.get('/russian-movies/local/all', adminOnly, (req, res) => {
  try {
    const movies = RussianMovieService.getAllLocalMovies();
    const series = RussianMovieService.getAllLocalSeries();
    res.json({ 
      success: true, 
      data: { movies, series } 
    });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.get('/russian-movies/local/movies', adminOnly, (req, res) => {
  try {
    const movies = RussianMovieService.getAllLocalMovies();
    res.json({ success: true, data: movies });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.get('/russian-movies/local/series', adminOnly, (req, res) => {
  try {
    const series = RussianMovieService.getAllLocalSeries();
    res.json({ success: true, data: series });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.post('/russian-movies/local/add', adminOnly, (req, res) => {
  try {
    const item = req.body;
    
    if (!item.title || !item.type) {
      return res.json({ success: false, msg: 'Не указаны обязательные поля: title, type' });
    }
    
    RussianMovieService.addCustomItem(item);
    res.json({ success: true, msg: 'Фильм/сериал добавлен в локальную базу' });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

// Kinopoisk API
router.post('/kinopoisk/search', adminOnly, async (req, res) => {
  try {
    const { query, year } = req.body;
    
    if (!query) {
      return res.json({ success: false, msg: 'Не указан поисковый запрос' });
    }
    
    const result = await KinopoiskService.searchMovies(query, year);
    
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.json({ success: false, msg: 'Фильм не найден в Kinopoisk' });
    }
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.get('/kinopoisk/stats', adminOnly, (req, res) => {
  try {
    const stats = KinopoiskService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

// Парсинг API
router.post('/parser/search', adminOnly, async (req, res) => {
  try {
    const { query, year } = req.body;
    
    if (!query) {
      return res.json({ success: false, msg: 'Не указан поисковый запрос' });
    }
    
    const result = await RussianMoviesParser.searchMultiSource(query, year);
    
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.json({ success: false, msg: 'Фильм не найден через парсинг' });
    }
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

router.get('/parser/stats', adminOnly, (req, res) => {
  try {
    const stats = RussianMoviesParser.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.json({ success: false, msg: error.message });
  }
});

// Тестовая страница поиска
router.get('/test-search', (req, res) => {
  res.sendFile('test-interface.html', { root: './' });
});

module.exports = router;
