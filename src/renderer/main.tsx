import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Import Tauri API bridge BEFORE App so window.electronAPI is available
import './services/tauri'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
