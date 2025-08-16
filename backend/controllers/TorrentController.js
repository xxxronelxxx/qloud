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
    
    try {
      const mod = await import('webtorrent');
      const WebTorrent = mod.default || mod;
      
      // Создаем клиент с минимальными настройками для лучшего подключения к пирам
      this.client = new WebTorrent({ 
        dht: true,           // Включаем DHT
        tracker: true,       // Включаем трекеры
        lpd: true,           // Включаем локальное peer discovery
        utp: true,           // Включаем uTP
        maxConns: 100,       // Увеличиваем максимальное количество соединений
        nodeId: undefined,   // Автоматически генерируем node ID
        peerId: undefined,   // Автоматически генерируем peer ID
        announce: [],        // Пустой список трекеров по умолчанию
        getAnnounceOpts: () => ({}), // Опции для анонса
        rtcConfig: {},       // WebRTC конфигурация
        userAgent: 'WebTorrent/2.0.0' // User agent
      });
      
      // Добавляем обработчики событий для клиента
      this.client.on('error', (err) => {
        console.error('[WebTorrent Client Error]:', err.message);
      });
      
      this.client.on('warning', (warning) => {
        console.warn('[WebTorrent Client Warning]:', warning.message);
      });
      
      // Добавляем обработчик для подключения к пирам
      this.client.on('wire', (wire, addr) => {
        console.log(`[WebTorrent Client] Подключение к пиру: ${addr}`);
      });
      
      console.log('[WebTorrent Client] Инициализирован с минимальными настройками для пиров');
      
      return this.client;
    } catch (error) {
      console.error('[WebTorrent Client] Ошибка инициализации:', error);
      throw error;
    }
  }

  initSocket(io) {
    this.io = io;
  }

  serializeTorrent(t) {
    if (!t || !t.infoHash) {
      console.error('[Ошибка] serializeTorrent: торрент или infoHash не определены');
      return null;
    }

    // Проверяем наличие метаданных
    const hasMetadata = t.files && t.files.length > 0;
    
    // Безопасно получаем количество пиров
    let numPeers = 0;
    let numSeeds = 0;
    let numLeeches = 0;
    
    try {
      if (t.wires && Array.isArray(t.wires)) {
        numPeers = t.wires.length;
        numSeeds = t.wires.filter(wire => wire.uploaded > 0).length;
        numLeeches = numPeers - numSeeds;
      } else if (t.numPeers !== undefined) {
        numPeers = t.numPeers;
        numSeeds = t.numSeeds || 0;
        numLeeches = t.numLeeches || 0;
      }
    } catch (e) {
      console.log(`[Ошибка подсчета пиров] ${t.name || t.infoHash}:`, e.message);
    }

    // Безопасно сериализуем файлы
    let serializedFiles = [];
    if (hasMetadata && t.files && t.files.length > 0) {
      try {
        serializedFiles = t.files.map((file, index) => ({
          index: index,
          name: file.name || 'Неизвестный файл',
          length: file.length || 0,
          path: file.path || '',
          selected: file.selected || false,
          mime: this.getMimeType(file.name) || 'application/octet-stream'
        }));
      } catch (e) {
        console.log(`[Ошибка сериализации файлов] ${t.name || t.infoHash}:`, e.message);
      }
    }

    // Безопасно получаем имя торрента
    const torrentName = t.name || t.infoHash || 'Неизвестный торрент';
    const shortHash = t.infoHash ? t.infoHash.substring(0, 8) : '????';

    return {
      infoHash: t.infoHash,
      name: hasMetadata ? torrentName : `Загрузка метаданных... (${shortHash})`,
      displayName: hasMetadata ? torrentName : `Загрузка метаданных... (${shortHash})`,
      progress: Math.round((t.progress || 0) * 100),
      downloaded: t.downloaded || 0,
      length: t.length || 0,
      downloadSpeed: t.downloadSpeed || 0,
      uploadSpeed: t.uploadSpeed || 0,
      timeRemaining: t.timeRemaining || 0,
      numPeers: numPeers,
      numSeeds: numSeeds,
      numLeeches: numLeeches,
      paused: t.paused || false,
      files: serializedFiles,
      hasMetadata: hasMetadata
    };
  }
  
  // Вспомогательный метод для определения MIME типа
  getMimeType(filename) {
    if (!filename) return 'application/octet-stream';
    
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      // Видео
      'mp4': 'video/mp4',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'mov': 'video/quicktime',
      'wmv': 'video/x-ms-wmv',
      'flv': 'video/x-flv',
      'webm': 'video/webm',
      'm4v': 'video/x-m4v',
      '3gp': 'video/3gpp',
      
      // Аудио
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'flac': 'audio/flac',
      'aac': 'audio/aac',
      'ogg': 'audio/ogg',
      'wma': 'audio/x-ms-wma',
      'm4a': 'audio/mp4',
      
      // Изображения
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      
      // Документы
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      
      // Архивы
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      'tar': 'application/x-tar',
      'gz': 'application/gzip'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  wireTorrent(torrent) {
    const emitUpdate = () => {
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }
    };

    // Событие при добавлении торрента
    torrent.on('infoHash', () => {
      console.log(`[Добавлен] ${torrent.name || torrent.infoHash}`);
      
      // Принудительно запускаем торрент
      if (torrent.paused) {
        torrent.resume();
      }
      
      // Принудительно подключаемся к трекерам
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Трекеры] ${torrent.name}: ${torrent.announce.length} трекеров`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
      }
      
      // Принудительно подключаемся к DHT
      if (torrent.dht) {
        console.log(`[DHT] ${torrent.name}: Включен`);
      }
      
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:add', serialized);
      }
    });

    // События прогресса
    torrent.on('download', emitUpdate);
    torrent.on('upload', emitUpdate);
    
    // Событие загрузки метаданных
    torrent.on('metadata', () => {
      console.log(`[Метаданные] ${torrent.name} - ЗАГРУЖЕНЫ!`);
      
      // Принудительно запускаем торрент после загрузки метаданных
      if (torrent.paused) {
        torrent.resume();
      }
      
      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }
      
      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }
      
      // Принудительно отправляем событие обновления
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }
    });
    
    // Событие готовности торрента
    torrent.on('ready', () => {
      console.log(`[Готов] ${torrent.name}`);
      
      // Принудительно запускаем торрент
      if (torrent.paused) {
        torrent.resume();
      }
      
      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }
      
      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }
      
      // Принудительно отправляем событие обновления
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }
    });
    
    // Событие завершения загрузки
    torrent.on('done', () => {
      console.log(`[Завершено] ${torrent.name}`);
      emitUpdate();
    });
    
    // Событие ошибки
    torrent.on('error', (err) => {
      console.error(`[Ошибка] ${torrent.name}:`, err.message);
      
      // Пытаемся перезапустить торрент при ошибке
      setTimeout(() => {
        if (torrent.paused) {
          torrent.resume();
        }
      }, 5000);
      
      emitUpdate();
    });
    
    // Событие удаления
    torrent.on('close', () => {
      console.log(`[Закрыт] ${torrent.name}`);
    });
    
    // Событие подключения к пирам
    torrent.on('wire', (wire, addr) => {
      console.log(`[Подключение] ${torrent.name} - пир: ${addr}, общее количество: ${torrent.numPeers}`);
      
      // Принудительно запускаем торрент при подключении к пирам
      if (torrent.paused) {
        torrent.resume();
      }
      
      emitUpdate();
    });
    
    // Событие изменения статуса
    torrent.on('noPeers', () => {
      console.log(`[Нет пиров] ${torrent.name}`);
      emitUpdate();
    });
    
    // Событие подключения к трекеру
    torrent.on('trackerAnnounce', (eventType, data) => {
      console.log(`[Трекер] ${torrent.name} - ${eventType}:`, data);
    });
    
    // Событие получения списка пиров от трекера
    torrent.on('trackerPeer', (addr) => {
      console.log(`[Трекер пир] ${torrent.name} - ${addr}`);
    });
    
    // Событие изменения количества пиров
    torrent.on('peer', (addr) => {
      console.log(`[Новый пир] ${torrent.name} - ${addr}, всего: ${torrent.numPeers}`);
      emitUpdate();
    });
    
    // Событие отключения пира
    torrent.on('peerRemove', (addr) => {
      console.log(`[Пир отключился] ${torrent.name} - ${addr}, всего: ${torrent.numPeers}`);
      emitUpdate();
    });
    
    // Принудительно запускаем торрент после настройки всех обработчиков
    setTimeout(() => {
      if (torrent.paused) {
        torrent.resume();
      }
      
      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }
      
      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }
      
      // Принудительно подключаемся к трекерам
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Принудительное подключение к трекерам] ${torrent.name}`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
      }
      
      // Принудительно подключаемся к DHT
      if (torrent.dht) {
        console.log(`[Принудительное подключение к DHT] ${torrent.name}`);
      }
      
      // Принудительно подключаемся к локальному peer discovery
      if (torrent.lpd) {
        console.log(`[Принудительное подключение к LPD] ${torrent.name}`);
      }
    }, 1000);
    
    // Дополнительная проверка каждые 5 секунд для "зависших" торрентов
    const checkInterval = setInterval(() => {
      // Если торрент не имеет метаданных и не подключен к пирам
      if (!torrent.files || torrent.files.length === 0) {
        console.log(`[Проверка метаданных] ${torrent.name} - метаданные не загружены`);
        
        // Принудительно запускаем торрент
        if (torrent.paused) {
          torrent.resume();
        }
        
        // Принудительно подключаемся к трекерам
        if (torrent.announce && torrent.announce.length > 0) {
          console.log(`[Повторное подключение к трекерам] ${torrent.name}`);
        }
        
        // Принудительно подключаемся к DHT
        if (torrent.dht) {
          console.log(`[Повторное подключение к DHT] ${torrent.name}`);
        }
        
        // Принудительно обновляем трекер
        if (torrent.tracker) {
          try {
            torrent.tracker.announce();
            console.log(`[Принудительное обновление трекера] ${torrent.name}`);
          } catch (e) {
            console.log(`[Ошибка обновления трекера] ${torrent.name}:`, e.message);
          }
        }
      } else {
        // Метаданные загружены, останавливаем проверку
        console.log(`[Метаданные загружены] ${torrent.name}`);
        clearInterval(checkInterval);
      }
    }, 5000);
    
    // Очищаем интервал при закрытии торрента
    torrent.on('close', () => {
      clearInterval(checkInterval);
    });
  }

  list = async (req, res) => {
    try {
      const client = await this.getClient();
      
      // Принудительно запускаем все торренты, которые на паузе
      client.torrents.forEach(torrent => {
        if (torrent.paused) {
          console.log(`[Автозапуск] ${torrent.name || torrent.infoHash}`);
          torrent.resume();
          
          // Принудительно выбираем все файлы для загрузки
          if (torrent.files && torrent.files.length > 0) {
            torrent.files.forEach(file => {
              if (!file.selected) {
                file.select();
              }
            });
          }
          
          // Принудительно выбираем все кусочки для загрузки
          if (torrent.pieces && torrent.pieces.length > 0) {
            torrent.select(0, torrent.pieces.length - 1, false);
          }
        }
      });
      
      res.json({
        success: true,
        items: client.torrents.map(t => this.serializeTorrent(t)).filter(item => item !== null)
      });
    } catch (error) {
      console.error('[List Error]:', error);
      res.json({ success: false, msg: error.message });
    }
  }

  addMagnet = async (req, res) => {
    try {
      const { magnet } = req.body || {};
      if (!magnet) {
        return res.json({ success: false, msg: 'Magnet обязателен' });
      }

      const client = await this.getClient();
      
      // Проверяем, не добавлен ли уже этот торрент
      const existingTorrent = client.torrents.find(t => t.magnetURI === magnet);
      if (existingTorrent) {
        return res.json({ success: false, msg: 'Этот торрент уже добавлен' });
      }
      
      // Добавляем торрент с минимальными настройками для лучшего подключения
      const torrent = client.add(magnet, { 
        path: this.downloadDir
      }, (added) => {
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

        // Принудительно запускаем торрент
        if (added.paused) {
          added.resume();
        }

        // Отправляем событие добавления
        const serialized = this.serializeTorrent(added);
        if (serialized) {
          this.io && this.io.emit('torrent:add', serialized);
        }
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

        // Принудительно запускаем торрент
        if (torrent.paused) {
          torrent.resume();
        }

        // Отправляем событие добавления
        const serialized = this.serializeTorrent(torrent);
        if (serialized) {
          this.io && this.io.emit('torrent:add', serialized);
        }
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
      
      // Добавляем торрент с минимальными настройками для лучшего подключения
      const torrent = client.add(file.buffer, { 
        path: this.downloadDir
      }, (added) => {
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

        // Принудительно запускаем торрент
        if (added.paused) {
          added.resume();
        }

        // Отправляем событие добавления
        const serialized = this.serializeTorrent(added);
        if (serialized) {
          this.io && this.io.emit('torrent:add', serialized);
        }
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

        // Принудительно запускаем торрент
        if (torrent.paused) {
          torrent.resume();
        }

        // Отправляем событие добавления
        const serialized = this.serializeTorrent(torrent);
        if (serialized) {
          this.io && this.io.emit('torrent:add', serialized);
        }
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
      const { files } = req.query || {};
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Удаление торрента] ${torrent.name || torrent.infoHash}, удаление файлов: ${!!files}`);

      // Сначала останавливаем торрент
      if (!torrent.paused) {
        try {
          torrent.pause();
        } catch (e) {
          console.log(`[Предупреждение] Не удалось остановить торрент: ${e.message}`);
        }
      }

      // Удаляем торрент с правильными опциями
      const destroyStore = !!files; // Удаляем файлы только если запрошено
      
      try {
        // Удаляем торрент из клиента
        client.remove(infoHash, { destroyStore }, (err) => {
          if (err) {
            console.error(`[Ошибка удаления торрента] ${infoHash}:`, err.message);
            return res.json({ success: false, msg: `Ошибка удаления: ${err.message}` });
          }
          
          try {
            // Пытаемся уничтожить торрент
            if (torrent.destroy && typeof torrent.destroy === 'function') {
              torrent.destroy();
            }
          } catch (destroyErr) {
            console.log(`[Предупреждение] Не удалось уничтожить торрент: ${destroyErr.message}`);
          }
          
          // Очищаем внутренние ссылки
          this.pausedTorrents.delete(infoHash);
          this.torrentSources.delete(infoHash);
          
          // Отправляем событие удаления
          this.io && this.io.emit('torrent:remove', { infoHash });
          
          console.log(`[Торрент удален] ${infoHash}, файлы: ${destroyStore ? 'удалены' : 'сохранены'}`);
          res.json({ success: true, msg: 'Торрент удален' });
        });
      } catch (removeErr) {
        console.error(`[Критическая ошибка удаления] ${infoHash}:`, removeErr.message);
        
        // Пытаемся принудительно удалить торрент
        try {
          if (torrent.destroy && typeof torrent.destroy === 'function') {
            torrent.destroy();
          }
        } catch (destroyErr) {
          console.log(`[Предупреждение] Не удалось принудительно уничтожить торрент: ${destroyErr.message}`);
        }
        
        // Очищаем внутренние ссылки
        this.pausedTorrents.delete(infoHash);
        this.torrentSources.delete(infoHash);
        
        // Отправляем событие удаления
        this.io && this.io.emit('torrent:remove', { infoHash });
        
        res.json({ success: true, msg: 'Торрент принудительно удален' });
      }
    } catch (e) {
      console.error(`[Ошибка метода remove] ${req.params.infoHash}:`, e.message);
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

  // Метод для принудительного перезапуска торрента
  forceRestart = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Принудительный перезапуск] ${torrent.name || torrent.infoHash}`);

      // Останавливаем торрент
      if (!torrent.paused) {
        torrent.pause();
      }
      
      // Ждем немного
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Запускаем торрент заново
      torrent.resume();

      // Принудительно подключаемся к трекерам
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Принудительное подключение к трекерам] ${torrent.name}`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
        
        // Принудительно обновляем трекер
        if (torrent.tracker) {
          try {
            torrent.tracker.announce();
            console.log(`[Трекер обновлен] ${torrent.name}`);
          } catch (e) {
            console.log(`[Ошибка трекера] ${torrent.name}:`, e.message);
          }
        }
      }

      // Принудительно подключаемся к DHT
      if (torrent.dht) {
        console.log(`[Принудительное подключение к DHT] ${torrent.name}`);
      }

      // Принудительно подключаемся к локальному peer discovery
      if (torrent.lpd) {
        console.log(`[Принудительное подключение к LPD] ${torrent.name}`);
      }

      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }

      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Торрент перезапущен' });
    } catch (e) {
      console.error('Ошибка принудительного перезапуска:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для принудительного обновления статистики пиров
  forceUpdateStats = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Обновление статистики] ${torrent.name || torrent.infoHash}`);

      // Принудительно обновляем трекер
      if (torrent.tracker) {
        try {
          torrent.tracker.announce();
          console.log(`[Трекер обновлен] ${torrent.name}`);
        } catch (e) {
          console.log(`[Ошибка трекера] ${torrent.name}:`, e.message);
        }
      }

      // Принудительно обновляем статистику
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Обновление трекеров] ${torrent.name}: ${torrent.announce.length} трекеров`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
      }

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Статистика обновлена' });
    } catch (e) {
      console.error('Ошибка обновления статистики:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для принудительного переподключения
  forceReconnect = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Принудительное переподключение] ${torrent.name || torrent.infoHash}`);

      // Останавливаем торрент
      if (!torrent.paused) {
        torrent.pause();
      }
      
      // Ждем немного
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Запускаем торрент заново
      torrent.resume();

      // Принудительно подключаемся к трекерам
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Принудительное подключение к трекерам] ${torrent.name}`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
        
        // Принудительно обновляем трекер
        if (torrent.tracker) {
          try {
            torrent.tracker.announce();
            console.log(`[Трекер обновлен] ${torrent.name}`);
          } catch (e) {
            console.log(`[Ошибка трекера] ${torrent.name}:`, e.message);
          }
        }
      }

      // Принудительно подключаемся к DHT
      if (torrent.dht) {
        console.log(`[Принудительное подключение к DHT] ${torrent.name}`);
      }

      // Принудительно подключаемся к локальному peer discovery
      if (torrent.lpd) {
        console.log(`[Принудительное подключение к LPD] ${torrent.name}`);
      }

      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }

      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Принудительное переподключение выполнено' });
    } catch (e) {
      console.error('Ошибка принудительного переподключения:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для принудительного подключения
  forceConnect = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Принудительное подключение] ${torrent.name || torrent.infoHash}`);

      // Принудительно запускаем торрент
      if (torrent.paused) {
        torrent.resume();
      }

      // Принудительно подключаемся к трекерам
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Принудительное подключение к трекерам] ${torrent.name}`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
        
        // Принудительно обновляем трекер
        if (torrent.tracker) {
          try {
            torrent.tracker.announce();
            console.log(`[Трекер обновлен] ${torrent.name}`);
          } catch (e) {
            console.log(`[Ошибка трекера] ${torrent.name}:`, e.message);
          }
        }
      }

      // Принудительно подключаемся к DHT
      if (torrent.dht) {
        console.log(`[Принудительное подключение к DHT] ${torrent.name}`);
      }

      // Принудительно подключаемся к локальному peer discovery
      if (torrent.lpd) {
        console.log(`[Принудительное подключение к LPD] ${torrent.name}`);
      }

      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }

      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Принудительное подключение выполнено' });
    } catch (e) {
      console.error('Ошибка принудительного подключения:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для принудительной загрузки метаданных
  forceMetadata = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Принудительная загрузка метаданных] ${torrent.name || torrent.infoHash}`);

      // Проверяем, есть ли уже метаданные
      if (torrent.files && torrent.files.length > 0) {
        return res.json({ success: true, msg: 'Метаданные уже загружены' });
      }

      // Принудительно запускаем торрент
      if (torrent.paused) {
        torrent.resume();
      }

      // Принудительно подключаемся к трекерам
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Принудительное подключение к трекерам] ${torrent.name}`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
        
        // Принудительно обновляем трекер
        if (torrent.tracker) {
          try {
            torrent.tracker.announce();
            console.log(`[Трекер обновлен] ${torrent.name}`);
          } catch (e) {
            console.log(`[Ошибка трекера] ${torrent.name}:`, e.message);
          }
        }
      }

      // Принудительно подключаемся к DHT
      if (torrent.dht) {
        console.log(`[Принудительное подключение к DHT] ${torrent.name}`);
      }

      // Принудительно подключаемся к локальному peer discovery
      if (torrent.lpd) {
        console.log(`[Принудительное подключение к LPD] ${torrent.name}`);
      }

      // Принудительно выбираем все кусочки для загрузки (если есть)
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }

      // Принудительно перезапускаем торрент для лучшего подключения
      if (torrent.paused) {
        // Если торрент уже на паузе, просто запускаем его
        torrent.resume();
      } else {
        // Если торрент активен, останавливаем и запускаем заново
        torrent.pause();
        await new Promise(resolve => setTimeout(resolve, 1000));
        torrent.resume();
      }

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Принудительная загрузка метаданных запущена' });
    } catch (e) {
      console.error('Ошибка принудительной загрузки метаданных:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для обновления трекеров
  updateTrackers = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Обновление трекеров] ${torrent.name || torrent.infoHash}`);

      // Принудительно обновляем трекер
      if (torrent.tracker) {
        try {
          torrent.tracker.announce();
          console.log(`[Трекер обновлен] ${torrent.name}`);
        } catch (e) {
          console.log(`[Ошибка трекера] ${torrent.name}:`, e.message);
        }
      }

      // Принудительно обновляем все трекеры
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Обновление трекеров] ${torrent.name}: ${torrent.announce.length} трекеров`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
      }

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Трекеры обновлены' });
    } catch (e) {
      console.error('Ошибка обновления трекеров:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для диагностики проблем с торрентом
  diagnose = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      // Правильно считаем количество пиров
      let numPeers = 0;
      let numSeeds = 0;
      let numLeeches = 0;
      
      if (torrent.wires && torrent.wires.length > 0) {
        numPeers = torrent.wires.length;
        torrent.wires.forEach(wire => {
          if (wire.peer && wire.peer.isSeeder) {
            numSeeds++;
          } else {
            numLeeches++;
          }
        });
      } else {
        numPeers = torrent.numPeers || 0;
        numSeeds = torrent.numSeeds || 0;
        numLeeches = torrent.numLeeches || 0;
      }

      // Безопасно получаем информацию о файлах
      let filesCount = 0;
      let selectedFiles = 0;
      if (torrent.files && torrent.files.length > 0) {
        filesCount = torrent.files.length;
        selectedFiles = torrent.files.filter(f => f.selected).length;
      }

      // Безопасно получаем информацию о кусках
      let piecesCount = 0;
      let selectedPieces = 0;
      if (torrent.pieces && torrent.pieces.length > 0) {
        piecesCount = torrent.pieces.length;
        selectedPieces = torrent.pieces.filter(p => p).length;
      }

      const diagnosis = {
        infoHash: torrent.infoHash,
        name: torrent.name || 'Неизвестно',
        paused: torrent.paused || false,
        progress: Math.round((torrent.progress || 0) * 100),
        downloaded: torrent.downloaded || 0,
        length: torrent.length || 0,
        numPeers: numPeers,
        numSeeds: numSeeds,
        numLeeches: numLeeches,
        downloadSpeed: torrent.downloadSpeed || 0,
        uploadSpeed: torrent.uploadSpeed || 0,
        timeRemaining: torrent.timeRemaining || 0,
        hasMetadata: !!(torrent.files && torrent.files.length > 0),
        filesCount: filesCount,
        piecesCount: piecesCount,
        selectedPieces: selectedPieces,
        selectedFiles: selectedFiles,
        announce: Array.isArray(torrent.announce) ? torrent.announce : [],
        magnetURI: torrent.magnetURI || '',
        status: torrent.status || 'unknown',
        error: torrent.error ? torrent.error.message : null,
        // Дополнительная информация о трекерах
        trackers: Array.isArray(torrent.announce) ? torrent.announce.map((tracker, index) => ({
          index,
          url: tracker,
          status: 'active'
        })) : [],
        // Информация о DHT
        dht: torrent.dht ? 'enabled' : 'disabled',
        // Информация о локальном peer discovery
        lpd: torrent.lpd ? 'enabled' : 'disabled',
        // Детальная информация о пирах
        peers: {
          total: numPeers,
          seeds: numSeeds,
          leeches: numLeeches,
          connected: torrent.wires ? torrent.wires.length : 0,
          wireAddresses: torrent.wires ? torrent.wires.map(wire => wire.peerAddress || 'unknown').filter(addr => addr !== 'unknown') : []
        },
        // Информация о трекерах
        trackerInfo: {
          hasTracker: !!(torrent.tracker),
          trackerStatus: torrent.tracker ? 'active' : 'inactive',
          lastAnnounce: null // Убираем потенциально проблемное поле
        }
      };

      console.log(`[Диагностика] ${torrent.name || torrent.infoHash}:`, diagnosis);

      res.json({ success: true, diagnosis });
    } catch (e) {
      console.error('Ошибка диагностики:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для принудительного запуска торрента
  forceStart = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Принудительный запуск] ${torrent.name || torrent.infoHash}`);

      // Принудительно запускаем торрент
      if (torrent.paused) {
        torrent.resume();
      }

      // Принудительно выбираем все файлы для загрузки
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => {
          if (!file.selected) {
            file.select();
          }
        });
      }

      // Принудительно выбираем все кусочки для загрузки
      if (torrent.pieces && torrent.pieces.length > 0) {
        torrent.select(0, torrent.pieces.length - 1, false);
      }

      // Убираем из паузы
      this.pausedTorrents.delete(infoHash);

      // Отправляем обновление
      const serialized = this.serializeTorrent(torrent);
      if (serialized) {
        this.io && this.io.emit('torrent:update', serialized);
      }

      res.json({ success: true, msg: 'Торрент принудительно запущен' });
    } catch (e) {
      console.error('Ошибка принудительного запуска:', e);
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
        const serialized = this.serializeTorrent(added);
        if (serialized) {
          this.io && this.io.emit('torrent:update', serialized);
        }
        res.json({ success: true });
      });

    } catch (e) {
      console.error('Ошибка возобновления:', e);
      res.json({ success: false, msg: e.message });
    }
  }
}

module.exports = new TorrentController();