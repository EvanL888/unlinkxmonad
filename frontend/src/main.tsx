import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { UnlinkProvider } from '@unlink-xyz/react'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <UnlinkProvider chain="monad-testnet">
            <App />
        </UnlinkProvider>
    </React.StrictMode>,
)
