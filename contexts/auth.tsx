import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type AuthStatus = 'loading' | 'unauthenticated' | 'onboarding' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  const checkProfile = useCallback(async (sess: Session) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', sess.user.id)
      .single();
    setStatus(data?.display_name ? 'authenticated' : 'onboarding');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    await checkProfile(session);
  }, [session, checkProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      if (!sess) {
        setStatus('unauthenticated');
        return;
      }
      checkProfile(sess);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      console.log('[auth] event:', _event, 'session:', !!sess);
      setSession(sess);
      if (!sess) {
        setStatus('unauthenticated');
        return;
      }
      checkProfile(sess);
    });

    return () => subscription.unsubscribe();
  }, [checkProfile]);

  return (
    <AuthContext.Provider value={{ status, session, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
