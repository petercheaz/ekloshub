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
import { useOrgs } from "./orgs";

type MessagesContextValue = {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
};

const MessagesContext = createContext<MessagesContextValue | null>(null);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tenantId } = useOrgs();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const data = await api.unreadCount();
      setUnreadCount(data.count);
    } catch {
      setUnreadCount(0);
    }
  }, [user, tenantId]);

  useEffect(() => {
    void refreshUnread();
    if (!user) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshUnread();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshUnread, user]);

  const value = useMemo(
    () => ({ unreadCount, refreshUnread }),
    [unreadCount, refreshUnread],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages() {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error("useMessages must be used within MessagesProvider");
  }
  return context;
}
