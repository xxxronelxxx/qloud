const { Router } = require('express');
const router = Router();
const path = require('path');

// MIddleWares
const authVerify = require("../middleware/authVerify");
const authSuccess = require("../middleware/authSuccess"); 

// Controllers
const AuthController = require("../controllers/AuthController");
const auth = new AuthController();

const FileSystemController = require("../controllers/FileSystemController");
const fs = new FileSystemController();
const adminOnly = require('../middleware/adminOnly');

router.get('/',authVerify, fs.currentPath);
router.get("/fs-search", fs.searchPath);

router.get('/auth', authSuccess, auth.verify);

// Settings page
router.get('/settings', authVerify, (req, res) => {
    res.render('settings', { title: 'Настройки', cookies: req.cookies || {} });
});

router.get('/smart-files', authVerify, adminOnly, (req, res) => {
    res.render('smart-files', { title: 'Умная обработка файлов', cookies: req.cookies || {} });
});

router.get('/test-api', (req, res) => {
    res.sendFile(path.join(__dirname, '../../test-api.html'));
});

router.get('/test-auth', (req, res) => {
    res.sendFile(path.join(__dirname, '../../test-auth.html'));
});

router.get('/chat', authVerify, (req, res) => {
    res.render('chat', { title: 'Чаты', cookies: req.cookies || {} });
});

module.exports = router;