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

module.exports = router;
