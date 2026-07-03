import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LotsPage } from './pages/LotsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { ReservationDetailPage } from './pages/ReservationDetailPage';
import { CustomersPage } from './pages/CustomersPage';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/lots" element={<LotsPage />} />
              <Route path="/reservations" element={<ReservationsPage />} />
              <Route path="/reservations/:id" element={<ReservationDetailPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
