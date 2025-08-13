const { Router } = require('express');
const router = Router();

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

router.get('/chat', authVerify, (req, res) => {
    res.render('chat', { title: 'Чаты', cookies: req.cookies || {} });
});

module.exports = router;