import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { AppNotification } from "./types";

type NotificationsContextValue = {
  notifications: AppNotification[];
  unread: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      return;
    }
    const data = await api.notifications();
    setNotifications(data.notifications);
    setUnread(data.unread);
  }, [user]);

  useEffect(() => {
    void refresh().catch(() => {
      setNotifications([]);
      setUnread(0);
    });
    if (!user) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refresh, user]);

  const markRead = useCallback(
    async (id: string) => {
      await api.readNotification(id);
      await refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    await api.readAllNotifications();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ notifications, unread, refresh, markRead, markAllRead }),
    [notifications, unread, refresh, markRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
}
