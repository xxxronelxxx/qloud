const Settings = require('../models/SettingsModel');
const os = require('os');
const { exec } = require('child_process');
const path = require('path');

class SettingsController {
  get = (req, res) => {
    const cfg = Settings.readConfig();
    res.json({ 
      success: true, 
      config: cfg,
      currentPath: Settings.projectPath,
      uploadsPath: Settings.getUploadsPath(),
      torrentsPath: Settings.getTorrentsPath()
    });
  }

  update = async (req, res) => {
    console.log('Settings update request:', req.body);
    const { cacheEnabled, theme, autorun, chatHistoryLimit, customPath, useAppPath, tmdbApiKey, kinozalLogin, kinozalPassword, kinozalCookies, kinozalProxy } = req.body || {};
    const patch = {};
    if (typeof cacheEnabled === 'boolean') patch.cacheEnabled = cacheEnabled;
    if (['light', 'dark'].includes(theme)) patch.theme = theme;
    if (typeof autorun === 'boolean') patch.autorun = autorun;
    if (Number.isInteger(chatHistoryLimit) && chatHistoryLimit > 0 && chatHistoryLimit <= 10000) patch.chatHistoryLimit = chatHistoryLimit;
    if (typeof useAppPath === 'boolean') patch.useAppPath = useAppPath;
    if (typeof customPath === 'string' && customPath.trim()) patch.customPath = customPath.trim();
    if (typeof tmdbApiKey === 'string') patch.tmdbApiKey = tmdbApiKey.trim();
    if (typeof kinozalLogin === 'string') patch.kinozalLogin = kinozalLogin.trim();
    if (typeof kinozalPassword === 'string') patch.kinozalPassword = kinozalPassword.trim();
    if (typeof kinozalCookies === 'string') patch.kinozalCookies = kinozalCookies.trim();
    if (typeof kinozalProxy === 'string') patch.kinozalProxy = kinozalProxy.trim();
    
    console.log('Settings patch:', patch);
    
    try {
      const cfg = Settings.saveConfig(patch);
      console.log('Settings saved successfully:', cfg);
      res.json({ 
        success: true, 
        config: cfg,
        currentPath: Settings.projectPath,
        uploadsPath: Settings.getUploadsPath(),
        torrentsPath: Settings.getTorrentsPath()
      });
    } catch (error) {
      console.error('Settings save error:', error);
      res.json({ 
        success: false, 
        msg: `Ошибка обновления настроек: ${error.message}` 
      });
    }
  }

  // API для получения информации о путях
  getPaths = (req, res) => {
    const cfg = Settings.readConfig();
    res.json({
      success: true,
      currentPath: Settings.projectPath,
      uploadsPath: Settings.getUploadsPath(),
      torrentsPath: Settings.getTorrentsPath(),
      chatPath: Settings.getChatPath(),
      useAppPath: cfg.useAppPath,
      customPath: cfg.customPath,
      appPath: process.cwd()
    });
  }

  invalidateCache = (req, res) => {
    const current = Settings.readConfig();
    const cfg = Settings.saveConfig({ cacheVersion: (current.cacheVersion || 1) + 1 });
    res.json({ success: true, config: cfg });
  }

  // Очистка истории чата
  clearChat = (req, res) => {
    try {
      const Chat = require('./ChatController');
      Chat.messages = [];
      Chat.saveHistory();
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, msg: 'Не удалось очистить историю' });
    }
  }

  applyAutorun = (req, res) => {
    const { autorun } = Settings.readConfig();
    // Windows автозапуск (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
    if (process.platform === 'win32') {
      const appName = 'Qloud';
      // запускаем через electron запускаемый скрипт start.js из установленной папки
      const exePath = process.execPath; // путь к Electron/упакованному exe
      try {
        if (autorun) {
          exec(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /t REG_SZ /d "\"${exePath}\"" /f`, (err) => {
            if (err) return res.json({ success: false, msg: 'Не удалось включить автозапуск' });
            return res.json({ success: true });
          });
        } else {
          exec(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /f`, (err) => {
            if (err) return res.json({ success: false, msg: 'Не удалось отключить автозапуск' });
            return res.json({ success: true });
          });
        }
      } catch (_) {
        return res.json({ success: false, msg: 'Ошибка применения автозапуска' });
      }
      return;
    }
    res.json({ success: false, msg: 'Поддерживается только Windows' });
  }
}

module.exports = SettingsController;

