# Qloud

**Qloud** is a lightweight, offline-first media server and file manager built with **Electron** and **Node.js**. It allows you to share files, stream media, and manage folders over a local network — no internet required.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
<!-- Badges were pointing to previous project; will be updated later. -->
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-blue)

---

## 🚀 Features

- 🖥️ Runs as a desktop Electron app
- 🌐 Share files and stream media over LAN
- 📁 View and manage folders via intuitive UI
- 🔒 Local-only, private and secure
- ⚡ Fast and lightweight
- 📂 **Customizable storage path** - choose where to save files
- 🔄 **Automatic data migration** - seamless transition from old storage location

---

## 🛠 Technologies

- **Electron** — for cross-platform desktop app
- **Express.js** — backend server for file access
- **Bootstrap 5** — responsive and clean UI
- **JavaScript (ES6+)** — everything written in modern vanilla JS

---

## 📦 Installation

Download the latest version from the (SOON).

> ⚠️ No internet access is required after installation.

---

## 📡 How It Works

1. Launch the app
2. Your computer starts a local server (e.g. `http://192.168.1.5:3000`)
3. Connect from any device in the same Wi-Fi network
4. Browse and download files via browser

---

## 📂 Storage Configuration

Qloud now supports flexible storage configuration:

- **Default**: Files are saved in the application folder (portable mode)
- **Custom path**: Choose any folder on your system
- **Legacy support**: Automatic migration from old Documents folder

### Storage Settings

Access storage settings in the app's Settings page:
- Toggle between app folder and custom path
- View current storage location
- Automatic data migration on first run

### Data Migration

If you have existing data in the old location (`Documents/Qloud/`), it will be automatically migrated to the new location on first run.

---

## 🤝 Contributing

This project is still in its early stage. Contributions, suggestions, and feedback are welcome!

---

## 📃 License

MIT License
