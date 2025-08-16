const path = require('path');
const mime = require('mime-types');
const Settings = require('../models/SettingsModel');

class TorrentController {
  constructor() {
    this.downloadDir = Settings.getTorrentsPath();
    this.client = null;
    this.io = null;

    // Храним данные для возобновления
    this.torrentSources = new Map(); // infoHash → { type: 'magnet' | 'buffer', data: string | Buffer }
    this.pausedTorrents = new Set();
  }

  async getClient() {
    if (this.client) return this.client;
    const mod = await import('webtorrent');
    const WebTorrent = mod.default || mod;
    this.client = new WebTorrent({ dht: true, tracker: true });
    return this.client;
  }

  initSocket(io) {
    this.io = io;
  }

  serializeTorrent(t) {
    const isPaused = this.pausedTorrents.has(t.infoHash);
    
    // Проверяем, загружены ли метаданные
    // Метаданные загружены, если есть файлы и имя торрента
    const hasMetadata = t.files && t.files.length > 0 && t.name && !t.name.includes('Загрузка метаданных');
    
    // Определяем отображаемое имя
    let displayName = 'Загрузка метаданных...';
    if (t.name && !t.name.includes('Загрузка метаданных')) {
      displayName = t.name;
    } else if (t.infoHash) {
      displayName = `Загрузка метаданных... (${t.infoHash.substring(0, 8)}...)`;
    }
    
    return {
      infoHash: t.infoHash,
      name: displayName,
      progress: Math.round((t.progress || 0) * 100),
      downloaded: t.downloaded || 0,
      length: t.length || 0,
      downloadSpeed: t.downloadSpeed || 0,
      uploadSpeed: t.uploadSpeed || 0,
      timeRemaining: t.timeRemaining || 0,
      numPeers: t.numPeers || 0,
      paused: isPaused,
      files: hasMetadata ? (t.files || []).map((f, idx) => ({
        index: idx,
        name: f.name,
        length: f.length,
        mime: mime.lookup(f.name) || 'application/octet-stream'
      })) : [],
      path: t.path,
      hasMetadata: hasMetadata
    };
  }

