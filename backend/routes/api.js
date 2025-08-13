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

const SmartFileController = require('../controllers/SmartFileController');
const smartFile = new SmartFileController();


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

// Smart File Processing API
router.post('/smart/process-file', adminOnly, smartFile.processFile);
router.post('/smart/process-directory', adminOnly, smartFile.processDirectory);
router.get('/smart/status', adminOnly, smartFile.getProcessingStatus);
router.post('/smart/analyze-file', adminOnly, smartFile.analyzeFile);
router.post('/smart/search-movie', adminOnly, smartFile.searchMovie);
router.get('/smart/stats', adminOnly, smartFile.getStats);
router.post('/smart/clear-caches', adminOnly, smartFile.clearCaches);
router.get('/smart/check-mediainfo', adminOnly, smartFile.checkMediaInfo);
router.get('/smart/check-tmdb', adminOnly, smartFile.checkTMDB);

module.exports = router;
