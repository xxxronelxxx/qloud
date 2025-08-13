let electronApp;
try {
    const electron = require('electron');
    electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
    electronApp = null;
}
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const mime = require('mime-types');
const { opendir } = require('fs').promises;

class FileSystemModel {
    constructor() {
        // Используем настройки для определения пути
        const Settings = require('./SettingsModel');
        this.projectPath = Settings.getUploadsPath();
        this.allowedSet = new Set(['image', 'audio', 'video']);
        this.videoExt = new Set(['.3gp', '.3g2', '.avi', '.flv', '.mkv', '.mov', '.mp4', '.m4v', '.mpeg', '.mpg', '.ogv', '.webm', '.ts', '.mts', '.m2ts', '.rm', '.rmvb', '.vob', '.wmv', '.asf', '.divx', '.xvid']);
        this.audioExt = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma', '.ogg', '.oga', '.alac', '.aiff', '.ape', '.amr', '.ac3', '.dts', '.opus', '.ra', '.ram', '.mid', '.midi', '.au', '.pcm', '.spx', '.caf', '.tta']);
        this.imageExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif', '.raw', '.psd', '.ai', '.eps', '.apng', '.avif', '.jfif', '.pjpeg', '.pjp', '.emf', '.wmf', '.dds', '.xbm', '.jxl', '.exr']);
        this.previewExt = new Set(['.pdf']);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }

