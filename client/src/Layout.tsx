import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { BrandLogo } from "./BrandLogo";
import { MessagesProvider, useMessages } from "./messages";
import { NotificationsProvider, useNotifications } from "./notifications";
import { OrgVbsBar, OrgVbsProvider } from "./org-vbs";
import { OrgProvider, orgPath, useOrgs } from "./orgs";
import type { Organization } from "./types";

const RAIL_KEY = "vbs.railCollapsed";

function Shell() {
  const { user, loading, logout } = useAuth();
  const { unreadCount } = useMessages();
  const { notifications, unread, markRead, markAllRead } = useNotifications();
  const { organizations, tenantId } = useOrgs();
  const location = useLocation();
  const [showNotices, setShowNotices] = useState(false);
  const [publicOpen, setPublicOpen] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(tenantId);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(RAIL_KEY) === "1");

  useEffect(() => {
    if (tenantId) {
      setExpandedOrg(tenantId);
    }
  }, [tenantId]);

  function toggleRail() {
    setCollapsed((open) => {
      const next = !open;
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleOrg(id: string) {
    if (collapsed) {
      setExpandedOrg(id);
      setCollapsed(false);
      localStorage.setItem(RAIL_KEY, "0");
      return;
    }
    setExpandedOrg((current) => (current === id ? null : id));
  }

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

  const showPublicLinks = collapsed || publicOpen;
  const userInitial = (user.username[0] ?? "?").toUpperCase();

  return (
    <div className={collapsed ? "shell rail-collapsed" : "shell"}>
      <aside className={collapsed ? "sidenav collapsed" : "sidenav"}>
        <div className="sidenav-top">
          <NavLink to="/" className="brand-lockup" end title="VBS Resources">
            <BrandLogo />
            {collapsed ? null : <span className="brand-wordmark">VBS Resources</span>}
          </NavLink>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleRail}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <Icon path={collapsed ? ICONS.chevronRight : ICONS.chevronLeft} />
          </button>
        </div>

        <div className="nav-scroll">
          <div className="nav-section">
            {collapsed ? null : (
              <button
                type="button"
                className="nav-toggle"
                aria-expanded={publicOpen}
                aria-controls="public-links"
                onClick={() => setPublicOpen((open) => !open)}
              >
                Public
                <Icon path={publicOpen ? ICONS.chevronDown : ICONS.chevronRight} />
              </button>
            )}
            {showPublicLinks ? (
              <nav id="public-links" aria-label="Public">
                <RailLink to="/about" icon={ICONS.info} label="About" collapsed={collapsed} />
                <RailLink
                  to="/reviews"
                  icon={ICONS.reviews}
                  label="Curriculum Reviews"
                  collapsed={collapsed}
                />
                <RailLink
                  to="/share"
                  icon={ICONS.share}
                  label="Share VBS Resources"
                  collapsed={collapsed}
                />
                <RailLink
                  to="/setup"
                  icon={ICONS.setup}
                  label="Show Your Setup"
                  collapsed={collapsed}
                />
                <RailLink
                  to="/messages"
                  icon={ICONS.message}
                  label="Direct Message"
                  collapsed={collapsed}
                />
              </nav>
            ) : null}
          </div>

          {organizations.length > 0 ? (
            <nav className="org-nav" aria-label="Organizations">
              {collapsed ? null : <p className="menu-label">Organizations</p>}
              {organizations.map((org) => (
                <OrgGroup
                  key={org.id}
                  org={org}
                  expanded={expandedOrg === org.id}
                  collapsed={collapsed}
                  onToggle={() => toggleOrg(org.id)}
                />
              ))}
            </nav>
          ) : null}

          <Link to="/org/new" className="create-org" title="Create Organization">
            <Icon path={ICONS.plus} />
            {collapsed ? null : <span>Create Organization</span>}
          </Link>
        </div>

        <div className="session">
          <Link
            to="/profile"
            className="session-user"
            title="Notification profile"
          >
            <span className={user.verified ? "user-avatar verified" : "user-avatar"} aria-hidden="true">
              {userInitial}
            </span>
            {collapsed ? null : <span className="session-email">{user.username}</span>}
          </Link>
          <button type="button" className="ghost sign-out" onClick={() => void logout()} title="Sign out">
            <Icon path={ICONS.signOut} />
            {collapsed ? null : <span>Sign out</span>}
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
                  d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7.7-6.1V11a7.7 7.7 0 0 0-6.2-7.5V2.8a1.5 1.5 0 1 0-3 0v.7A7.7 7.7 0 0 0 4.3 11v4.9L2.5 18v1.1h19V18l-1.8-2.1Z"
                />
              </svg>
              {unread > 0 ? <span className="bell-count">{unread}</span> : null}
            </button>
            {showNotices ? (
              <div className="notice-panel">
                {unread > 0 ? (
                  <button
                    type="button"
                    className="ghost notice-mark-all"
                    onClick={() => void markAllRead()}
                  >
                    Mark all read
                  </button>
                ) : null}
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
                d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17H8l-4 3V6.5Z"
              />
            </svg>
            {unreadCount > 0 ? <span className="bell-count">{unreadCount}</span> : null}
          </Link>
        </header>
        <OrgVbsBar />
        <Outlet />
      </main>
    </div>
  );
}

function OrgGroup({
  org,
  expanded,
  collapsed,
  onToggle,
}: {
  org: Organization;
  expanded: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const showChildren = expanded && !collapsed;

  return (
    <div className={expanded ? "org-group open" : "org-group"}>
      <button
        type="button"
        className={expanded ? "org-heading active" : "org-heading"}
        aria-expanded={expanded}
        title={org.name}
        onClick={onToggle}
      >
        <span className="org-avatar" aria-hidden="true">
          {orgInitials(org.name)}
        </span>
        {collapsed ? null : (
          <>
            <span className="org-heading-text">{org.name}</span>
            <Icon path={expanded ? ICONS.chevronDown : ICONS.chevronRight} />
          </>
        )}
      </button>
      {showChildren ? (
        <div className="org-links">
          <RailLink
            to={`/org/${org.id}/vbs-plan`}
            icon={ICONS.calendar}
            label="VBS Plan"
            collapsed={false}
          />
          <RailLink
            to={`/org/${org.id}/registration`}
            icon={ICONS.users}
            label="Registration"
            collapsed={false}
          />
          <RailLink
            to={`/org/${org.id}/cooking-plan`}
            icon={ICONS.food}
            label="Cooking Plan"
            collapsed={false}
          />
          <RailLink
            to={`/org/${org.id}/room-design`}
            icon={ICONS.sparkle}
            label="Room Design"
            collapsed={false}
          />
          <RailLink
            to={`/org/${org.id}/photoshoppe-lite`}
            icon={ICONS.edit}
            label="Photoshoppe Lite"
            collapsed={false}
          />
          {org.role === "org_admin" || org.role === "org_team_admin" ? (
            <RailLink
              to={`/org/${org.id}/contact`}
              icon={ICONS.contact}
              label="Contact org & teams"
              collapsed={false}
            />
          ) : null}
          {org.role === "org_admin" || org.role === "registration_admin" ? (
            <RailLink
              to={`/org/${org.id}/manage`}
              icon={ICONS.settings}
              label="Manage Org"
              collapsed={false}
            />
          ) : null}
          {org.role === "org_admin" ? (
            <RailLink
              to={`/org/${org.id}/teams`}
              icon={ICONS.users}
              label="Manage Teams"
              collapsed={false}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RailLink({
  to,
  icon,
  label,
  collapsed,
}: {
  to: string;
  icon: string;
  label: string;
  collapsed: boolean;
}) {
  return (
    <NavLink to={to} className="nav-item" title={label}>
      <Icon path={icon} />
      {collapsed ? null : <span className="nav-label">{label}</span>}
    </NavLink>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg className="nav-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

function orgInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const ICONS = {
  info: "M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
  reviews:
    "M18 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V4a2 2 0 0 0-2-2zm-1 13H7v-2h10zm0-4H7V9h10z",
  share:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.01 3.01 0 0 0 0-1.4l7.05-4.11A2.99 2.99 0 1 0 14 5c0 .18.03.34.05.5L7 9.61a3 3 0 1 0 0 4.78l7.05 4.11c-.02.16-.05.32-.05.5a3 3 0 1 0 4-2.92z",
  setup:
    "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  message:
    "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 12H6v-2h12zm0-3H6V9h12zm0-3H6V6h12z",
  calendar:
    "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM7 12h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z",
  food:
    "M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.19zm6.78-1.81a11.044 11.044 0 0 1-2.66 6.05l1.42 1.42c1.17-1.88 1.9-4.02 2.09-6.29h-2.85v-1.18zM20 2H4c-1.1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.55 0 1-.45 1-1v-1h-6.34C16.93 20.06 14.5 18 12 18s-4.93 2.06-5.66 4.5H4v-9.81C4.57 12.34 5 11.72 5 11.01V4h15v3h2V4c0-1.1-.9-2-2-2z",
  sparkle:
    "M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zm7 10 1 2.7L23 16l-3 1.1L19 20l-1-2.9L15 16l2.9-1.1L19 12zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z",
  edit:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  contact:
    "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z",
  settings:
    "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.14.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.8 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.92 14.5a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.7.22l2.39-.96c.5.41 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.53 1.63-.94l2.39.96c.27.11.56.02.7-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z",
  users:
    "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  signOut:
    "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
  chevronLeft: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  chevronRight: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  chevronDown: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z",
};

export default function Layout() {
  return (
    <OrgProvider>
      <OrgVbsProvider>
        <MessagesProvider>
          <NotificationsProvider>
            <Shell />
          </NotificationsProvider>
        </MessagesProvider>
      </OrgVbsProvider>
    </OrgProvider>
  );
}
