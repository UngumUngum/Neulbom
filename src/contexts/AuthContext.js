import { createContext, useEffect, useMemo, useState } from 'react';
import supabase from '../lib/supabase';

export const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) {
        return;
      }
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userMetadataSignature = useMemo(
    () => JSON.stringify(user?.user_metadata ?? {}),
    [user?.user_metadata],
  );

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const syncUserProfile = async () => {
      const rawName = user?.user_metadata?.name;
      const trimmedName = typeof rawName === 'string' ? rawName.trim() : '';
      const fallbackName =
        user?.email?.split('@')?.[0]?.trim() || user?.email || '이름 미정';

      const role = user?.user_metadata?.role === 'caregiver' ? 'caregiver' : 'guardian';
      const affiliationRaw = user?.user_metadata?.affiliation;
      const affiliation =
        typeof affiliationRaw === 'string' && affiliationRaw.trim().length > 0
          ? affiliationRaw.trim()
          : null;

      const payload = {
        id: user.id,
        email: user.email ?? '',
        name: trimmedName || fallbackName,
        role,
        affiliation,
      };

      const { error } = await supabase
        .from('users')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.warn('사용자 프로필 동기화 실패:', error.message);
      }
    };

    syncUserProfile();
  }, [user?.id, user?.email, userMetadataSignature]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      async signIn({ email, password }) {
        return supabase.auth.signInWithPassword({ email, password });
      },
      async signUp({ email, password, metadata }) {
        return supabase.auth.signUp({
          email,
          password,
          options: {
            data: metadata,
            emailRedirectTo: undefined,
          },
        });
      },
      async signOut() {
        return supabase.auth.signOut();
      },
    }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

