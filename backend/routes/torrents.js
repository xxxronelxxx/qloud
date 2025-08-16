const { Router } = require('express');
const router = Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const adminOnly = require('../middleware/adminOnly');
const authVerify = require('../middleware/authVerify');
const Torrent = require('../controllers/TorrentController');

// UI page
router.get('/', authVerify, (req, res) => {
  res.render('torrents', { title: 'Торренты', cookies: req.cookies || {} });
});

// API endpoints (admin only)
router.get('/api/list', adminOnly, Torrent.list);
router.post('/api/add-magnet', adminOnly, Torrent.addMagnet);
router.post('/api/add-file', adminOnly, upload.single('torrent'), Torrent.addFile);
router.delete('/api/:infoHash', adminOnly, Torrent.remove);
router.post('/api/:infoHash/pause', adminOnly, Torrent.pause);
router.post('/api/:infoHash/resume', adminOnly, Torrent.resume);
router.post('/api/:infoHash/force-start', adminOnly, Torrent.forceStart);
router.post('/api/:infoHash/force-connect', adminOnly, Torrent.forceConnect);
router.post('/api/:infoHash/force-metadata', adminOnly, Torrent.forceMetadata);
router.post('/api/:infoHash/update-trackers', adminOnly, Torrent.updateTrackers);
router.get('/api/:infoHash/diagnose', adminOnly, Torrent.diagnose);
router.get('/stream/:infoHash/:fileIndex', authVerify, Torrent.stream);

module.exports = router;

