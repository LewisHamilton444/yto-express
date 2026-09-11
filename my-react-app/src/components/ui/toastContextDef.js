import { createContext } from 'react';

// The toast context lives in its own module (which exports no components) so
// that ToastContext.jsx can export only ToastProvider. react-refresh requires
// a component file to export components and nothing else.
export const ToastContext = createContext(() => {});