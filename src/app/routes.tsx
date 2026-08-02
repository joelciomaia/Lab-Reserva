import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useGoogleSheets } from '../integrations/google/GoogleSheetsProvider';
import { BookingPage } from '../pages/BookingPage';
import { GoogleLoginPage } from '../pages/GoogleLoginPage';
import { LandingPage } from '../pages/LandingPage';
import { ManagerPage } from '../pages/ManagerPage';
import { WeeklySchedulePage } from '../pages/WeeklySchedulePage';
import { hasPublicAgendaContext } from './publicAgendaContext';

function RootPage() {
  const location = useLocation();
  const opensPublicAgenda = hasPublicAgendaContext(location.search, window.location.search);
  return opensPublicAgenda ? <WeeklySchedulePage /> : <LandingPage />;
}

function ProtectedManagerPage() {
  const location = useLocation();
  const { isAuthorized } = useGoogleSheets();

  if (!isAuthorized) {
    return (
      <Navigate
        to="/gerenciar/entrar"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <ManagerPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootPage />} />
      <Route path="/agendar" element={<BookingPage />} />
      <Route path="/gerenciar" element={<Navigate to="/gerenciar/geral" replace />} />
      <Route path="/gerenciar/entrar" element={<GoogleLoginPage />} />
      <Route path="/gerenciar/:section" element={<ProtectedManagerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
