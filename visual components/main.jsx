import React from 'react'
import ReactDOM from 'react-dom/client'
import HeroVisual from './HeroVisual.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <HeroVisual />
    </div>
  </React.StrictMode>,
)
