import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/prompt/thai-400.css'
import '@fontsource/prompt/thai-600.css'
import '@fontsource/prompt/thai-700.css'
import '@fontsource/prompt/latin-400.css'
import '@fontsource/prompt/latin-600.css'
import '@fontsource/prompt/latin-700.css'
import './styles.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
