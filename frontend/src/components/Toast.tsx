import React, { useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ id, message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 2500);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-indigo-500" />
  };

  const borderColors = {
    success: 'border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/90 dark:bg-emerald-950/20',
    error: 'border-rose-500/30 dark:border-rose-500/20 bg-rose-50/90 dark:bg-rose-950/20',
    warning: 'border-amber-500/30 dark:border-amber-500/20 bg-amber-50/90 dark:bg-amber-950/20',
    info: 'border-indigo-500/30 dark:border-indigo-500/20 bg-indigo-50/90 dark:bg-indigo-950/20'
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border glass-panel shadow-premium dark:shadow-dark-premium transition-all duration-300 translate-y-0 max-w-sm ${borderColors[type]}`}>
      <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
          {message}
        </p>
      </div>
      <button 
        onClick={() => onClose(id)}
        className="flex-shrink-0 ml-1 p-0.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => (
        <Toast 
          key={toast.id} 
          id={toast.id} 
          message={toast.message} 
          type={toast.type} 
          onClose={onClose} 
        />
      ))}
    </div>
  );
};
