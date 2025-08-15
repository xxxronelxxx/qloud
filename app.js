// server.js
const bonjour = require('bonjour')();
let electronApp;
try {
  const electron = require('electron');
  electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
  electronApp = null;
}
const os = require('os');
const interfaces = os.networkInterfaces();

const express = require('express');
const cookieParser = require('cookie-parser');

const serverApp = express();
const PORT = 3000;
const http = require('http').createServer(serverApp);
const io = require('socket.io')(http);
require('./backend/controllers/ChatController').initSocket(io);
require('./backend/controllers/TorrentController').initSocket(io);

const path = require('path');
const engine = require('ejs-mate');

// Используем настройки для определения путей
const Settings = require('./backend/models/SettingsModel');
const uploadsPath = Settings.getUploadsPath();

serverApp.use('/media', express.static(uploadsPath, {
  setHeaders(res, file) {
    // inline–отображение, а не attachment
    res.setHeader('Content-Disposition', 'inline');
  }
}));

serverApp.use(express.json());
serverApp.use(cookieParser());

const apiRouter = require('./backend/routes/api.js');
const userRouter = require("./backend/routes/auth.js");
const mainRouter = require("./backend/routes/main.js");
const torrentsRouter = require('./backend/routes/torrents.js');
const kinozalRouter = require('./backend/routes/kinozal.js');
const ytsRouter = require('./backend/routes/yts.js');

serverApp.use('/api', apiRouter);
serverApp.use("/auth-api",userRouter);
serverApp.use("", mainRouter);
serverApp.use('/torrents', torrentsRouter);
serverApp.use('/api/kinozal', kinozalRouter);
serverApp.use('/api/yts', ytsRouter);

serverApp.engine('ejs', engine);
serverApp.set('view engine', 'ejs');
serverApp.set('views', path.join(__dirname, 'views'));

const YEAR_IN_MS = 365 * 24 * 60 * 60 * 1000;

serverApp.use((req, res, next) => {
  const cfg = Settings.readConfig();
  const cacheOn = !!cfg.cacheEnabled;
  const cacheVer = cfg.cacheVersion || 1;
  express.static(path.join(__dirname, 'public'), {
    maxAge: cacheOn ? YEAR_IN_MS : 0,
    immutable: cacheOn,
    etag: cacheOn ? false : true,
    lastModified: cacheOn ? false : true,
    setHeaders: (res, filePath) => {
      const cacheCtl = cacheOn ? `public, max-age=${YEAR_IN_MS/1000}, immutable` : 'no-store';
      res.setHeader('Cache-Control', cacheCtl);
      res.setHeader('X-Cache-Version', String(cacheVer));
    }
  })(req, res, next);
});

const localIp = Object.values(interfaces).flat().find(i => i.family === 'IPv4' && !i.internal)?.address;

serverApp.use((req, res, next) => {
  res.status(404).render('error-page',{status:404,title:"Страница не найдено",image:"/images/not-found.png"});
});

// Запускаем сервер
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Qloud доступен на http://${localIp}:${PORT}`);
});

bonjour.publish({
  name: 'Qloud',
  type: 'http',
  port: PORT,
  host: 'qloud.local' || localIp
});