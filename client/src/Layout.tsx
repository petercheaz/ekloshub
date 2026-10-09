import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { BrandLogo } from "./BrandLogo";
import { MessagesProvider, useMessages } from "./messages";
import { NotificationsProvider, useNotifications } from "./notifications";
import { OrgProvider, orgPath, useOrgs } from "./orgs";

function Shell() {
  const { user, loading, logout } = useAuth();
  const { unreadCount } = useMessages();
  const { notifications, unread, markRead } = useNotifications();
  const { organizations, tenantId } = useOrgs();
  const location = useLocation();
  const [showNotices, setShowNotices] = useState(false);

  if (loading) {
    return (
      <div className="shell">
        <p className="status">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="shell">
      <aside className="sidenav">
        <NavLink to="/" className="brand-lockup" end>
          <BrandLogo />
          <span className="brand-wordmark">VBS Resources</span>
        </NavLink>
        <p className="menu-label">Menu</p>
        <nav aria-label="Main">
          <NavLink to="/about" className={({ isActive }) => (isActive ? "active" : "")}>
            About
          </NavLink>
          <NavLink to="/reviews" className={({ isActive }) => (isActive ? "active" : "")}>
            Curriculum Reviews
          </NavLink>
          <NavLink to="/share" className={({ isActive }) => (isActive ? "active" : "")}>
            Share VBS Resources
          </NavLink>
          <NavLink to="/setup" className={({ isActive }) => (isActive ? "active" : "")}>
            Show Your Setup
          </NavLink>
          <NavLink to="/messages" className={({ isActive }) => (isActive ? "active" : "")}>
            Direct Message
          </NavLink>
        </nav>
        <Link to="/org/new" className="create-org">
          Create Organization
        </Link>
        {organizations.length > 0 ? (
          <nav className="org-nav" aria-label="Organizations">
            {organizations.map((org) => (
              <div key={org.id} className="org-group">
                <p className="org-heading">{org.name}</p>
                <NavLink to={`/org/${org.id}/room-ideas`}>Room Ideas</NavLink>
                {org.role === "org_admin" ? (
                  <>
                    <NavLink to={`/org/${org.id}/manage`}>Manage Org</NavLink>
                    <NavLink to={`/org/${org.id}/teams`}>Manage Teams</NavLink>
                  </>
                ) : null}
              </div>
            ))}
          </nav>
        ) : null}
        <div className="session">
          <span>
            {user.username}
            {user.verified ? <span className="badge">Verified</span> : null}
          </span>
          <button type="button" className="ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="content-top">
          <div className="notice-wrap">
            <button
              type="button"
              className="bell"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              onClick={() => setShowNotices((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17H8l-4 3V6.5Z"
                />
              </svg>
              {unread > 0 ? <span className="bell-count">{unread}</span> : null}
            </button>
            {showNotices ? (
              <div className="notice-panel">
                {notifications.length === 0 ? <p className="muted">No notifications</p> : null}
                {notifications.map((item) => (
                  <Link
                    key={item.id}
                    to={item.link || "/"}
                    className={item.read ? "notice-item" : "notice-item unread"}
                    onClick={() => {
                      setShowNotices(false);
                      if (!item.read) {
                        void markRead(item.id);
                      }
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            to={orgPath(tenantId, "/messages")}
            className="bell"
            aria-label={
              unreadCount > 0 ? `Direct messages, ${unreadCount} unread` : "Direct messages"
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7.7-6.1V11a7.7 7.7 0 0 0-6.2-7.5V2.8a1.5 1.5 0 1 0-3 0v.7A7.7 7.7 0 0 0 4.3 11v4.9L2.5 18v1.1h19V18l-1.8-2.1Z"
              />
            </svg>
            {unreadCount > 0 ? <span className="bell-count">{unreadCount}</span> : null}
          </Link>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

export default function Layout() {
  return (
    <OrgProvider>
      <MessagesProvider>
        <NotificationsProvider>
          <Shell />
        </NotificationsProvider>
      </MessagesProvider>
    </OrgProvider>
  );
}
