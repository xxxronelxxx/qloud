const { Router } = require('express');
const router = Router();

const AuthController = require("../controllers/AuthController");
const auth = new AuthController();

router.post('/login', auth.login);
router.post('/register', auth.register);
router.get('/guest', auth.guest);
router.get("/logout",auth.logout);

// Protected auth settings
const authVerify = require('../middleware/authVerify');
router.post('/change-password', authVerify, auth.changePassword);
router.post('/reset-password', authVerify, auth.resetPassword);

module.exports = router;