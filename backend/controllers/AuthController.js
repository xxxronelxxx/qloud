const PasswordModels = require("../models/passwordModels");

class AuthController extends PasswordModels {

    login = async(req, res) => {
        try {
            const password = (req.body.password || '').trim();

            if (!password) return res.json({ success: false, msg: "Пароль не может быть пустым" });
            if (!this.isValid(password)) return res.json({ success: false, msg: "Разрешены только латинские буквы, цифры и спецсимволы без пробелов" })
            
            const verify = await this.compareCryptedPassword(password);
            this.setCookie(res, 'admin');
            
            res.json({ success: verify });
        } catch (error) {
            console.log(error);
            res.json({ status: false, msg: error.message });
        }
    }
    
    guest = (req, res) => {
        try {
            this.setCookie(res, 'guest');
            return res.redirect('/');
        } catch (error) {
            console.log(error);
            return res.redirect('/auth');
        }
    }

    register = async(req,res) => {
        try {
            const password = (req.body.password || '').trim();

            if (!password) return res.json({ success: false, msg: "Пароль не может быть пустым" });
            if (!this.isValid(password)) return res.json({ success: false, msg: "Разрешены только латинские буквы, цифры и спецсимволы без пробелов" })

            const status = await this.savePassword(password);
            this.setCookie(res, 'admin');
            return res.json({ success: status });
        } catch (error) {
            console.log(error);
            return res.json({ success: false, msg: error.message });
        }
    }

    changePassword = async(req, res) => {
        try {
            const newPassword = (req.body.newPassword || '').trim();
            if (!newPassword) return res.json({ success: false, msg: 'Пароль не может быть пустым' });
            if (!this.isValid(newPassword)) return res.json({ success: false, msg: 'Разрешены только латинские буквы, цифры и спецсимволы без пробелов' });

            await this.updatePassword(newPassword);
            this.setCookie(res);
            return res.json({ success: true });
        } catch (error) {
            console.log(error);
            return res.json({ success: false, msg: error.message });
        }
    }

    resetPassword = async(req, res) => {
        try {
            const removed = this.deletePassword();
            res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: false });
            return res.json({ success: true, removed });
        } catch (error) {
            console.log(error);
            return res.json({ success: false, msg: error.message });
        }
    }

    verify = async(req,res) => {
        try {
            const resultAuth = this.authVerification();
            return res.render('auth', { title: 'Qloud',authMode:resultAuth });
        } catch(error) {
            console.log(error);
            return res.json({success:false, msg: error.message});
        }
    }

    logout = (req,res) => {
        res.clearCookie('token', {
            httpOnly: true,
            sameSite: 'lax',
            secure: false
        });

        res.redirect("/auth");
    }
}

module.exports = AuthController;