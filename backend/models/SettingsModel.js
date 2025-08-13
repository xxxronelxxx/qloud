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
      useAppPath: true, // использовать путь приложения по умолчанию
      tmdbApiKey: process.env.TMDB_API_KEY || '' // API ключ для TMDB
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
      const oldPath = this.projectPath;
      
      if (current.useAppPath) {
        this.projectPath = this.appProjectPath;
        current.customPath = null;
      } else if (current.customPath) {
        this.projectPath = current.customPath;
      } else {
        this.projectPath = this.defaultProjectPath;
      }
      
      const newPath = this.projectPath;
      this.configPath = path.join(this.projectPath, 'config.json');
      
      // Если путь действительно изменился, выполняем миграцию
      if (oldPath !== newPath) {
        this.migrateData(oldPath, newPath);
      }
    }
    
    this.ensureDir();
    fs.writeFileSync(this.configPath, JSON.stringify(current, null, 2));
    this._cache = current;
    return current;
  }

  // Функция миграции данных
  migrateData(oldPath, newPath) {
    if (!fs.existsSync(oldPath)) {
      // Старая папка не существует, просто создаем новую
      fs.mkdirSync(newPath, { recursive: true });
      return;
    }

    if (fs.existsSync(newPath)) {
      // Новая папка уже существует, проверяем конфликты
      const oldFiles = this.getAllFiles(oldPath);
      const newFiles = this.getAllFiles(newPath);
      
      // Проверяем, есть ли конфликтующие файлы
      const conflicts = oldFiles.filter(file => newFiles.includes(file));
      if (conflicts.length > 0) {
        throw new Error(`В новой папке уже существуют файлы: ${conflicts.join(', ')}`);
      }
    }

    // Создаем новую папку
    fs.mkdirSync(newPath, { recursive: true });

    // Копируем все файлы и папки
    this.copyRecursive(oldPath, newPath);
    
    console.log(`Данные успешно мигрированы из ${oldPath} в ${newPath}`);
    
    // Опционально: удаляем старые файлы после успешной миграции
    // Это можно включить, если нужно полностью перенести данные
    // this.removeRecursive(oldPath);
  }

  // Получить список всех файлов в папке
  getAllFiles(dirPath, arrayOfFiles = []) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(path.relative(dirPath, fullPath));
      }
    });

    return arrayOfFiles;
  }

  // Рекурсивное копирование папок и файлов
  copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    
    if (stats.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      const files = fs.readdirSync(src);
      files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        this.copyRecursive(srcPath, destPath);
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  // Рекурсивное удаление папок и файлов
  removeRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        this.removeRecursive(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    });
    
    fs.rmdirSync(dirPath);
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

