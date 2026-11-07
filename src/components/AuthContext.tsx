import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import type { User } from '../lib/types.ts';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const result = await api<{ user: User | null }>('/auth/me');
      setUser(result.user);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch(() => setLoading(false));
  }, []);

  return <AuthContext.Provider value={{ user, loading, setUser, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}