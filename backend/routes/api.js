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
  const saved = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    NO_PROXY: process.env.NO_PROXY,
    no_proxy: process.env.no_proxy,
  };
  try {
    const apiKey = (req.body && req.body.apiKey) || '';
    if (!apiKey) return res.json({ success: false, msg: 'Не указан apiKey' });

    // временно отключаем прокси из окружения
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;

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
    // восстанавливаем окружение
    Object.assign(process.env, saved);
  }
});

module.exports = router;
