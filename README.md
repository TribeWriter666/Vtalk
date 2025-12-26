# Vtalk - AI-Powered Voice Dictation

Vtalk is a lightweight, cross-platform voice dictation application built with Electron, React, and OpenAI Whisper. It's designed to be a local alternative to apps like Flow, allowing you to dictate text anywhere on your system with a simple hotkey.

**Built in under 2 hours using AI.**

## 🚀 Features

- **Global Hotkey:** Press and hold `Ctrl + Win` (or `Ctrl + Ins`) to record instantly.
- **Continuous Mode:** Press `Space` while holding the modifiers to keep recording even after releasing.
- **Auto-Paste:** Transcribed text is automatically pasted into your active application using system-level automation.
- **Whisper AI Integration:** High-accuracy transcription powered by OpenAI's Whisper model.
- **Transcription History:** Keep track of your past dictations with WPM (Words Per Minute) and duration stats.
- **Local Database:** History is stored locally using SQLite for privacy and persistence.
- **Modern UI:** Clean, dark-themed interface built with Tailwind CSS and Framer Motion.
- **System Tray:** Runs quietly in the background for quick access.

## 🛠️ Tech Stack

- **Frontend:** React, Tailwind CSS, Framer Motion, Lucide React
- **Backend:** Electron, Node.js
- **Database:** SQLite (via `better-sqlite3`)
- **AI:** OpenAI Whisper API
- **Build Tool:** Vite, electron-vite

## 📋 How to Use

### Prerequisites

- [Node.js](https://nodejs.org/) installed.
- An OpenAI API Key.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/[your-username]/vtalk.git
   cd vtalk
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

### Running the App

- **Development Mode:**
  ```bash
  npm run dev
  ```
- **Build Production App:**
  ```bash
  npm run build:win  # For Windows
  npm run build:mac  # For macOS
  npm run build:linux # For Linux
  ```

## ⌨️ Shortcuts

| Action | Shortcut |
|--------|----------|
| **Start Recording (Hold)** | `Ctrl + Win` (Hold) |
| **Stop Recording (Hold)** | Release `Ctrl + Win` |
| **Continuous Mode** | `Ctrl + Win + Space` |
| **Stop Continuous** | `Ctrl + Win` |

---

*This project was developed as a portfolio piece to demonstrate rapid prototyping, AI integration, and local audio processing in Electron.*

