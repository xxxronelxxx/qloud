const fs = require('fs');
const path = require('path');

let electronApp;
try {
  const electron = require('electron');
  electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
  electronApp = null;
}

class SettingsModel {
  constructor() {
    const projectName = 'Qloud';
    
    // Путь по умолчанию - папка приложения
    const appPath = process.cwd();
    
    const documentsPath = (() => {
      if (electronApp && typeof electronApp.getPath === 'function') {
        return electronApp.getPath('documents');
      }
      const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH || '';
      return path.join(home, 'Documents');
    })();

    const docPath = path.posix.normalize(documentsPath.replace(/\\/g, '/'));
    this.defaultProjectPath = path.join(docPath, projectName);
    this.appProjectPath = path.join(appPath, projectName);
    
    // Сначала пытаемся найти конфиг в старом месте (Documents)
    this.configPath = path.join(this.defaultProjectPath, 'config.json');
    let config = this.readConfigInternal();
    
    // Если конфиг не найден или не содержит новых полей, используем путь приложения по умолчанию
    if (!config || config.useAppPath === undefined) {
      config = { ...this.defaultConfig, useAppPath: true };
      this.projectPath = this.appProjectPath;
      this.configPath = path.join(this.projectPath, 'config.json');
    } else if (config.useAppPath) {
      this.projectPath = this.appProjectPath;
      this.configPath = path.join(this.projectPath, 'config.json');
    } else if (config.customPath) {
      this.projectPath = config.customPath;
      this.configPath = path.join(this.projectPath, 'config.json');
    } else {
      this.projectPath = this.defaultProjectPath;
      this.configPath = path.join(this.projectPath, 'config.json');
    }

    this.defaultConfig = {
      cacheEnabled: true,
      cacheVersion: 1,
      theme: 'light', // 'light' | 'dark'
      autorun: false,
      chatHistoryLimit: 100,
      customPath: null, // кастомный путь для сохранения файлов
      useAppPath: true // использовать путь приложения по умолчанию
    };

    this._cache = null;
  }

  readConfigInternal() {
    try {
      if (!fs.existsSync(this.configPath)) return null;
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const data = JSON.parse(raw);
      return { ...this.defaultConfig, ...data };
    } catch (_) {
      return null;
    }
  }

  ensureDir() {
    if (!fs.existsSync(this.projectPath)) fs.mkdirSync(this.projectPath, { recursive: true });
  }

  readConfig() {
    try {
      if (this._cache) return this._cache;
      const config = this.readConfigInternal();
      if (!config) {
        // Если конфиг не найден, создаем новый с настройками по умолчанию
        this._cache = { ...this.defaultConfig };
        this.ensureDir();
        fs.writeFileSync(this.configPath, JSON.stringify(this._cache, null, 2));
        return this._cache;
      }
      this._cache = config;
      return config;
    } catch (_) {
      return { ...this.defaultConfig };
    }
  }

  saveConfig(patch) {
    const current = { ...this.readConfig(), ...patch };
    
    // Если изменился путь, нужно обновить projectPath и configPath
    if (patch.customPath !== undefined || patch.useAppPath !== undefined) {
      if (current.useAppPath) {
        this.projectPath = this.appProjectPath;
        current.customPath = null;
      } else if (current.customPath) {
        this.projectPath = current.customPath;
      } else {
        this.projectPath = this.defaultProjectPath;
      }
      this.configPath = path.join(this.projectPath, 'config.json');
    }
    
    this.ensureDir();
    fs.writeFileSync(this.configPath, JSON.stringify(current, null, 2));
    this._cache = current;
    return current;
  }

  // Получить текущий путь для загрузок
  getUploadsPath() {
    return path.join(this.projectPath, 'uploads');
  }

  // Получить текущий путь для торрентов
  getTorrentsPath() {
    return path.join(this.projectPath, 'torrents');
  }

  // Получить текущий путь для чата
  getChatPath() {
    return path.join(this.projectPath, 'chat.json');
  }
}

module.exports = new SettingsModel();

