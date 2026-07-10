import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { Dashboard } from './components/Dashboard';
import { VerificationPage } from './components/VerificationPage';
import { ToastContainer, ToastType } from './components/Toast';
import { playErrorSound } from './utils/audio';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

const App: React.FC = () => {
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [selectedInvoiceIndex, setSelectedInvoiceIndex] = useState<number>(-1);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(2, 9);
    if (type === 'error') {
      playErrorSound();
    }
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const isVerifying = selectedInvoiceIndex >= 0 && selectedInvoiceIds.length > 0;

  return (
    <ThemeProvider>
      {isVerifying ? (
        <VerificationPage 
          invoiceIds={selectedInvoiceIds}
          initialIndex={selectedInvoiceIndex}
          onBack={() => setSelectedInvoiceIndex(-1)}
          showToast={showToast}
        />
      ) : (
        <Dashboard 
          onSelectInvoice={(ids, index) => {
            setSelectedInvoiceIds(ids);
            setSelectedInvoiceIndex(index);
          }}
          showToast={showToast}
        />
      )}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ThemeProvider>
  );
};

export default App;
