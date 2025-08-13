const fs = require('fs');
const path = require('path');

// Скрипт для миграции данных из старого пути в новый
function migrateData() {
  const projectName = 'Qloud';
  
  // Старый путь (Documents)
  const documentsPath = (() => {
    const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH || '';
    return path.join(home, 'Documents');
  })();
  const oldPath = path.join(documentsPath, projectName);
  
  // Новый путь (папка приложения)
  const newPath = path.join(process.cwd(), projectName);
  
  console.log('Миграция данных Qloud...');
  console.log(`Из: ${oldPath}`);
  console.log(`В: ${newPath}`);
  
  if (!fs.existsSync(oldPath)) {
    console.log('Старая папка не найдена, миграция не требуется.');
    return;
  }
  
  if (fs.existsSync(newPath)) {
    console.log('Новая папка уже существует, миграция не требуется.');
    return;
  }
  
  try {
    // Создаем новую папку
    fs.mkdirSync(newPath, { recursive: true });
    
    // Копируем файлы
    const copyRecursive = (src, dest) => {
      const stats = fs.statSync(src);
      if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        files.forEach(file => {
          copyRecursive(path.join(src, file), path.join(dest, file));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    copyRecursive(oldPath, newPath);
    console.log('Миграция завершена успешно!');
    console.log('Теперь можно удалить старую папку:', oldPath);
    
  } catch (error) {
    console.error('Ошибка при миграции:', error.message);
  }
}

// Запускаем миграцию только если скрипт вызван напрямую
if (require.main === module) {
  migrateData();
}

module.exports = { migrateData };