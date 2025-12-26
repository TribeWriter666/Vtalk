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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

export function saveTranscript(text: string, duration: number) {
  const words = text.trim().split(/\s+/).length
  const minutes = duration / 60
  const wpm = minutes > 0 ? words / minutes : 0
  
  const stmt = db.prepare('INSERT INTO transcripts (text, duration, wpm) VALUES (?, ?, ?)')
  const info = stmt.run(text, duration, wpm)
  return { id: info.lastInsertRowid, text, duration, wpm, created_at: new Date().toISOString() }
}

export function getTranscripts() {
  const stmt = db.prepare('SELECT * FROM transcripts ORDER BY created_at DESC')
  return stmt.all()
}

export function deleteTranscript(id: number) {
  const stmt = db.prepare('DELETE FROM transcripts WHERE id = ?')
  return stmt.run(id)
}

