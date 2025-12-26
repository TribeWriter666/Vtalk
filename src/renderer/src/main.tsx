import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'
import App from './App'

console.log('Renderer process starting...')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

