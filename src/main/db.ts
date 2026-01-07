const Database = require('better-sqlite3')
import { app } from 'electron'
import path from 'path'

const dbPath = path.join(app.getPath('userData'), 'vtalk.db')
const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    duration INTEGER, -- in seconds
    wpm REAL,
    audio_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`)

// Handle migration for existing databases missing audio_path
try {
  db.exec('ALTER TABLE transcripts ADD COLUMN audio_path TEXT')
} catch (e) {
  // Column already exists or other error
}

export function saveTranscript(text: string, duration: number, audioPath?: string) {
  const words = text.trim().split(/\s+/).length
  const minutes = duration / 60
  const wpm = minutes > 0 ? words / minutes : 0
  
  const stmt = db.prepare('INSERT INTO transcripts (text, duration, wpm, audio_path) VALUES (?, ?, ?, ?)')
  const info = stmt.run(text, duration, wpm, audioPath)
  return { id: info.lastInsertRowid, text, duration, wpm, audio_path: audioPath, created_at: new Date().toISOString() }
}

export function getTranscripts(limit: number = 50, offset: number = 0) {
  const stmt = db.prepare('SELECT * FROM transcripts ORDER BY created_at DESC LIMIT ? OFFSET ?')
  return stmt.all(limit, offset)
}

export function getAllTranscripts() {
  const stmt = db.prepare('SELECT * FROM transcripts ORDER BY created_at DESC')
  return stmt.all()
}

export function deleteTranscript(id: number) {
  const stmt = db.prepare('DELETE FROM transcripts WHERE id = ?')
  return stmt.run(id)
}

export function getStats() {
  const stmt = db.prepare('SELECT COUNT(*) as count, SUM(duration) as totalDuration, AVG(wpm) as avgWpm FROM transcripts')
  const stats = stmt.get()
  
  // Also get total words manually since we store the text
  const allText = db.prepare('SELECT text FROM transcripts').all()
  const totalWords = allText.reduce((acc, row) => acc + (row.text.trim() ? row.text.trim().split(/\s+/).length : 0), 0)
  
  return {
    count: stats.count,
    totalDuration: stats.totalDuration || 0,
    avgWpm: Math.round(stats.avgWpm || 0),
    totalWords
  }
}

export function getSetting(key: string) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key)
  return row ? row.value : null
}

export function setSetting(key: string, value: string) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  return stmt.run(key, value)
}

