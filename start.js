const { app, BrowserWindow,dialog } = require('electron');
const http = require('http');
const path = require('path');

// Запускаем миграцию данных при первом запуске
try {
  const { migrateData } = require('./migrate-data.js');
  migrateData();
} catch (error) {
  console.log('Миграция данных не выполнена:', error.message);
}

// 1. Запускаем сервер из app.js
require(path.join(__dirname, 'app.js'));

function waitForServer(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ports = [80, 3000]; // Проверяем оба порта
    let currentPortIndex = 0;

    console.log('🔍 Начинаем поиск сервера...');

    const check = () => {
      const port = ports[currentPortIndex];
      const url = `http://localhost:${port === 80 ? '' : port}/auth`;
      
      console.log(`🔍 Проверяем: ${url}`);
      
      http.get(url, res => {
        console.log(`✅ Сервер отвечает на ${url}, статус: ${res.statusCode}`);
        if ([200, 404].includes(res.statusCode)) {
          console.log(`🎉 Сервер найден на порту ${port}`);
          resolve(port); // сервер запущен
        } else {
          console.log(`⚠️ Неожиданный статус: ${res.statusCode}, пробуем дальше`);
          retry();
        }
      }).on('error', (err) => {
        console.log(`❌ Ошибка при проверке ${url}: ${err.message}`);
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeout) {
        console.log(`⏰ Таймаут поиска сервера (${timeout}ms)`);
        reject(new Error('Сервер не отвечает'));
      } else {
        currentPortIndex = (currentPortIndex + 1) % ports.length;
        console.log(`🔄 Переключаемся на следующий порт через 500ms`);
        setTimeout(check, 500);
      }
    };

    check();
  });
}

async function createWindow() {
  try {
    console.log('🚀 Создаем окно Electron...');
    const port = await waitForServer();
    console.log(`✅ Получен порт: ${port}`);
    
    const baseUrl = port === 80 ? 'http://localhost' : `http://localhost:${port}`;
    console.log(`🌐 Загружаем URL: ${baseUrl}`);

    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 420,   // 👈 Минимальная ширина
      minHeight: 400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });
    win.setMenu(null);
    win.loadURL(baseUrl);
    console.log('✅ Окно создано и URL загружен');
    
    win.on('close', (e) => {
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['Нет', 'Да'],
            defaultId: 0,
            cancelId: 0,
            title: 'Выход',
            message: 'Вы действительно хотите закрыть приложение?',
        });

        if (choice === 0) {
            e.preventDefault(); // Отменить закрытие
        }
    });
    // win.webContents.openDevTools();
  } catch (err) {
    console.error('💥 Ошибка запуска сервера:', err.message);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
