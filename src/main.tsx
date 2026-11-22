import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from './app/AppShell'
import { PreferencesProvider } from './app/preferences'
import { DesignSystemPage } from './pages/DesignSystemPage'
import { EngineCheckPage } from './pages/EngineCheckPage'
import { ComingSoonPage, HelpPage, MorePage, SettingsPage } from './pages/more'
import { CustomersPage, LedgerPage, TodayPage, TripPage } from './pages/sections'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="trip" element={<TripPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="more/settings" element={<SettingsPage />} />
            <Route path="more/help" element={<HelpPage />} />
            <Route path="more/design" element={<DesignSystemPage />} />
            <Route path="more/engine-check" element={<EngineCheckPage />} />
            <Route path="more/:section" element={<ComingSoonPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
