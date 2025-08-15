const { Router } = require('express');
const router = Router();
const YtsController = require('../controllers/YtsController');

const yts = new YtsController();

// Поиск
router.get('/search', async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    if (!query) return res.json({ success: false, msg: 'Укажите запрос' });
    const items = await yts.search(query, Number(page));
    res.json({ success: true, items });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// Файлы по ссылке .torrent
router.get('/files', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.json({ success: false, msg: 'Нет url' });
    const data = await yts.getFilesByTorrentUrl(url);
    res.json({ success: true, ...data });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// Магнит по хешу
router.get('/magnet/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    if (!hash) return res.json({ success: false, msg: 'Нет hash' });
    const magnet = yts.buildMagnet(hash);
    res.json({ success: true, magnet });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// Детали фильма
router.get('/details/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    if (!movieId) return res.json({ success: false, msg: 'Нет movieId' });
    const info = await yts.details(movieId);
    if (!info) return res.json({ success: false, msg: 'Нет данных' });
    res.json({ success: true, info });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

module.exports = router;