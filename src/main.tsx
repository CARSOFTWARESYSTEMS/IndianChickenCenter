import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from './app/AppShell'
import { AuthGate } from './app/AuthGate'
import { PreferencesProvider } from './app/preferences'
import { ToastProvider } from './app/toast'
import { SessionProvider } from './firebase/session'
import { BillPage } from './pages/bill'
import { CustomerDetailPage, CustomersPage } from './pages/customers'
import { DesignSystemPage } from './pages/DesignSystemPage'
import { EngineCheckPage } from './pages/EngineCheckPage'
import { LedgerPage } from './pages/ledger'
import { BusinessProfilePage, ComingSoonPage, HelpPage, MorePage, SettingsPage } from './pages/more'
import { TodayPage } from './pages/today'
import { TripDetailPage, TripsPage } from './pages/trips'
import './styles/index.css'

const PeoplePage = lazy(() => import('./pages/people'))

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <ToastProvider>
          <SessionProvider>
            <Routes>
              <Route
                element={
                  <AuthGate>
                    <AppShell />
                  </AuthGate>
                }
              >
                <Route index element={<TodayPage />} />
                <Route path="trip" element={<TripsPage />} />
                <Route path="trip/:tripId" element={<TripDetailPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:customerId" element={<CustomerDetailPage />} />
                <Route path="customers/:customerId/bill" element={<BillPage />} />
                <Route path="ledger" element={<LedgerPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="more/profile" element={<BusinessProfilePage />} />
                <Route path="more/settings" element={<SettingsPage />} />
                <Route
                  path="more/people"
                  element={
                    <Suspense>
                      <PeoplePage />
                    </Suspense>
                  }
                />
                <Route path="more/help" element={<HelpPage />} />
                <Route path="more/design" element={<DesignSystemPage />} />
                <Route path="more/engine-check" element={<EngineCheckPage />} />
                <Route path="more/:section" element={<ComingSoonPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </SessionProvider>
        </ToastProvider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
