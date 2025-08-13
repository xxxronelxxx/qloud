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
    const documentsPath = (() => {
      if (electronApp && typeof electronApp.getPath === 'function') {
        return electronApp.getPath('documents');
      }
      const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH || '';
      return path.join(home, 'Documents');
    })();

    const docPath = path.posix.normalize(documentsPath.replace(/\\/g, '/'));
    this.projectPath = path.join(docPath, projectName);
    this.configPath = path.join(this.projectPath, 'config.json');

    this.defaultConfig = {
      cacheEnabled: true,
      cacheVersion: 1,
      theme: 'light', // 'light' | 'dark'
      autorun: false,
      chatHistoryLimit: 100
    };

    this._cache = null;
  }

  ensureDir() {
    if (!fs.existsSync(this.projectPath)) fs.mkdirSync(this.projectPath, { recursive: true });
  }

  readConfig() {
    try {
      if (this._cache) return this._cache;
      if (!fs.existsSync(this.configPath)) return { ...this.defaultConfig };
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const data = JSON.parse(raw);
      this._cache = { ...this.defaultConfig, ...data };
      return this._cache;
    } catch (_) {
      return { ...this.defaultConfig };
    }
  }

  saveConfig(patch) {
    const current = { ...this.readConfig(), ...patch };
    this.ensureDir();
    fs.writeFileSync(this.configPath, JSON.stringify(current, null, 2));
    this._cache = current;
    return current;
  }
}

module.exports = new SettingsModel();