    // Теперь проверка выхода за пределы каталога делается через path.relative
    decodePath(encodedPath) {
        try {
            const decoded = decodeURIComponent(encodedPath);
            const normalizedPath = path.posix.normalize(decoded.replace(/\\/g, '/'));
            const finalPath = path.resolve(this.projectPath, '.' + normalizedPath);

            const relative = path.relative(this.projectPath, finalPath);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
                throw new Error('Выход за пределы projectPath');
            }

            const parts = normalizedPath.split('/').filter(Boolean);
            const title = parts.length ? parts.at(-1) : 'Главная';

            return { status: true, finalPath, title };
        } catch (e) {
            console.warn('[decodePath error]:', e.message);
            return { status: false, msg: e.message };
        }
    }


    encodePath(inputPath) {
        const rel = path.posix.normalize(inputPath.replace(/\\/g, '/'));
        const cleanPath = rel.startsWith('/') ? rel : `/${rel}`;
        return encodeURIComponent(cleanPath);
    }


    classifyMediaType(filePath) {
        // 1) Пытаемся по mime‑типу
        const fullMime = mime.lookup(filePath) || '';
        const [type] = fullMime.split('/'); // часть до «/»

        // 2) Фоллбэк по расширению
        const ext = path.extname(filePath).toLowerCase();
        
        // Отладочная информация для JPG файлов
        if (ext === '.jpg' || ext === '.jpeg') {
            console.log(`🔍 Анализ JPG файла: ${filePath}`);
            console.log(`📝 Расширение: ${ext}`);
            console.log(`🎯 MIME тип: ${fullMime}`);
            console.log(`📋 Тип из MIME: ${type}`);
            console.log(`✅ В списке imageExt: ${this.imageExt.has(ext)}`);
        }
        
        if (this.videoExt.has(ext)) return { type: "video", mime: fullMime };
        if (this.audioExt.has(ext)) return { type: 'audio', mime: fullMime };
        if (this.imageExt.has(ext)) return { type: 'image', mime: fullMime };
        if (this.previewExt.has(ext)) return { type: 'preview', mime: fullMime };

        // 3) Если не подошло ни то, ни другое
        return { type: 'other', mime: fullMime };
    }

    async *walk(dir, ext) {

        if (!this.allowedSet.has(ext)) {
            return null;
        }

        let relativeExt = null;

        switch (ext) {
            case "audio": relativeExt = this.audioExt; break;
            case "video": relativeExt = this.videoExt; break;
            case "image": relativeExt = this.imageExt; break;
            default: relativeExt = null; break;
        }

        if (!relativeExt) return;

        const direntIterator = await opendir(dir);
        for await (const dirent of direntIterator) {
            const res = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                yield* this.walk(res, ext);
            } else {
                const ext = path.extname(dirent.name).toLowerCase();
                if (relativeExt.has(ext)) {
                    yield res;
                }
            }
        }
    }

    async *searchFS(dir = this.projectPath, queryLC) {
        const it = await opendir(dir);

        for await (const dirent of it) {
            const full = path.join(dir, dirent.name);
            const nameLC = dirent.name.toLowerCase();

            if (dirent.isDirectory()) {
                if (nameLC.includes(queryLC)) {
                    yield full;
                }
                yield* this.searchFS(full, queryLC);

            } else {
                if (nameLC.includes(queryLC)) {
                    yield full;
                }
            }
        }
    }


    async searchAll(query) {
        const lc = query.toLowerCase();
        const results = [];
        for await (const filePath of this.searchFS(this.projectPath, lc)) {
            const replaceFilePath = filePath.replace(this.projectPath, "").replace(/\\/g, '/')
            results.push({ name: path.basename(replaceFilePath), path: replaceFilePath, fullPath: this.encodePath(replaceFilePath) });
        }
        return results;
    }


    async findGlobalFiles(ext) {
        const results = [];
        for await (const filePath of this.walk(this.projectPath, ext)) {
            const replaceFilePath = filePath.replace(this.projectPath, "").replace(/\\/g, '/')
            results.push({ name: path.basename(replaceFilePath), path: replaceFilePath, fullPath: this.encodePath(replaceFilePath), type: ext });
        }
        return results;
    }

    readFile(fullPath) {
        const relative = fullPath.replace(this.projectPath, "");
        const relativePath = path.join("/media", relative).replace(/\\/g, '/');
        return relativePath;
    }

    createFolderHandler = async (name, url) => {
        try {
            let fullPath;

            if (url === '/') {
                fullPath = this.projectPath;
            } else {
                const { finalPath } = this.decodePath(url);
                fullPath = finalPath;
            }

            let exists = true;
            let modifiedPath = path.join(fullPath, name);

            try {
                await fs.access(modifiedPath);
            } catch {
                exists = false;
            }

            if (exists) {
                modifiedPath = `${modifiedPath} - (${Date.now()})`;
            }

            await fs.mkdir(modifiedPath, { recursive: true });

            return { status: true }
        } catch (error) {
            return { status: false, msg: error?.message || "Что-то пошло не так" };
        }
    }

    async fileInfo(fullPath) {
        // получаем статистику (lstat чтобы не разворачивать символические ссылки)
        const stats = await fs.lstat(fullPath);

        // базовые поля
        const info = {
            name: path.basename(fullPath),
            // размеры и времена
            size: stats.size,               // в байтах
            humanSize: this.formatBytes(stats.size),
            birthTime: stats.birthtime,          // создание
            modifiedTime: stats.mtime,            // последнее изменение
            accessedTime: stats.atime,            // последнее чтение
            changedTime: stats.ctime,            // изменение метаданных

            // mime‑тип для файлов
            mimeType: stats.isFile() ? mime.lookup(fullPath) || 'unknown' : null,
            fullMime: stats.isFile() ? mime.lookup(fullPath) || 'unknown' : null,

            // сырые данные stats на всякий случай
        };

        return info;
    }

    async readDirectory(fullPath) {
        const dirents = await fs.readdir(fullPath, { withFileTypes: true });

        // 4) Параллельно собираем метаданные
        const items = await Promise.all(dirents.map(async dirent => {
            const name = dirent.name;
            const itemPath = path.join(fullPath, name);
            const relativePath = path.posix.normalize(
                path.relative(this.projectPath, itemPath).replace(/\\/g, '/')
            );

            const base64Path = this.encodePath(relativePath);
            const stats = await fs.stat(itemPath);

            const isDir = dirent.isDirectory();
            const fullMime = isDir ? null : mime.lookup(itemPath) || 'unknown';
            const mimeType = fullMime ? fullMime.split('/')[0] : null;
            
            const mediaType = this.classifyMediaType(itemPath);
            const icon = mediaType.type || "other";
            
            // Отладочная информация для JPG файлов
            if (path.extname(itemPath).toLowerCase() === '.jpg' || path.extname(itemPath).toLowerCase() === '.jpeg') {
                console.log(`📁 Файл: ${name}`);
                console.log(`🎯 MediaType: ${JSON.stringify(mediaType)}`);
                console.log(`🖼️ Icon: ${icon}`);
            }

            return {
                name,
                path: base64Path,
                type: isDir ? 'directory' : 'file',
                icon: icon,
                mime: mimeType,
                fullMime,
                size: isDir ? null : this.formatBytes(stats.size),
                modified: stats.mtime
            };
        }));

        // 5) Сортируем: сначала папки, потом файлы по дате
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.modified - b.modified;
        });
        return items;
    }

    generateBreadcrumbs(fullPath) {
        // 1) Обрезаем префикс projectPath и нормализуем слеши
        const relative = fullPath
            .replace(this.projectPath, '')
            .replace(/\\/g, '/');

        // 2) Разбиваем на сегменты, убирая пустые
        const parts = relative.split('/').filter(Boolean);

        // 3) Начинаем массив «крошек» с Главной
        const crumbs = [{
            name: 'Главная',
            path: '/',
            fullPath: "/",
            active: parts.length === 0
        }];

        // 4) Аккумулируем путь и добавляем остальные сегменты
        let acc = '';
        parts.forEach((segment, i) => {
            acc += '/' + segment;
            crumbs.push({
                name: segment,
                path: acc,
                fullPath: this.encodePath(acc),
                active: i === parts.length - 1
            });
        });

        return crumbs;
    }
    // Асинхронная версия toPath
    async toPath(pathSuffix = '/') {
        // 1) Убеждаемся, что папка существует
        await fs.mkdir(this.projectPath, { recursive: true });

        // 2) Определяем fullPath и title
        let fullPath, title;
        if (pathSuffix === '/') {
            fullPath = this.projectPath;
            title = 'Главная';
        } else {
            const { status, finalPath, title: t } = this.decodePath(pathSuffix);
            if (!status) return { modifiedResult: [], title: '', parentPath: null };
            fullPath = finalPath;
            title = t;
        }

        console.log(fullPath);

        const typeOfPathFs = await fs.stat(fullPath);
        const typeOfPath = typeOfPathFs.isDirectory() ? "directory" : "file";

        let items = [], fileType = {}, fileContent = "", fileInfo = {}, fileList = [];

        const breadCrumbs = this.generateBreadcrumbs(fullPath);

        if (typeOfPath === "directory") {
            items = await this.readDirectory(fullPath);
        } else {
            fileType = this.classifyMediaType(fullPath)
            fileContent = this.readFile(fullPath);
            fileInfo = await this.fileInfo(fullPath);

            if (fileType.type !== "other") {
                const files = await this.findGlobalFiles(fileType.type);
                fileList = files;
            }
        }

        return { modifiedResult: items, title, type: typeOfPath, fileType, fileInfo, fileContent, breadCrumbs, fileList };
    }

    // ------------------------------------------- //
    // путь к временным чанкам

    getChunkTempPath(finalPath) {
        return path.join(finalPath, '__chunks__');
    }

    async saveChunk({ finalPath, safeName, index, buffer }) {
        const chunkDir = this.getChunkTempPath(finalPath);
        await fs.mkdir(chunkDir, { recursive: true });

        const chunkPath = path.join(chunkDir, `${safeName}.part${index}`);
        await fs.writeFile(chunkPath, buffer);
    }

    async assembleChunks({ finalPath, safeName, totalChunks, outputPath }) {
        const chunkDir = this.getChunkTempPath(finalPath);
        const writeStream = fsSync.createWriteStream(outputPath);

        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunkDir, `${safeName}.part${i}`);
            const data = await fs.readFile(chunkPath);
            writeStream.write(data);
            await fs.unlink(chunkPath); // удаляем чанк
        }

        writeStream.end();
        console.log(chunkDir)

        // после сборки удаляем папку __chunks__
        await fs.rmdir(chunkDir).catch(() => { });
        return outputPath;
    }

    async handleChunkUpload({ base64Path, fileName, index, total, buffer }) {
        const { status, finalPath } = this.decodePath(base64Path);
        if (!status) return { status: false, msg: "Недопустимый путь" };

        console.log(finalPath);

        const safeName = path.basename(fileName).replace(/[^a-z0-9_.\-]/gi, '');
        const outputFilePath = path.join(finalPath, safeName);


        await this.saveChunk({ finalPath, safeName, index, buffer });

        if (index + 1 === total) {
            await this.assembleChunks({
                finalPath,
                safeName,
                totalChunks: total,
                outputPath: outputFilePath
            });

            const info = await this.fileInfo(outputFilePath);
            return { status: true, info };
        }

        return { status: 'waiting' };
    }

    // Удаление файла или папки

    async deleteEntry(paths) {
        const toDelete = Array.isArray(paths) ? paths : [paths];

        for (const base64Path of toDelete) {
            try {
                const { status, finalPath } = this.decodePath(base64Path);
                if (!status) continue;

                const stats = await fs.lstat(finalPath);
                if (stats.isDirectory()) {
                    await fs.rm(finalPath, { recursive: true, force: true });
                } else {
                    await fs.unlink(finalPath);
                }
            } catch {
                // Просто пропускаем, если что-то пошло не так
                continue;
            }
        }

        return { status: true };
    }

    async getSubfolders(base64Path) {
        try {
            const { status, finalPath } = this.decodePath(base64Path);
            if (!status) return { status: false, msg: "Недопустимый путь" };

            const dirents = await fs.readdir(finalPath, { withFileTypes: true });

            const folders = dirents
                .filter(d => d.isDirectory())
                .map(d => {
                    const rel = path.posix.normalize(
                        path.relative(this.projectPath, path.join(finalPath, d.name)).replace(/\\/g, '/')
                    );
                    return {
                        name: d.name,
                        base64Path: this.encodePath('/' + rel)
                    };
                });

            // Относительный путь текущей папки от projectPath
            let relPath = path.posix.normalize(
                path.relative(this.projectPath, finalPath).replace(/\\/g, '/')
            );

            // Убираем случай, когда relPath === "."
            if (relPath === '.' || relPath === './') relPath = '';

            const parts = relPath.split('/').filter(Boolean);
            const breadcrumbs = [];

            let currentPath = '';
            breadcrumbs.push({
                name: 'Главная',
                base64Path: this.encodePath('/')
            });

            for (const part of parts) {
                currentPath += '/' + part;
                breadcrumbs.push({
                    name: part,
                    base64Path: this.encodePath(currentPath)
                });
            }


            // Текущая директория
            const current = {
                name: parts.length ? parts[parts.length - 1] : 'Главная',
                base64Path: base64Path || this.encodePath('/')
            };

            return { status: true, folders, breadcrumbs, current };
        } catch (err) {
            return { status: false, msg: err.message };
        }
    }

    // Move folder

    async formatDateForName(date = new Date()) {
        const pad = n => n.toString().padStart(2, '0');
        const dd = pad(date.getDate());
        const mm = pad(date.getMonth() + 1);
        const yy = pad(date.getFullYear() % 100);
        const hh = pad(date.getHours());
        const ii = pad(date.getMinutes());
        const ss = pad(date.getSeconds());
        return `${dd}-${mm}-${yy}_${hh}-${ii}-${ss}`;
    }

    async moveItems(base64Targets, base64Dest) {
        try {
            const dest = this.decodePath(base64Dest);
            if (!dest.status) throw new Error("Недопустимый путь назначения");

            const destPath = dest.finalPath;
            const targets = Array.isArray(base64Targets) ? base64Targets : [base64Targets];

            for (const encoded of targets) {
                const decoded = this.decodePath(encoded);
                if (!decoded.status) continue;

                const sourcePath = decoded.finalPath;

                console.log(sourcePath)

                const name = path.basename(sourcePath);
                const date = await this.formatDateForName();
                let newName = name;
                let targetPath = path.join(destPath, newName);

                // Если перемещаем внутрь самого себя (вложенность)
                const isSelfMove = destPath === sourcePath || destPath.startsWith(sourcePath + path.sep);

                // Проверка: если имя уже существует в целевой папке
                try {
                    await fs.access(targetPath);
                    newName = `${name}_(${date})`;
                    targetPath = path.join(destPath, newName);
                } catch (e) {
                    // Всё ок, файла/папки нет
                }

                console.log(sourcePath,targetPath);

                if (isSelfMove) {
                    await this.copyRecursive(sourcePath, targetPath);
                } else {
                    await fs.mkdir(path.dirname(targetPath), { recursive: true }); // ✅ создание директории
                    await fs.rename(sourcePath, targetPath);
                }
            }

            return { status: true, msg: "Перемещение выполнено" };
        } catch (err) {
            console.error(err);
            return { status: false, msg: err.message };
        }
    }


    async copyRecursive(src, dest) {
        const stat = await fs.stat(src);
        if (stat.isDirectory()) {
            await fs.mkdir(dest, { recursive: true });
            const entries = await fs.readdir(src);
            for (const entry of entries) {
                const srcPath = path.join(src, entry);
                const destPath = path.join(dest, entry);

                // Пропуск целевой папки, чтобы избежать рекурсии
                if (srcPath === dest) continue;

                await this.copyRecursive(srcPath, destPath);
            }
        } else {
            await fs.copyFile(src, dest);
        }
    }

    async renameItem(name, newName, encodedPath) {
        try {
            const decoded = this.decodePath(encodedPath);
            if (!decoded.status) {
                throw new Error('Неверный путь');
            }

            const dirPath = decoded.finalPath;
            const oldPath = path.join(dirPath, name);
            const newPath = path.join(dirPath, newName);

            // Проверка, существует ли исходный файл или папка
            await fs.access(oldPath);

            // Проверка, что по новому имени ещё ничего нет
            try {
                await fs.access(newPath);
                throw new Error('Файл или папка с таким именем уже существует');
            } catch {
                // ОК — ничего нет по новому пути
            }

            await fs.rename(oldPath, newPath);

            return { status: true, msg: 'Успешно переименовано' };
        } catch (err) {
            console.error('[renameItem error]:', err.message);
            return { status: false, msg: err.message };
        }
    }





}

module.exports = FileSystemModel;
