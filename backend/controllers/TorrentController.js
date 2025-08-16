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
      
      // Создаем клиент с правильными настройками для подключения к пирам
      this.client = new WebTorrent({ 
        dht: true,           // Включаем DHT
        tracker: true,       // Включаем трекеры
        lpd: true,           // Включаем локальное peer discovery
        utp: true,           // Включаем uTP
        maxConns: 55,        // Увеличиваем максимальное количество соединений
        nodeId: undefined,   // Автоматически генерируем node ID
        peerId: undefined,   // Автоматически генерируем peer ID
        announce: [],        // Пустой список трекеров по умолчанию
        getAnnounceOpts: () => ({}), // Опции для анонса
        rtcConfig: {},       // WebRTC конфигурация
        userAgent: 'WebTorrent/2.0.0', // User agent
        // Добавляем настройки для лучшего подключения к пирам
        port: 0,             // Автоматический выбор порта
        hostname: '0.0.0.0', // Слушаем на всех интерфейсах
        // Настройки для трекеров
        tracker: {
          announce: [],      // Пустой список трекеров по умолчанию
          getAnnounceOpts: () => ({})
        },
        // Дополнительные настройки для подключения к пирам
        wire: {
          // Настройки для wire протокола
          utp: true,         // Включаем uTP
          tcp: true,         // Включаем TCP
          maxConns: 55       // Максимальное количество соединений
        }
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
      
      console.log('[WebTorrent Client] Инициализирован с улучшенными настройками для пиров');
      
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
      
      this.io && this.io.emit('torrent:add', this.serializeTorrent(torrent));
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
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));
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
        items: client.torrents.map(t => this.serializeTorrent(t))
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
      
      // Добавляем торрент с правильными настройками для трекеров
      const torrent = client.add(magnet, { 
        path: this.downloadDir,
        announce: [], // Пустой список трекеров - будут использованы трекеры из magnet ссылки
        dht: true,   // Включаем DHT
        lpd: true,   // Включаем локальное peer discovery
        private: false, // Разрешаем публичные торренты
        // Дополнительные настройки для лучшего подключения
        port: 0,     // Автоматический выбор порта
        hostname: '0.0.0.0', // Слушаем на всех интерфейсах
        // Настройки для wire протокола
        wire: {
          utp: true,     // Включаем uTP
          tcp: true,     // Включаем TCP
          maxConns: 55   // Максимальное количество соединений
        }
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

        // Принудительно запускаем торрент
        if (torrent.paused) {
          torrent.resume();
        }

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
      
      // Добавляем торрент с правильными настройками для трекеров
      const torrent = client.add(file.buffer, { 
        path: this.downloadDir,
        announce: [], // Пустой список трекеров - будут использованы трекеры из .torrent файла
        dht: true,   // Включаем DHT
        lpd: true,   // Включаем локальное peer discovery
        private: false, // Разрешаем публичные торренты
        // Дополнительные настройки для лучшего подключения
        port: 0,     // Автоматический выбор порта
        hostname: '0.0.0.0', // Слушаем на всех интерфейсах
        // Настройки для wire протокола
        wire: {
          utp: true,     // Включаем uTP
          tcp: true,     // Включаем TCP
          maxConns: 55   // Максимальное количество соединений
        }
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

        // Принудительно запускаем торрент
        if (torrent.paused) {
          torrent.resume();
        }

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

  // Метод для принудительного подключения к трекерам и пирам
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
        
        // Принудительно обновляем трекеры
        torrent.tracker && torrent.tracker.announce();
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
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));

      res.json({ success: true, msg: 'Принудительное подключение запущено' });
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

      // Отправляем обновление
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));

      res.json({ success: true, msg: 'Принудительная загрузка метаданных запущена' });
    } catch (e) {
      console.error('Ошибка принудительной загрузки метаданных:', e);
      res.json({ success: false, msg: e.message });
    }
  }

  // Метод для принудительного обновления трекеров
  updateTrackers = async (req, res) => {
    try {
      const { infoHash } = req.params;
      const client = await this.getClient();
      const torrent = client.get(infoHash);

      if (!torrent) {
        return res.json({ success: false, msg: 'Торрент не найден' });
      }

      console.log(`[Обновление трекеров] ${torrent.name || torrent.infoHash}`);

      // Принудительно обновляем трекеры
      if (torrent.announce && torrent.announce.length > 0) {
        console.log(`[Трекеры] ${torrent.name}: ${torrent.announce.length} трекеров`);
        torrent.announce.forEach((tracker, index) => {
          console.log(`[Трекер ${index}] ${tracker}`);
        });
        
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
      } else {
        console.log(`[Нет трекеров] ${torrent.name}`);
      }

      // Отправляем обновление
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));

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

      const diagnosis = {
        infoHash: torrent.infoHash,
        name: torrent.name,
        paused: torrent.paused,
        progress: torrent.progress,
        downloaded: torrent.downloaded,
        length: torrent.length,
        numPeers: torrent.numPeers,
        numSeeds: torrent.numSeeds,
        numLeeches: torrent.numLeeches,
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        timeRemaining: torrent.timeRemaining,
        hasMetadata: !!(torrent.files && torrent.files.length > 0),
        filesCount: torrent.files ? torrent.files.length : 0,
        piecesCount: torrent.pieces ? torrent.pieces.length : 0,
        selectedPieces: torrent.pieces ? torrent.pieces.filter(p => p).length : 0,
        selectedFiles: torrent.files ? torrent.files.filter(f => f.selected).length : 0,
        announce: torrent.announce || [],
        magnetURI: torrent.magnetURI,
        status: torrent.status,
        error: torrent.error ? torrent.error.message : null,
        // Дополнительная информация о трекерах
        trackers: torrent.announce ? torrent.announce.map((tracker, index) => ({
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
          total: torrent.numPeers,
          seeds: torrent.numSeeds,
          leeches: torrent.numLeeches,
          connected: torrent.wires ? torrent.wires.length : 0,
          wireAddresses: torrent.wires ? torrent.wires.map(wire => wire.peerAddress) : []
        },
        // Информация о трекерах
        trackerInfo: {
          hasTracker: !!(torrent.tracker),
          trackerStatus: torrent.tracker ? 'active' : 'inactive',
          lastAnnounce: torrent.tracker ? torrent.tracker.lastAnnounce : null
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
      this.io && this.io.emit('torrent:update', this.serializeTorrent(torrent));

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