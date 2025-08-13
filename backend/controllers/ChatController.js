const cookie = require('cookie');
const fs = require('fs');
const path = require('path');
const Settings = require('../models/SettingsModel');

class ChatController {
  constructor() {
    this.messages = [];
    this.maxMessages = Settings.readConfig().chatHistoryLimit || 100;
    this.filePath = Settings.getChatPath();
    this.loadHistory();
  }

  loadHistory() {
    try {
      Settings.ensureDir();
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.messages = arr.slice(-this.maxMessages);
        }
      }
    } catch (_) {
      this.messages = [];
    }
  }

  saveHistory() {
    try {
      Settings.ensureDir();
      const data = JSON.stringify(this.messages.slice(-this.maxMessages), null, 2);
      fs.writeFileSync(this.filePath, data);
    } catch (_) {
      // ignore write errors
    }
  }

  // Позволяет динамически менять лимит из настроек
  applyLimitFromSettings() {
    const cfg = Settings.readConfig();
    const newLimit = cfg.chatHistoryLimit || 100;
    if (newLimit !== this.maxMessages) {
      this.maxMessages = newLimit;
      this.messages = this.messages.slice(-this.maxMessages);
      this.saveHistory();
    }
  }

  initSocket(io) {
    io.on('connection', (socket) => {
      const rawCookie = socket.handshake.headers.cookie || '';
      const parsed = cookie.parse(rawCookie);
      const token = parsed.token || '';
      const name = token === 'qloud_admin' ? 'админ' : 'гость';

      // отправляем историю
      socket.emit('chat:history', this.messages);

      socket.on('chat:message', (text) => {
        if (typeof text !== 'string') return;
        const trimmed = text.trim();
        if (!trimmed) return;
        const msg = {
          id: Date.now() + ':' + Math.random().toString(36).slice(2),
          user: name,
          text: trimmed,
          ts: Date.now()
        };
        this.messages.push(msg);
        if (this.messages.length > this.maxMessages) {
          this.messages = this.messages.slice(-this.maxMessages);
        }
        this.saveHistory();
        io.emit('chat:new', msg);
      });

      socket.on('chat:applyLimit', () => {
        this.applyLimitFromSettings();
        socket.emit('chat:history', this.messages);
      });
    });
  }
}

module.exports = new ChatController();

