'use client';
import { useToast } from '../components/ui/ToastContext';

// Compatibility shim — the verification flow used a private toast stack.
// All feedback now flows through the single global ToastProvider (mounted in
// App.jsx), so this hook just forwards calls there. `toasts` is always empty
// because the provider owns the visible stack.
export const useToasts = () => {
  const push = useToast();
  return {
    toasts: [],
    pushToast: (message, type = 'success') => push(message, type === 'error' ? 'error' : 'success'),
  };
};
