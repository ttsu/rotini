import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

type ToastType = 'success' | 'error';

interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type, id: Date.now() });
    timerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown.duration(200)}
          style={{
            position: 'absolute',
            bottom: 96,
            left: 20,
            right: 20,
            backgroundColor: toast.type === 'success' ? '#34C759' : '#FF3B30',
            borderRadius: 14,
            paddingVertical: 13,
            paddingHorizontal: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
            elevation: 10,
            zIndex: 9999,
          }}
          pointerEvents="none"
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}
