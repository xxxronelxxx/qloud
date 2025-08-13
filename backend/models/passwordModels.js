const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
let electronApp;
try {
    const electron = require('electron');
    electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
    electronApp = null;
}

class PasswordModel {
    constructor() {
        const projectName = "Qloud";
        const documentPath = (() => {
            if (electronApp && typeof electronApp.getPath === 'function') {
                return electronApp.getPath('documents');
            }
            const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH || '';
            return path.join(home, 'Documents');
        })();
        const docPath = path.posix.normalize(documentPath.replace(/\\/g, '/'));
        this.projectPath = `${docPath}/${projectName}`;
        this.passwordPath = `${this.projectPath}/password.txt`;
    }

    // Проверка допустимых символов
    isValid(password) {
        const allowed = /^[\x21-\x7E]+$/; // Только английские символы, цифры и спецсимволы (без пробелов и кириллицы)
        return allowed.test(password);
    }

    initProject (hashedPassword) {
        if (!fs.existsSync(this.projectPath)) fs.mkdirSync(this.projectPath, { recursive: true });
        if (!fs.existsSync(this.passwordPath)) fs.writeFileSync(this.passwordPath, hashedPassword);
        return true;
    }

    // Сохраняет захешированный пароль
    async savePassword(password) {
        if (!this.isValid(password)) throw new Error('Недопустимый пароль');
        const hash = await bcrypt.hash(password, 10);
        const status = this.initProject(hash);
        return status;
    }

    // Обновляет существующий пароль (перезаписывает файл)
    async updatePassword(password) {
        if (!this.isValid(password)) throw new Error('Недопустимый пароль');
        if (!fs.existsSync(this.projectPath)) fs.mkdirSync(this.projectPath, { recursive: true });
        const hash = await bcrypt.hash(password, 10);
        fs.writeFileSync(this.passwordPath, hash);
        return true;
    }

    async compareCryptedPassword(password) {
        if(!this.isValid(password)) throw new Error("Недопустимый пароль");
        if(!fs.existsSync(this.passwordPath)) throw new Error("Пароля нету в базе данных");
        const content = fs.readFileSync(this.passwordPath,'utf8');
        const verify = await bcrypt.compare(password,content);
        if(!verify) throw new Error("Пароли не совпадают");
        return verify;
    }

    setCookie = (res, role = 'admin') => {
         const value = role === 'admin' ? 'qloud_admin' : 'qloud_guest';
         res.cookie('token', value, {
            httpOnly: true,     // защищает от доступа через JS
            secure: false,      // true — только по HTTPS
            maxAge: 86400000,   // время жизни куки (1 день)
            sameSite: 'strict'  // запрет межсайтовых запросов
        });
    }

    authVerification = () => {
        const verify = fs.existsSync(this.passwordPath) ? "auth" : "register";
        return verify;
    };

    getCookie = (req) => {
        const token = req.cookies.token;
        return token;
    }

    // Проверка наличия файла пароля
    isRegistered() {
        return fs.existsSync(this.passwordPath);
    }

    // Удаляет файл пароля (сброс регистрации)
    deletePassword() {
        if (fs.existsSync(this.passwordPath)) {
            fs.unlinkSync(this.passwordPath);
            return true;
        }
        return false;
    }
}

module.exports = PasswordModel;
