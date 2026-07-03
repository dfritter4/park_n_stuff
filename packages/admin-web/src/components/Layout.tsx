import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { IconAnalytics, IconCustomers, IconDashboard, IconLogout, IconLots, IconReservations } from './icons';

export function Layout() {
  const { email, logout } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">P</span>
          Park N Stuff
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconDashboard />
            Dashboard
          </NavLink>
          <NavLink to="/lots" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconLots />
            Lots
          </NavLink>
          <NavLink to="/reservations" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconReservations />
            Reservations
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconCustomers />
            Customers
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconAnalytics />
            Analytics
          </NavLink>
        </nav>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-email">{email}</span>
          <button type="button" onClick={logout} className="logout-button">
            <IconLogout />
            Logout
          </button>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
