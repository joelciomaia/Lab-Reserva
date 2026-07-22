import { Route, Routes } from 'react-router-dom';
import { AdminPage } from '../pages/AdminPage';
import { AvailabilityPage } from '../pages/AvailabilityPage';
import { BookingPage } from '../pages/BookingPage';
import { HomePage } from '../pages/HomePage';
import { InitialSetupPage } from '../pages/InitialSetupPage';
import { MyReservationsPage } from '../pages/MyReservationsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/reservar" element={<BookingPage />} />
      <Route path="/disponibilidade" element={<AvailabilityPage />} />
      <Route path="/minhas-reservas" element={<MyReservationsPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/configuracao-inicial" element={<InitialSetupPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
