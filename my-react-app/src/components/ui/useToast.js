import { useContext } from 'react';
import { ToastContext } from './toastContextDef';

export const useToast = () => useContext(ToastContext);