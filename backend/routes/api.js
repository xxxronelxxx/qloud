// routes.js (CommonJS)

const { Router } = require('express');

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
  try {
    const apiKey = (req.body && req.body.apiKey) || '';
    if (!apiKey) return res.json({ success: false, msg: 'Не указан apiKey' });
    const r = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`);
    if (r.ok) return res.json({ success: true });
    return res.json({ success: false, msg: 'Ключ недействителен' });
  } catch (e) {
    return res.json({ success: false, msg: e.message });
  }
});

module.exports = router;
