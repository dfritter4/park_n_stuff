import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './pages/HomePage';
import { LotDetailPage } from './pages/LotDetailPage';
import { ReservePage } from './pages/ReservePage';
import { PaymentPage } from './pages/PaymentPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ReservationDraftProvider } from './lib/reservationDraft';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ReservationDraftProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/lots/:id" element={<LotDetailPage />} />
            <Route path="/lots/:id/reserve" element={<ReservePage />} />
            <Route path="/lots/:id/pay" element={<PaymentPage />} />
            <Route path="/confirmation/:reservationId" element={<ConfirmationPage />} />
          </Routes>
        </BrowserRouter>
      </ReservationDraftProvider>
    </QueryClientProvider>
  );
}