  wireTorrent(torrent) {
    const emitUpdate = () => {
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));
    };

    // Событие при добавлении торрента
    torrent.on('infoHash', () => {
      console.log(`[Добавлен] ${torrent.name || torrent.infoHash}`);
      this.io && this.io.emit('torrent:add', this.serializeTorrent(torrent));
    });

    // События прогресса
    torrent.on('download', emitUpdate);
    torrent.on('upload', emitUpdate);
    
    // Событие загрузки метаданных
    torrent.on('metadata', () => {
      console.log(`[Метаданные] ${torrent.name}`);
      // При загрузке метаданных отправляем обновление
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));
    });
    
    // Событие готовности торрента
    torrent.on('ready', () => {
      console.log(`[Готов] ${torrent.name}`);
      // При готовности торрента отправляем обновление
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));
    });
    
    // Событие завершения загрузки
    torrent.on('done', () => {
      console.log(`[Завершено] ${torrent.name}`);
      emitUpdate();
    });
    
    // Событие ошибки
    torrent.on('error', (err) => {
      console.error(`[Ошибка] ${torrent.name}:`, err.message);
      emitUpdate();
    });
    
    // Событие удаления
    torrent.on('close', () => {
      console.log(`[Закрыт] ${torrent.name}`);
    });
    
    // Событие подключения к пирам
    torrent.on('wire', (wire) => {
      console.log(`[Подключение] ${torrent.name} - peers: ${torrent.numPeers}`);
      emitUpdate();
    });
  }

  list = async (req, res) => {
    const client = await this.getClient();
    res.json({
      success: true,
      items: client.torrents.map(t => this.serializeTorrent(t))
    });
  }

  addMagnet = async (req, res) => {
    try {
      const { magnet } = req.body || {};
      if (!magnet) {
        return res.json({ success: false, msg: 'Magnet обязателен' });
      }

      const client = await this.getClient();
      
      // Добавляем торрент
      const torrent = client.add(magnet, { path: this.downloadDir }, (added) => {
        console.log(`[Добавлен торрент] ${added.name || added.infoHash}`);
        
        // Настраиваем обработчики событий
        this.wireTorrent(added);
        
        // Убираем из паузы если был там
        this.pausedTorrents.delete(added.infoHash);

        // Сохраняем источник для будущего возобновления
        this.torrentSources.set(added.infoHash, {
          type: 'magnet',
          data: magnet
        });

        // Отправляем событие добавления
        this.io && this.io.emit('torrent:add', this.serializeTorrent(added));
      });

      // Если торрент уже добавлен (например, если это повторное добавление)
      if (torrent.infoHash) {
        console.log(`[Торрент уже добавлен] ${torrent.name || torrent.infoHash}`);
        
        // Настраиваем обработчики событий
        this.wireTorrent(torrent);
        
        // Убираем из паузы если был там
        this.pausedTorrents.delete(torrent.infoHash);

        // Сохраняем источник для будущего возобновления
        this.torrentSources.set(torrent.infoHash, {
          type: 'magnet',
          data: magnet
        });

        // Отправляем событие добавления
        this.io && this.io.emit('torrent:add', this.serializeTorrent(torrent));
      }

      return res.json({ success: true, infoHash: torrent.infoHash });
    } catch (e) {
      console.error('Ошибка добавления magnet:', e);
      return res.json({ success: false, msg: e.message });
    }
  }

  addFile = async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.json({ success: false, msg: 'Нужен .torrent файл' });
      }

      const client = await this.getClient();
      
      // Добавляем торрент
      const torrent = client.add(file.buffer, { path: this.downloadDir }, (added) => {
        console.log(`[Добавлен торрент из файла] ${added.name || added.infoHash}`);
        
        // Настраиваем обработчики событий
        this.wireTorrent(added);
        
        // Убираем из паузы если был там
        this.pausedTorrents.delete(added.infoHash);

        // Сохраняем буфер .torrent файла
        this.torrentSources.set(added.infoHash, {
          type: 'buffer',
          data: file.buffer
        });

        // Отправляем событие добавления
        this.io && this.io.emit('torrent:add', this.serializeTorrent(added));
      });

      // Если торрент уже добавлен
      if (torrent.infoHash) {
        console.log(`[Торрент из файла уже добавлен] ${torrent.name || torrent.infoHash}`);
        
        // Настраиваем обработчики событий
        this.wireTorrent(torrent);
        
        // Убираем из паузы если был там
        this.pausedTorrents.delete(torrent.infoHash);

        // Сохраняем буфер .torrent файла
        this.torrentSources.set(torrent.infoHash, {
          type: 'buffer',
          data: file.buffer
        });

        // Отправляем событие добавления
        this.io && this.io.emit('torrent:add', this.serializeTorrent(torrent));
      }

      return res.json({ success: true, infoHash: torrent.infoHash });
    } catch (e) {
      console.error('Ошибка добавления файла:', e);
      return res.json({ success: false, msg: e.message });
    }
  }

  remove = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const { deleteFiles } = req.query || {};
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      client.remove(infoHash, { destroyStore: !!deleteFiles }, err => {
        if (err) return res.json({ success: false, msg: err.message });
        try { torrent.destroy?.(); } catch (_) {}
        this.pausedTorrents.delete(infoHash);
        this.torrentSources.delete(infoHash);
        this.io && this.io.emit('torrent:remove', { infoHash });
        res.json({ success: true });
      });
    } catch (e) {
      res.json({ success: false, msg: e.message });
    }
  }

  stream = async (req, res) => {
    try {
      const { infoHash, fileIndex } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);
      if (!torrent) return res.status(404).end();

      const file = torrent.files[parseInt(fileIndex)];
      if (!file) return res.status(404).end();

      const total = file.length;
      const range = req.headers.range;
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        const chunkSize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType
        });
        file.createReadStream({ start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': mimeType
        });
        file.createReadStream().pipe(res);
      }
    } catch (err) {
      console.error('Ошибка потоковой передачи:', err);
      res.status(500).end();
    }
  }

  pause = async (req, res) => {
    try {
      const client = await this.getClient();
      const infoHash = req.params.infoHash;
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      if (this.pausedTorrents.has(infoHash)) {
        return res.json({ success: true, msg: 'Уже на паузе' });
      }

      // === ОСТАНОВКА СКАЧИВАНИЯ ===
      // 1. Отменяем выбор файлов (если metadata уже загружена)
      if (torrent.files && torrent.files.length > 0) {
        try {
          torrent.files.forEach(f => f.deselect());
        } catch (err) {
          console.warn('Ошибка при deselect файлов:', err.message);
        }
      }

      if (torrent.pieces && torrent.pieces.length > 0) {
        try {
          torrent.deselect(0, torrent.pieces.length - 1, false);
        } catch (err) {
          console.warn('Ошибка при deselect кусочков:', err.message);
        }
      }

      // 2. Удаляем торрент с опцией paused: true
      client.remove(infoHash, { paused: true }, err => {
        if (err) {
          console.error('Ошибка удаления торрента (пауза):', err);
          return res.json({ success: false, msg: err.message });
        }

        // 3. Помечаем как на паузе
        this.pausedTorrents.add(infoHash);

        // 4. Обновляем UI
        const fakeUpdate = {
          infoHash,
          name: torrent.name,
          paused: true,
          progress: Math.round(torrent.progress * 100),
          downloaded: torrent.downloaded,
          length: torrent.length
        };
        this.io && this.io.emit('torrent:update', fakeUpdate);
        res.json({ success: true });
      });
    } catch (e) {
      console.error('Ошибка паузы:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  resume = async (req, res) => {
    try {
      const client = await this.getClient();
      const infoHash = req.params.infoHash;

      if (!this.pausedTorrents.has(infoHash)) {
        const torrent = client.get(infoHash);
        if (torrent) {
          return res.json({ success: true, msg: 'Уже запущен' });
        }
        return res.json({ success: false, msg: 'Торрент не найден в списке приостановленных' });
      }

      // Получаем сохранённый источник
      const source = this.torrentSources.get(infoHash);
      if (!source) {
        return res.json({ success: false, msg: 'Не найден источник для возобновления' });
      }

      // Убираем из паузы
      this.pausedTorrents.delete(infoHash);

      // Перезапускаем
      const opts = { path: this.downloadDir };

      const torrent = client.add(source.data, opts, added => {
        this.wireTorrent(added);
        this.io && this.io.emit('torrent:update', this.serializeTorrent(added));
        res.json({ success: true });
      });

    } catch (e) {
      console.error('Ошибка возобновления:', e);
      res.json({ success: false, msg: e.message });
    }
  }
}

module.exports = new TorrentController();