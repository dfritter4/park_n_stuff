import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { email, logout } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">Park N Stuff</div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/lots" className={({ isActive }) => (isActive ? 'active' : '')}>
            Lots
          </NavLink>
          <NavLink to="/reservations" className={({ isActive }) => (isActive ? 'active' : '')}>
            Reservations
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => (isActive ? 'active' : '')}>
            Customers
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
            Analytics
          </NavLink>
        </nav>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-email">{email}</span>
          <button type="button" onClick={logout} className="logout-button">
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
