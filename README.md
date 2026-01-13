# Vtalk - AI-Powered Voice Dictation

Vtalk is a lightweight, cross-platform voice dictation application built with Electron, React, and OpenAI Whisper. It's designed to be a local alternative to apps like whisper Flow, allowing you to dictate text anywhere on your system with a simple hotkey.

**Built in under 1.5 hours using AI.**

## TLDR;
To get this running in seconds: Just open this project in Cursor, then open the AI Chat (Ctrl+L) and say: "I just cloned this; please set up my environment, install all dependencies, and help me add my OpenAI key so I can run the app." The AI will handle all the terminal commands, folder setups, and configuration for you—no developer experience required.

## Features

- **Global Hotkey:** Press and hold `Ctrl + Alt` (recommended) or `Ctrl + Win` to record instantly.
- **Continuous Mode:** Press `Space` while holding the modifiers to keep recording even after releasing.
- **Auto-Paste:** Transcribed text is automatically pasted into your active application using system-level automation.
- **Whisper AI Integration:** High-accuracy transcription powered by OpenAI's Whisper model.
- **Transcription History:** Keep track of your past dictations with WPM (Words Per Minute) and duration stats.
- **Local Database:** History is stored locally using SQLite for privacy and persistence.
- **Modern UI:** Clean, dark-themed interface built with Tailwind CSS and Framer Motion.
- **System Tray:** Runs quietly in the background for quick access.

## Tech Stack

- **Frontend:** React, Tailwind CSS, Framer Motion, Lucide React
- **Backend:** Electron, Node.js
- **Database:** SQLite (via `better-sqlite3`)
- **AI:** OpenAI Whisper API
- **Build Tool:** Vite, electron-vite

## How to Use

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

## Shortcuts

| Action | Shortcut |
|--------|----------|
| **Start Recording (Hold)** | `Ctrl + Alt` or `Ctrl + Win` (Hold) |
| **Stop Recording (Hold)** | Release hotkey |
| **Continuous Mode** | `Hotkey + Space` |
| **Stop Continuous** | `Hotkey` |

---

*This project was developed for my own daily use as I've grown sick of having so many subscriptions. $30 here, $20 there, all of a sudden you're forking out hundreds each month on software. as a developer trying to find your feet this quickly becomes too much and you soon have to start choosing what tool you'll have to go without this month. So I built this for myself but decided to opensource so others can save some cash too. Hopefully this inspires you to "just build it yourself"!*
