import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AdminPage from './AdminPage'
import './index.css'
import { UnlinkProvider } from '@unlink-xyz/react'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <UnlinkProvider chain="monad-testnet">
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<App />} />
                    <Route path="/admin" element={<AdminPage />} />
                </Routes>
            </BrowserRouter>
        </UnlinkProvider>
    </React.StrictMode>,
)
