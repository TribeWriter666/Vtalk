# Vtalk - Professional AI-Powered Voice Dictation & Cleanup

Vtalk is a lightweight, high-performance voice dictation application that transforms your spoken words into polished, perfectly formatted text. Built with Electron and React, it leverages the combined power of **OpenAI Whisper** for transcription and the **GPT-5 lineup** (5.2, Mini, and Nano) for intelligent text cleanup and rewriting.

Vtalk is designed to be the ultimate productivity companion—allowing you to dictate, refine, and translate text anywhere on your system with a single hotkey.

## Core Features

- **Global Hotkey:** Press and hold `Ctrl + Alt` to record instantly. Your text is pasted the moment you release.
- **AI Cleanup & Rewriting:** Powered by the latest GPT-5 models. Choose from **Natural**, **Professional**, **Casual**, or **Concise** styles to automatically remove filler words and polish your prose.
- **Live Translation:** Use custom prompts to dictate in one language and have the text instantly translated and pasted in another (e.g., "Translate my English voice to German text").
- **Voice Clone Data Gathering:** Option to save high-quality Mono MP3 recordings. Perfect for gathering the ~2.5 hours of audio needed for a high-quality personal voice clone (Eleven Labs compatible).
- **Intelligent Formatting:** AI automatically structures your dictation with paragraphs, bullet points, and logical flow—not just a block of text.
- **Real-Time Overlay:** A floating, non-intrusive status bar shows you exactly when you're Recording, Processing, or Refining with AI.
- **Transcription History:** Keep track of your past dictations with WPM (Words Per Minute), duration, and audio playback.
- **Adaptive Themes:** Full support for **Light Mode**, **Dark Mode**, and **System Detection**. Toggle your preference in the settings.
- **Privacy First:** Your transcription history and API settings are stored locally on your machine using SQLite.

## Tech Stack

- **Transcription:** OpenAI Whisper (High-accuracy speech-to-text)
- **Refinement:** GPT-5.2 (Nuance), GPT-5 Mini (Speed), GPT-5 Nano (Instant)
- **Frontend:** React, Tailwind CSS, Framer Motion, Lucide React
- **Backend:** Electron, Node.js
- **Database:** SQLite (via `better-sqlite3`)

## How to Use

### Prerequisites

- [Node.js](https://nodejs.org/) installed.
- An OpenAI API Key (or a Vtalk subscription).

### Shortcuts

| Action | Shortcut |
|--------|----------|
| **Start Recording (Hold)** | `Ctrl + Alt` (Hold) |
| **Stop Recording (Hold)** | Release `Ctrl + Alt` |
| **Continuous Mode (Toggle)** | `Ctrl + Alt` (Quick Tap) OR `Ctrl + Alt + Space` |
| **Stop Continuous** | `Ctrl + Alt` |

---

### Purchasing & Licensing

Vtalk was originally born out of a desire to escape the endless cycle of expensive software subscriptions. However, to ensure the ongoing development and support of these advanced features, Vtalk is now available through two flexible options:

1. **One-Time Purchase:** Pay once for the software and bring your own OpenAI API key. You only pay for the AI processing you actually use.
2. **Subscription:** A low-cost monthly fee that includes high-speed access to our integrated API keys—no setup required, just record and go.

This model allows me to keep the app affordable for everyone while still providing access to the absolute latest and best AI models available.
