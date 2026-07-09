import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Check, 
  XCircle, 
  AlertCircle,
  Info,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  UploadCloud,
  Loader2,
  CheckCircle,
  RefreshCw,
  Play
} from 'lucide-react';
import { Invoice } from './Dashboard';
import { ToastType } from './Toast';

interface VerificationPageProps {
  invoiceIds: string[];
  initialIndex: number;
  onBack: () => void;
  showToast: (message: string, type: ToastType) => void;
}

interface FormFields {
  supplier_name: string;
  supplier_pan: string;
  bill_number: string;
  miti_bs: string;
  taxable_amount: string;
  non_taxable_amount: string;
}

interface FormErrors {
  supplier_name?: string;
  supplier_pan?: string;
  bill_number?: string;
  miti_bs?: string;
  taxable_amount?: string;
  non_taxable_amount?: string;
}

interface FieldConfig {
  key: keyof FormFields;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  monospace?: boolean;
  gridSpan?: 'full' | 'half';
  validation: (val: string) => string | undefined;
}

export const VerificationPage: React.FC<VerificationPageProps> = ({ 
  invoiceIds, 
  initialIndex, 
  onBack, 
  showToast 
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  
  // Mobile responsiveness tab
  const [activeMobileTab, setActiveMobileTab] = useState<'document' | 'form'>('document');

  // Form State
  const [formData, setFormData] = useState<FormFields>({
    supplier_name: '',
    supplier_pan: '',
    bill_number: '',
    miti_bs: '',
    taxable_amount: '',
    non_taxable_amount: '0'
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Image Viewer Interactive State
  const [zoom, setZoom] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // File Upload State
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);

  const activeInvoiceId = invoiceIds[currentIndex];

  // Dynamic modular form configuration
  const formFieldsConfig: FieldConfig[] = [
    {
      key: 'supplier_name',
      label: 'Supplier Name',
      type: 'text',
      placeholder: 'Supplier Company Name',
      gridSpan: 'full',
      validation: (val) => (!val || val.trim() === '' ? 'Supplier Name is required.' : undefined)
    },
    {
      key: 'supplier_pan',
      label: 'Supplier PAN',
      type: 'text',
      placeholder: '9-digit PAN number',
      monospace: true,
      gridSpan: 'full',
      validation: (val) => (!val || !/^\d+$/.test(val) ? 'PAN must contain only digits.' : undefined)
    },
    {
      key: 'bill_number',
      label: 'Bill Number',
      type: 'text',
      placeholder: 'Bill Ref Number',
      monospace: true,
      gridSpan: 'half',
      validation: (val) => {
        const num = Number(val);
        if (!val || isNaN(num) || num <= 0) {
          return 'Bill Number must be numeric and positive.';
        }
        return undefined;
      }
    },
    {
      key: 'miti_bs',
      label: 'Date in BS (Miti YYYY-MM-DD)',
      type: 'text',
      placeholder: 'YYYY-MM-DD',
      monospace: true,
      gridSpan: 'half',
      validation: (val) => (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val) ? 'Date format must remain YYYY-MM-DD.' : undefined)
    },
    {
      key: 'taxable_amount',
      label: 'Taxable Amount (Rs.)',
      type: 'text',
      placeholder: '0.00',
      monospace: true,
      gridSpan: 'full',
      validation: (val) => {
        const num = Number(val);
        if (isNaN(num) || num < 0) {
          return 'Taxable Amount must be positive.';
        }
        return undefined;
      }
    },
    {
      key: 'non_taxable_amount',
      label: 'Non-Taxable Amount (Rs.)',
      type: 'text',
      placeholder: '0.00',
      monospace: true,
      gridSpan: 'full',
      validation: (val) => {
        if (!val) return undefined;
        const num = Number(val);
        if (isNaN(num) || num < 0) {
          return 'Non-Taxable Amount must be positive.';
        }
        return undefined;
      }
    }
  ];

  // Fetch invoice details based on active ID
  const fetchInvoiceDetails = async () => {
    if (!activeInvoiceId) return;
    try {
      setLoading(true);
      const res = await axios.get(`/api/invoices/${activeInvoiceId}`);
      const data = res.data;
      setInvoice(data);
      setFormData({
        supplier_name: data.supplier_name,
        supplier_pan: data.supplier_pan,
        bill_number: String(data.bill_number),
        miti_bs: data.miti_bs,
        taxable_amount: String(data.taxable_amount),
        non_taxable_amount: String(data.non_taxable_amount || '0')
      });
      setIsDirty(false);
      setErrors({});
      // Reset image viewer state when loading new invoice
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
    } catch (e: any) {
      console.error(e);
      showToast('Error loading invoice details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoiceDetails();
  }, [currentIndex, activeInvoiceId]);

  // Silent polling when automation is running
  useEffect(() => {
    if (invoice && invoice.status === 'Automation Running') {
      const interval = setInterval(() => {
        axios.get(`/api/invoices/${activeInvoiceId}`)
          .then(res => {
            setInvoice(res.data);
          })
          .catch(err => console.error('Silent detail poll failed:', err));
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [invoice, activeInvoiceId]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch (e) {
      return dateString;
    }
  };

  const handleStartSync = async () => {
    if (!invoice) return;
    try {
      setSubmitting(true);
      showToast('Starting ERP automation sync...', 'info');
      const savedUrl = localStorage.getItem('khatacloud_entry_url') || undefined;
      await axios.post('/api/automation/start', { 
        invoiceIds: [invoice.id],
        entryUrl: savedUrl
      });
      showToast('ERP sync started successfully.', 'success');
      const res = await axios.get(`/api/invoices/${invoice.id}`);
      setInvoice(res.data);
    } catch (e: any) {
      console.error(e);
      showToast(e.response?.data?.error || 'Failed to start ERP sync.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Form Validation
  const validateForm = (data: FormFields): boolean => {
    const tempErrors: FormErrors = {};
    let isValid = true;

    formFieldsConfig.forEach((field) => {
      const errorMsg = field.validation(data[field.key]);
      if (errorMsg) {
        tempErrors[field.key] = errorMsg;
        isValid = false;
      }
    });

    const tAmt = Number(data.taxable_amount) || 0;
    const ntAmt = Number(data.non_taxable_amount) || 0;
    if (tAmt === 0 && ntAmt === 0) {
      tempErrors.taxable_amount = 'Either Taxable or Non-Taxable Amount must be positive.';
      tempErrors.non_taxable_amount = 'Either Taxable or Non-Taxable Amount must be positive.';
      isValid = false;
    }

    setErrors(tempErrors);
    return isValid;
  };

  const handleInputChange = (field: keyof FormFields, value: string) => {
    const nextFields = { ...formData, [field]: value };
    setFormData(nextFields);
    setIsDirty(true);
    // Realtime error check
    validateForm(nextFields);
  };

  // Warning guard for leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Navigate to Next / Previous
  const navigateIndex = (direction: 'next' | 'prev') => {
    if (isDirty) {
      const confirmDiscard = window.confirm('You have unsaved changes. Discard changes and navigate?');
      if (!confirmDiscard) return;
    }

    if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (direction === 'next' && currentIndex < invoiceIds.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  // Auto-advance or close when finishing verification
  const handleFinishedVerification = (toastMessage: string, toastType: ToastType) => {
    showToast(toastMessage, toastType);
    
    // Check if there are more invoices in the list
    if (currentIndex < invoiceIds.length - 1) {
      // Auto-advance to the next one
      setCurrentIndex(prev => prev + 1);
    } else {
      // If it was the last invoice, go back to dashboard
      setTimeout(() => {
        onBack();
      }, 800);
    }
  };

  // Save Draft (Updates database, stays on page)
  const handleSaveDraft = async () => {
    if (!invoice) return;
    if (!validateForm(formData)) {
      showToast('Validation failed. Please check inputs.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        bill_number: parseInt(formData.bill_number, 10),
        taxable_amount: parseFloat(formData.taxable_amount || '0'),
        non_taxable_amount: parseFloat(formData.non_taxable_amount || '0'),
        status: invoice.status,
        image_path: invoice.image_path
      };
      const res = await axios.put(`/api/invoices/${invoice.id}`, payload);
      setInvoice(res.data);
      setIsDirty(false);
      showToast('Draft saved successfully to database.', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.response?.data?.error || 'Failed to save draft.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm and Verify (updates DB status and triggers n8n webhook)
  const handleConfirm = async () => {
    if (!invoice) return;
    if (!validateForm(formData)) {
      showToast('Validation failed. Please check inputs.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        id: invoice.id,
        supplier_name: formData.supplier_name,
        supplier_pan: formData.supplier_pan,
        bill_number: parseInt(formData.bill_number, 10),
        miti_bs: formData.miti_bs,
        taxable_amount: parseFloat(formData.taxable_amount || '0'),
        non_taxable_amount: parseFloat(formData.non_taxable_amount || '0')
      };

      const res = await axios.post('/api/confirm', payload);
      setIsDirty(false);
      
      const successMessage = res.data.n8nNotificationSent 
        ? 'Invoice confirmed and details sent back to n8n webhook!'
        : 'Invoice verified, but n8n response webhook could not be reached.';
        
      handleFinishedVerification(successMessage, res.data.n8nNotificationSent ? 'success' : 'warning');
    } catch (e: any) {
      console.error(e);
      showToast(e.response?.data?.error || 'Failed to confirm invoice.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Reject (updates DB status)
  const handleReject = async () => {
    if (!invoice) return;
    const confirmReject = window.confirm('Are you sure you want to REJECT this invoice?');
    if (!confirmReject) return;

    try {
      setSubmitting(true);
      await axios.post('/api/reject', { id: invoice.id });
      setIsDirty(false);
      handleFinishedVerification('Invoice marked as Rejected.', 'info');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to reject invoice.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA'
      );

      // Escape -> Go Back
      if (e.key === 'Escape') {
        e.preventDefault();
        handleBackRequest();
      }
      
      // Ctrl + S -> Save Draft
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveDraft();
      }

      // Ctrl + Enter -> Confirm & Verify
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }

      // Arrow Left / Right -> Previous / Next (only if not typing in an input field)
      if (!isInputActive) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateIndex('prev');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateIndex('next');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [formData, invoice, isDirty, currentIndex, invoiceIds]);

  const handleBackRequest = () => {
    if (isDirty) {
      const leave = window.confirm('You have unsaved changes. Go back to Dashboard?');
      if (!leave) return;
    }
    onBack();
  };

  // Pointer Zoom and Pan Events
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 0.1;
    let nextZoom = zoom + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
    nextZoom = Math.max(0.5, Math.min(5, nextZoom));
    setZoom(nextZoom);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left mouse button only
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Drag and Drop File Upload
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await uploadInvoiceImage(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await uploadInvoiceImage(file);
    }
  };

  const uploadInvoiceImage = async (file: File) => {
    if (!invoice) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Invalid file type. Only JPEG, PNG, and PDF are allowed.', 'error');
      return;
    }

    try {
      setUploadingFile(true);
      const data = new FormData();
      data.append('image', file);

      const res = await axios.post(`/api/invoices/${invoice.id}/upload-image`, data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setInvoice(res.data.invoice);
      showToast('Image uploaded successfully!', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.response?.data?.error || 'Failed to upload image.', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Fetching invoice details...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Invoice Not Found</h2>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl shadow hover:bg-brand-dark transition-all mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const imageUrl = invoice.image_path ? `/${invoice.image_path}` : null;
  const isPdf = invoice.image_path ? invoice.image_path.toLowerCase().endsWith('.pdf') : false;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300 overflow-hidden">
      
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 bg-white/70 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/70 py-3.5 px-6 md:px-12 flex justify-between items-center transition-colors">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleBackRequest}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all active:scale-95"
            title="Back to Dashboard (Esc)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">AI Verification</h2>
            <h1 className="text-base font-bold font-sans tracking-tight truncate max-w-[200px] sm:max-w-xs mt-0.5">{invoice.supplier_name}</h1>
          </div>
        </div>

        {/* Sequential Navigation Controls */}
        <div className="flex items-center gap-4">
          <div className="text-xs font-bold text-slate-400">
            Invoice <span className="text-slate-800 dark:text-slate-200">{currentIndex + 1}</span> of <span className="text-slate-800 dark:text-slate-200">{invoiceIds.length}</span>
          </div>
          
          <div className="flex gap-1.5">
            <button 
              onClick={() => navigateIndex('prev')}
              disabled={currentIndex === 0}
              className="p-2 rounded-lg border border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95"
              title="Previous Invoice (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => navigateIndex('next')}
              disabled={currentIndex === invoiceIds.length - 1}
              className="p-2 rounded-lg border border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95"
              title="Next Invoice (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Tab Toggle (only visible on mobile screens) */}
      <div className="flex-shrink-0 flex lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800/60">
        <button 
          onClick={() => setActiveMobileTab('document')}
          className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all ${
            activeMobileTab === 'document' 
              ? 'border-brand text-brand dark:text-brand-light' 
              : 'border-transparent text-slate-500 dark:text-slate-400'
          }`}
        >
          Invoice Document
        </button>
        <button 
          onClick={() => setActiveMobileTab('form')}
          className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all ${
            activeMobileTab === 'form' 
              ? 'border-brand text-brand dark:text-brand-light' 
              : 'border-transparent text-slate-500 dark:text-slate-400'
          }`}
        >
          Verification Form
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-73px)] lg:h-[calc(100vh-73px)] overflow-hidden relative">
        
        {/* Left Side: Document Viewer (Image / PDF / File Dropper) */}
        <div 
          className={`w-full lg:w-1/2 h-full bg-slate-200 dark:bg-slate-950 relative overflow-hidden flex flex-col transition-all duration-300 border-r border-slate-200/50 dark:border-slate-800/50 ${
            activeMobileTab === 'document' ? 'flex' : 'hidden lg:flex'
          } ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950' : ''}`}
        >
          {uploadingFile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-brand animate-spin" />
              <p className="text-xs font-semibold text-slate-400">Uploading document...</p>
            </div>
          ) : imageUrl ? (
            isPdf ? (
              // PDF View Mode
              <div className="flex-1 w-full h-full relative bg-white">
                <iframe 
                  src={imageUrl} 
                  className="w-full h-full border-0" 
                  title="Invoice PDF" 
                />
                <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-lg bg-slate-900/80 text-[10px] text-white backdrop-blur font-semibold pointer-events-none">
                  PDF Mode: Use browser tools to zoom
                </div>
              </div>
            ) : (
              // Custom Interactive Image View Mode
              <div 
                className="flex-1 w-full h-full overflow-hidden relative select-none flex items-center justify-center cursor-grab"
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ background: 'radial-gradient(circle, #334155 0%, #0f172a 100%)' }}
              >
                <div 
                  className="transition-transform duration-100 ease-out"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center'
                  }}
                >
                  <img 
                    src={imageUrl} 
                    alt="Invoice Document" 
                    className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded"
                    draggable={false}
                  />
                </div>

                {/* Grid guidelines for helper visual */}
                <div className="absolute inset-0 pointer-events-none border border-white/5 bg-transparent"></div>

                {/* Floating Image Control Bar */}
                <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-1 p-1 rounded-2xl bg-slate-900/85 text-white backdrop-blur border border-slate-800 shadow-xl">
                  <button 
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
                    className="p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-mono font-bold w-12 text-center select-none text-slate-300">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button 
                    onClick={() => setZoom(z => Math.min(5, z + 0.2))}
                    className="p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  
                  <div className="w-px h-4 bg-slate-800 mx-1"></div>

                  <button 
                    onClick={() => setRotation(r => (r - 90 + 360) % 360)}
                    className="p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    title="Rotate Counter-Clockwise"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setRotation(r => (r + 90) % 360)}
                    className="p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    title="Rotate Clockwise"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>

                  <div className="w-px h-4 bg-slate-800 mx-1"></div>

                  <button 
                    onClick={() => {
                      setZoom(1);
                      setPosition({ x: 0, y: 0 });
                      setRotation(0);
                    }}
                    className="p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    title="Reset Zoom & Pan"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button 
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Viewer'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )
          ) : (
            // Dropzone file dropper when no image exists
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex-1 flex flex-col items-center justify-center p-8 text-center transition-all ${
                isDraggingFile 
                  ? 'bg-brand/10 border-4 border-dashed border-brand' 
                  : 'bg-slate-100 dark:bg-slate-950'
              }`}
            >
              <div className="max-w-md flex flex-col items-center gap-4">
                <div className={`p-5 rounded-3xl bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-400 dark:text-slate-500 transition-transform ${
                  isDraggingFile ? 'scale-110' : ''
                }`}>
                  <UploadCloud className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">No invoice image loaded</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                    n8n did not provide an image path. Drag & drop a JPEG, PNG, or PDF here, or click to upload one manually.
                  </p>
                </div>
                <label className="cursor-pointer px-5 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-2xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 mt-2">
                  Browse Files
                  <input 
                    type="file" 
                    accept=".jpg,.jpeg,.png,.pdf" 
                    onChange={handleFileChange}
                    className="hidden" 
                  />
                </label>
              </div>
            </div>
          )}

          {/* Quick upload option overlay on left panel if imageUrl is already present */}
          {imageUrl && !isFullscreen && (
            <label className="absolute top-4 left-4 z-10 cursor-pointer p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur shadow-md hover:scale-105 transition-all text-xs font-bold flex items-center gap-1.5">
              <UploadCloud className="w-3.5 h-3.5" /> Change Document
              <input 
                type="file" 
                accept=".jpg,.jpeg,.png,.pdf" 
                onChange={handleFileChange}
                className="hidden" 
              />
            </label>
          )}
        </div>

        {/* Right Side: Verification Form */}
        <div 
          className={`w-full lg:w-1/2 h-full flex flex-col bg-white dark:bg-slate-900 relative ${
            activeMobileTab === 'form' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Scrollable inputs container */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {/* Form Title & Info */}
            <div className="flex justify-between items-start border-b border-slate-200/50 dark:border-slate-800/50 pb-5 mb-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-brand to-violet-500 bg-clip-text text-transparent">
                  Verify Extracted Fields
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-medium">Please review, make corrections, and confirm the details below.</p>
                {invoice.captured_at && (
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 font-bold flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Camera Clicked: {formatDate(invoice.captured_at)}</span>
                  </p>
                )}
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                invoice.status === 'Pending AI Extraction'
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : invoice.status === 'Pending Verification' 
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' 
                  : invoice.status === 'Verified'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : invoice.status === 'Automation Running'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 animate-pulse'
                  : invoice.status === 'Completed'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  invoice.status === 'Pending AI Extraction' 
                    ? 'bg-purple-500 animate-pulse' 
                    : invoice.status === 'Pending Verification' 
                    ? 'bg-amber-500' 
                    : invoice.status === 'Verified'
                    ? 'bg-blue-500'
                    : invoice.status === 'Automation Running'
                    ? 'bg-indigo-500 animate-spin border-t-transparent border'
                    : invoice.status === 'Completed'
                    ? 'bg-emerald-500' 
                    : 'bg-rose-500'
                }`}></span>
                {invoice.status === 'Pending AI Extraction' 
                  ? 'AI Processing' 
                  : invoice.status === 'Automation Running'
                  ? 'ERP Syncing'
                  : invoice.status === 'Completed'
                  ? 'ERP Synced'
                  : invoice.status === 'Failed'
                  ? 'ERP Failed'
                  : invoice.status}
              </span>
            </div>

            {invoice.status === 'Pending AI Extraction' && (
              <div className="flex items-center gap-3 p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-xs text-purple-600 dark:text-purple-400 font-semibold mb-6">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500 flex-shrink-0" />
                <span>
                  <strong>AI Extraction in Progress:</strong> n8n is currently extracting details from this invoice using Gemini. Feel free to wait or enter the fields manually below.
                </span>
              </div>
            )}

            {invoice.status === 'Automation Running' && (
              <div className="flex flex-col gap-2 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-xs text-indigo-600 dark:text-indigo-400 mb-6">
                <div className="flex items-center gap-2 font-bold">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
                  <span>ERP Syncing in Progress...</span>
                </div>
                <p className="mt-0.5 opacity-90">Playwright is entering details into the taxpayer portal. Logs are updated in real-time.</p>
                {invoice.automation_log && (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Live Sync Logs</p>
                    <pre className="opacity-95 font-mono text-[10px] bg-slate-950 p-2.5 rounded-lg border border-indigo-500/10 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {invoice.automation_log}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {invoice.status === 'Completed' && (
              <div className="flex flex-col gap-2.5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-600 dark:text-emerald-400 mb-6">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>ERP Entry Succeeded</span>
                </div>
                <p className="mt-0.5">This invoice has been successfully entered into the accounting ERP.</p>
                <div className="grid grid-cols-2 gap-2 mt-1 p-2 bg-emerald-500/5 rounded-lg border border-emerald-500/10 font-mono text-[10px]">
                  <div>Started: {formatDate(invoice.automation_started_at)}</div>
                  <div>Finished: {formatDate(invoice.automation_finished_at)}</div>
                </div>
                {invoice.automation_log && (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Sync Execution Logs</p>
                    <pre className="opacity-90 font-mono text-[10px] bg-slate-950 p-2.5 rounded-lg border border-emerald-500/10 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {invoice.automation_log}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {invoice.status === 'Failed' && (
              <div className="flex flex-col gap-1.5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-600 dark:text-rose-400 mb-6">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 animate-pulse" />
                  <span>ERP Automation Sync Failed</span>
                </div>
                {invoice.automation_error && (
                  <p className="mt-1 font-bold">Error: {invoice.automation_error}</p>
                )}
                <div className="grid grid-cols-2 gap-2 mt-1 p-2 bg-rose-500/5 rounded-lg border border-rose-500/10 font-mono text-[10px]">
                  <div>Started: {formatDate(invoice.automation_started_at)}</div>
                  <div>Finished: {formatDate(invoice.automation_finished_at)}</div>
                </div>
                {invoice.automation_log && (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Sync Execution Logs</p>
                    <pre className="opacity-90 font-mono text-[10px] bg-slate-950 p-2.5 rounded-lg border border-rose-500/10 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {invoice.automation_log}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Configurable Form Fields */}
            <form className="grid grid-cols-1 md:grid-cols-2 gap-5" onSubmit={(e) => e.preventDefault()}>
              {formFieldsConfig.map((field) => {
                const isMonospace = field.monospace;
                const error = errors[field.key];
                const colSpanClass = field.gridSpan === 'full' ? 'md:col-span-2' : '';
                const isAmountField = field.key === 'taxable_amount' || field.key === 'non_taxable_amount';
                const isSupplierName = field.key === 'supplier_name';

                return (
                  <div key={field.key} className={`flex flex-col gap-1.5 ${colSpanClass}`}>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      {field.label}
                    </label>
                    <div className="relative">
                      {isAmountField && (
                        <span className="absolute inset-y-0 left-0 pl-4.5 flex items-center text-slate-400 dark:text-slate-500 font-bold text-base pointer-events-none">Rs.</span>
                      )}
                      <input 
                        type="text" 
                        value={formData[field.key]} 
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        disabled={submitting || invoice.status === 'Completed' || invoice.status === 'Automation Running'}
                        className={`w-full px-4.5 py-3 bg-slate-50/50 dark:bg-slate-950/50 hover:bg-slate-100/30 focus:bg-white dark:focus:bg-slate-950 rounded-xl border text-sm font-bold transition-all focus:outline-none ${
                          isMonospace ? 'font-mono' : ''
                        } ${
                          isSupplierName ? 'text-base font-bold tracking-tight' : ''
                        } ${
                          isAmountField ? 'pl-12 text-lg text-indigo-600 dark:text-indigo-400' : ''
                        } ${
                          error ? 'border-rose-500' : 'border-slate-200/80 dark:border-slate-800/80 focus:border-brand/40 dark:focus:border-brand/40'
                        }`}
                        placeholder={field.placeholder}
                      />
                    </div>
                    {field.key === 'non_taxable_amount' && 
                      (!isNaN(Number(formData.taxable_amount)) && Number(formData.taxable_amount) > 0 || 
                       !isNaN(Number(formData.non_taxable_amount)) && Number(formData.non_taxable_amount) > 0) && (
                      <div className="mt-2 grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/80 rounded-xl md:col-span-2">
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">13% VAT (Auto)</div>
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono mt-0.5">
                            Rs. {((Number(formData.taxable_amount) || 0) * 0.13).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Grand Total (Auto)</div>
                          <div className="text-xs font-bold text-brand dark:text-brand-light font-mono mt-0.5">
                            Rs. {(((Number(formData.taxable_amount) || 0) * 1.13) + (Number(formData.non_taxable_amount) || 0)).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    )}
                    {error && (
                      <p className="text-[11px] text-rose-500 flex items-center gap-1 font-semibold leading-tight">
                        <AlertCircle className="w-3.5 h-3.5" /> {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </form>
          </div>

          {/* Sticky footer action panel */}
          <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-slate-800/50 p-5 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Save Draft */}
              <button 
                type="button" 
                onClick={handleSaveDraft}
                disabled={submitting || invoice.status === 'Completed' || invoice.status === 'Automation Running'}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800/50 focus:outline-none transition-all disabled:opacity-50 active:scale-98 text-xs"
              >
                <Save className="w-3.5 h-3.5" /> Save Draft
              </button>

              {/* Reject */}
              <button 
                type="button" 
                onClick={handleReject}
                disabled={submitting || invoice.status === 'Completed' || invoice.status === 'Automation Running'}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-500/20 text-rose-600 bg-rose-50/20 hover:bg-rose-100/30 dark:text-rose-400 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 font-bold focus:outline-none transition-all disabled:opacity-50 active:scale-98 text-xs"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject Invoice
              </button>
            </div>

            {/* Action Trigger Button */}
            {invoice.status === 'Pending AI Extraction' ? (
              <button 
                type="button" 
                disabled={true}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-500/20 text-purple-400 font-bold focus:outline-none transition-all disabled:opacity-70 text-xs tracking-wide uppercase"
              >
                <Loader2 className="w-4 h-4 animate-spin" /> AI Processing...
              </button>
            ) : invoice.status === 'Pending Verification' ? (
              <button 
                type="button" 
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand hover:bg-brand-dark dark:bg-brand dark:hover:bg-brand-light text-white font-extrabold shadow-md hover:shadow-lg focus:outline-none transition-all disabled:opacity-50 active:scale-98 text-xs tracking-wide uppercase"
              >
                <Check className="w-4 h-4" /> Confirm & Verify Invoice
              </button>
            ) : invoice.status === 'Verified' ? (
              <button 
                type="button" 
                onClick={handleStartSync}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold shadow-md hover:shadow-lg focus:outline-none transition-all disabled:opacity-50 active:scale-98 text-xs tracking-wide uppercase"
              >
                <Play className="w-4 h-4 fill-current" /> Sync to ERP
              </button>
            ) : invoice.status === 'Automation Running' ? (
              <button 
                type="button" 
                disabled={true}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-500/20 text-indigo-400 font-bold focus:outline-none transition-all disabled:opacity-70 text-xs tracking-wide uppercase"
              >
                <Loader2 className="w-4 h-4 animate-spin" /> ERP Syncing...
              </button>
            ) : invoice.status === 'Completed' ? (
              <button 
                type="button" 
                disabled={true}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 font-extrabold focus:outline-none transition-all text-xs tracking-wide uppercase"
              >
                <CheckCircle className="w-4 h-4 text-emerald-500" /> ERP Synced Successfully
              </button>
            ) : (
              // Failed / Rejected
              <button 
                type="button" 
                onClick={handleStartSync}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold shadow-md hover:shadow-lg focus:outline-none transition-all disabled:opacity-50 active:scale-98 text-xs tracking-wide uppercase"
              >
                <RefreshCw className="w-4 h-4" /> Retry ERP Sync
              </button>
            )}

            {/* Shortcuts Guide Footer */}
            <div className="flex justify-between items-center text-[10px] text-slate-400 bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200/20 dark:border-slate-800/20 p-2.5 rounded-xl">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3 text-slate-500" /> Key Shortcuts:
              </span>
              <div className="flex gap-2">
                <span>Save: <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-bold">Ctrl+S</kbd></span>
                {invoice.status === 'Pending Verification' && (
                  <span>Verify: <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-bold">Ctrl+Enter</kbd></span>
                )}
                <span>Back: <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-bold">Esc</kbd></span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
