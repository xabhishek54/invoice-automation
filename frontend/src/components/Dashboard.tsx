import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Search,
  Clock,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  FileText,
  Moon,
  Sun,
  Database,
  UploadCloud,
  Sparkles,
  Trash2,
  Check,
  Terminal,
  Play,
  AlertTriangle,
  X,
  Settings,
  Save,
  Loader2
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ToastType } from './Toast';
import { playErrorSound, playSuccessSound } from '../utils/audio';

export interface Invoice {
  id: string;
  supplier_name: string;
  supplier_pan: string;
  bill_number: number;
  miti_bs: string;
  taxable_amount: number;
  non_taxable_amount: number;
  image_path: string;
  status: string;
  automation_error?: string | null;
  automation_log?: string | null;
  automation_started_at?: string | null;
  automation_finished_at?: string | null;
  captured_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface DashboardProps {
  onSelectInvoice: (ids: string[], index: number) => void;
  showToast: (message: string, type: ToastType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectInvoice, showToast }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const activeSyncIdsRef = useRef<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [stopOnError, setStopOnError] = useState<boolean>(true);
  const [entryUrl, setEntryUrl] = useState<string>('');
  const [portalUsername, setPortalUsername] = useState<string>('');
  const [portalPassword, setPortalPassword] = useState<string>('');
  const [aiConcurrency, setAiConcurrency] = useState<string>('2');
  const [aiRateLimit, setAiRateLimit] = useState<string>('15');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const { theme, toggleTheme } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  // Automation Log Drawer State
  const [logInvoice, setLogInvoice] = useState<Invoice | null>(null);

  // Bulk Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [searchTerm, statusFilter]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

      const validFiles = files.filter(file => allowedTypes.includes(file.type));
      if (validFiles.length === 0) {
        showToast('No valid JPEG, PNG, or PDF files selected.', 'error');
        return;
      }

      try {
        setUploading(true);
        showToast(`Uploading ${validFiles.length} document(s) to queue...`, 'info');

        let lastCreatedInvoiceId: string | null = null;

        // Upload files sequentially to prevent database locking issues
        for (const file of validFiles) {
          const data = new FormData();
          data.append('image', file);

          const res = await axios.post('/api/invoices', data, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });
          lastCreatedInvoiceId = res.data.id;
        }

        showToast(`Successfully uploaded ${validFiles.length} invoice(s) to queue!`, 'success');

        // Fetch new invoices list
        const updatedListRes = await axios.get('/api/invoices');
        const updatedList = updatedListRes.data;
        setInvoices(updatedList);

        // If they uploaded exactly one file, redirect directly to verification
        if (validFiles.length === 1 && lastCreatedInvoiceId) {
          const newInvoiceIndex = updatedList.findIndex((inv: Invoice) => inv.id === lastCreatedInvoiceId);
          if (newInvoiceIndex >= 0) {
            onSelectInvoice(updatedList.map((inv: Invoice) => inv.id), newInvoiceIndex);
          }
        }
      } catch (err: any) {
        console.error(err);
        showToast(err.response?.data?.error || 'Failed to upload one or more files.', 'error');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleClearDatabase = async () => {
    const confirmClear = window.confirm("Are you sure you want to delete ALL invoices from the database? This action is permanent!");
    if (!confirmClear) return;

    try {
      setClearing(true);
      showToast('Clearing database...', 'info');
      const res = await axios.delete('/api/invoices');
      showToast(res.data.message || 'Database cleared successfully.', 'success');
      fetchInvoices();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to clear database.', 'error');
    } finally {
      setClearing(false);
    }
  };

  const handleDirectConfirm = async (invoice: Invoice) => {
    try {
      showToast('Confirming and verifying invoice...', 'info');
      await axios.post('/api/confirm', invoice);
      showToast('Invoice confirmed and verified. Ready for ERP sync!', 'success');
      fetchInvoices(true);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to verify invoice.';
      showToast(errMsg, 'error');
    }
  };

  const handleStartAutomation = async (ids: string[]) => {
    try {
      activeSyncIdsRef.current = ids;
      showToast(`Triggering ERP sync for ${ids.length} invoice(s)...`, 'info');
      const res = await axios.post('/api/automation/start', { invoiceIds: ids, stopOnError, entryUrl });
      showToast(res.data.message || 'ERP sync started successfully.', 'success');
      fetchInvoices(true);
    } catch (err: any) {
      console.error(err);
      activeSyncIdsRef.current = [];
      const errMsg = err.response?.data?.error || 'Failed to start ERP sync.';
      showToast(errMsg, 'error');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredInvoices.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleBulkVerify = async () => {
    if (selectedIds.length === 0) return;
    try {
      showToast(`Verifying ${selectedIds.length} selected invoice(s)...`, 'info');
      const res = await axios.post('/api/confirm', { ids: selectedIds });
      showToast(res.data.message || `Successfully verified ${selectedIds.length} invoice(s)!`, 'success');
      setSelectedIds([]);
      fetchInvoices(true);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to verify selected invoices.';
      showToast(errMsg, 'error');
    }
  };

  const handleBulkSync = async () => {
    if (selectedIds.length === 0) return;
    const syncableInvoices = invoices.filter(i => selectedIds.includes(i.id) && (i.status === 'Verified' || i.status === 'Failed' || i.status === 'Rejected'));
    if (syncableInvoices.length === 0) {
      showToast('None of the selected invoices are in Verified or Failed/Rejected status to be synced.', 'error');
      return;
    }
    const syncableIds = syncableInvoices.map(i => i.id);
    try {
      showToast(`Triggering ERP sync for ${syncableIds.length} invoice(s)...`, 'info');
      const res = await axios.post('/api/automation/start', { invoiceIds: syncableIds, stopOnError, entryUrl });
      showToast(res.data.message || 'ERP sync started successfully.', 'success');
      setSelectedIds([]);
      fetchInvoices(true);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to start ERP sync.';
      showToast(errMsg, 'error');
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    const confirmReject = window.confirm(`Are you sure you want to reject the ${selectedIds.length} selected invoice(s)?`);
    if (!confirmReject) return;
    try {
      showToast(`Rejecting ${selectedIds.length} selected invoice(s)...`, 'info');
      const res = await axios.post('/api/reject', { ids: selectedIds });
      showToast(res.data.message || `Successfully rejected ${selectedIds.length} invoice(s)!`, 'success');
      setSelectedIds([]);
      fetchInvoices(true);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to reject selected invoices.';
      showToast(errMsg, 'error');
    }
  };

  const updateInvoicesState = (newInvoices: Invoice[]) => {
    // 1. Check if any invoice transitioned from 'Automation Running' to 'Failed'
    const anyNewSyncFailed = newInvoices.some(newInv => {
      const oldInv = invoices.find(i => i.id === newInv.id);
      return oldInv && oldInv.status === 'Automation Running' && newInv.status === 'Failed';
    });

    if (anyNewSyncFailed) {
      playErrorSound();
    }

    // 2. Check active sync batch completion
    if (activeSyncIdsRef.current.length > 0) {
      const runningInBatch = newInvoices.filter(newInv => 
        activeSyncIdsRef.current.includes(newInv.id) && 
        newInv.status === 'Automation Running'
      );

      if (runningInBatch.length === 0) {
        // Entire batch has finished running!
        const batchInvoices = newInvoices.filter(newInv => activeSyncIdsRef.current.includes(newInv.id));
        const anyFailed = batchInvoices.some(i => i.status === 'Failed' || i.status === 'Rejected');
        
        if (activeSyncIdsRef.current.length > 1) {
          // It was a batch sync!
          if (anyFailed) {
            playErrorSound();
          } else {
            playSuccessSound();
          }
        } else {
          // It was a single sync!
          if (anyFailed) {
            playErrorSound();
          }
        }
        activeSyncIdsRef.current = [];
      }
    }

    setInvoices(newInvoices);
  };

  const fetchInvoices = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await axios.get('/api/invoices');
      updateInvoicesState(res.data);
    } catch (e: any) {
      console.error(e);
      showToast('Failed to fetch invoices from database.', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshInvoices = async () => {
    try {
      const res = await axios.get('/api/invoices');
      updateInvoicesState(res.data);
      // Keep logs up to date if currently open in drawer
      if (logInvoice) {
        const updatedLogInv = res.data.find((i: Invoice) => i.id === logInvoice.id);
        if (updatedLogInv) {
          setLogInvoice(updatedLogInv);
        }
      }
    } catch (e) {
      console.error('Silent refresh failed:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setPortalUsername(res.data.portal_username || '');
      setPortalPassword(res.data.portal_password || '');
      setEntryUrl(res.data.portal_entry_url || '');
      setAiConcurrency(res.data.ai_concurrency || '2');
      setAiRateLimit(res.data.ai_rate_limit || '15');
    } catch (e: any) {
      console.error('Failed to load settings:', e);
      showToast('Failed to load settings from server.', 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await axios.post('/api/settings', {
        portal_username: portalUsername,
        portal_password: portalPassword,
        portal_entry_url: entryUrl,
        ai_concurrency: Number(aiConcurrency) || 2,
        ai_rate_limit: Number(aiRateLimit) || 15
      });
      showToast('Settings saved successfully.', 'success');
      await fetchSettings();
    } catch (e: any) {
      console.error('Failed to save settings:', e);
      showToast('Failed to save settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchSettings();
  }, []);

  // Poll server if any automation or AI processing/queuing is running
  useEffect(() => {
    const isRunning = invoices.some(
      i => i.status === 'Automation Running' || 
           i.status === 'Pending AI Extraction' || 
           i.status === 'AI Processing'
    );
    if (isRunning) {
      const interval = setInterval(() => {
        refreshInvoices();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [invoices, logInvoice]);

  // Compute counts
  const aiProcessingCount = invoices.filter(
    i => i.status === 'Pending AI Extraction' || 
         i.status === 'AI Processing' || 
         i.status === 'AI Failed'
  ).length;
  const pendingCount = invoices.filter(i => i.status === 'Pending Verification').length;
  const verifiedCount = invoices.filter(i => i.status === 'Verified').length;
  const erpSyncedCount = invoices.filter(i => i.status === 'Completed').length;
  const erpFailedCount = invoices.filter(i => i.status === 'Failed').length;
  const activeSyncsCount = invoices.filter(i => i.status === 'Automation Running').length;

  // Filtered invoices
  const filteredInvoices = invoices.filter(invoice => {
    let matchesStatus = false;
    if (statusFilter === 'All') {
      matchesStatus = true;
    } else if (statusFilter === 'Pending AI Extraction') {
      matchesStatus = 
        invoice.status === 'Pending AI Extraction' || 
        invoice.status === 'AI Processing' || 
        invoice.status === 'AI Failed';
    } else {
      matchesStatus = invoice.status === statusFilter;
    }

    const matchesSearch =
      invoice.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.supplier_pan.includes(searchTerm) ||
      String(invoice.bill_number).includes(searchTerm) ||
      invoice.miti_bs.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateString;
    }
  };

  const isInvalidOrDefault = (invoice: Invoice) => {
    return invoice.supplier_pan === '000000000' || 
           !invoice.supplier_name || 
           invoice.supplier_name.trim() === '' || 
           invoice.supplier_name === 'New Uploaded Invoice' || 
           !invoice.bill_number || 
           Number(invoice.bill_number) === 0 || 
           (Number(invoice.taxable_amount) === 0 && Number(invoice.non_taxable_amount) === 0);
  };

  const verifiedInvoicesToSync = invoices.filter(i => i.status === 'Verified');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/50 bg-white/70 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/70 py-4 px-6 md:px-12 flex justify-between items-center transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand-light">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-brand to-violet-500 bg-clip-text text-transparent font-sans">
              Nepali VAT Invoice Verify
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">AI-Powered Invoice Entry Automation</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
          />

          {verifiedInvoicesToSync.length > 0 && (
            <button
              onClick={() => handleStartAutomation(verifiedInvoicesToSync.map(i => i.id))}
              disabled={activeSyncsCount > 0 || uploading || loading}
              className="flex items-center gap-2 px-4.5 py-2.5 bg-gradient-to-r from-brand to-violet-600 hover:from-brand-dark hover:to-violet-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 animate-pulse-subtle"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Sync {verifiedInvoicesToSync.length} to ERP</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading || clearing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
            title="Upload raw invoice documents manually"
          >
            {uploading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            <span>Upload Invoices</span>
          </button>

          <button
            onClick={handleClearDatabase}
            disabled={uploading || loading || clearing}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/30 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
            title="Clear all invoices from database"
          >
            {clearing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>Clear Database</span>
          </button>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1"></div>

          <button
            onClick={() => fetchInvoices()}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all active:scale-95"
            title="Refresh Invoices"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all active:scale-95"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-xl transition-all active:scale-95 ${showSettings
                ? 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light font-bold ring-2 ring-brand/50'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            title="Configure Automation settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto py-8 px-6 md:px-12 flex flex-col gap-8">

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-5 bg-white/80 dark:bg-slate-900/85 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-sm glass-panel animate-in fade-in slide-in-from-top-4 duration-200">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-brand" />
              <span>Automation & Sync Settings</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Setting 1: Username */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Khatacloud Login Email / Username
                </label>
                <input
                  type="text"
                  value={portalUsername}
                  onChange={(e) => setPortalUsername(e.target.value)}
                  placeholder="Enter login email or username"
                  className="w-full text-xs font-medium px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent dark:text-slate-100"
                />
              </div>

              {/* Setting 2: Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Khatacloud Login Password
                </label>
                <input
                  type="password"
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs font-medium px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent dark:text-slate-100"
                />
              </div>

              {/* Setting 3: Purchase Entry URL */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Khatacloud Purchase Entry URL
                </label>
                <input
                  type="text"
                  value={entryUrl}
                  onChange={(e) => setEntryUrl(e.target.value)}
                  placeholder="http://rishunew.khatacloud.com/Home/entry?..."
                  className="w-full text-xs font-medium font-mono px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent dark:text-slate-100"
                />
              </div>

              {/* Setting 4: AI Queue Concurrency */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  AI Extraction Concurrency (Active Queue Limit)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={aiConcurrency}
                  onChange={(e) => setAiConcurrency(e.target.value)}
                  placeholder="2"
                  className="w-full text-xs font-medium px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent dark:text-slate-100"
                />
              </div>

              {/* Setting 5: AI Rate Limit */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Gemini API Rate Limit (Requests per minute)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={aiRateLimit}
                  onChange={(e) => setAiRateLimit(e.target.value)}
                  placeholder="15"
                  className="w-full text-xs font-medium px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent dark:text-slate-100"
                />
              </div>

              {/* Setting 6: Stop on Error & Save Button */}
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 md:col-span-2 border-t border-slate-200/50 dark:border-slate-800/50 pt-5 mt-2">
                <label className="flex items-center gap-3 cursor-pointer bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 select-none transition-all w-fit h-[42px]">
                  <input
                    type="checkbox"
                    checked={stopOnError}
                    onChange={(e) => setStopOnError(e.target.checked)}
                    className="w-4 h-4 text-brand bg-slate-100 border-slate-300 rounded focus:ring-brand dark:focus:ring-brand-dark focus:ring-2 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Stop Sync on Error</span>
                </label>

                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingSettings ? (
                    <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <Save className="w-4.5 h-4.5" />
                  )}
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Card 1: AI Processing */}
          <div
            onClick={() => setStatusFilter('Pending AI Extraction')}
            className={`cursor-pointer group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${statusFilter === 'Pending AI Extraction'
                ? 'border-purple-500 bg-purple-500/5 dark:bg-purple-500/10 shadow-premium scale-[1.02]'
                : 'border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 hover:shadow-premium'
              }`}
          >
            <div className="flex items-center gap-4.5">
              <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 group-hover:scale-110 transition-transform">
                <Sparkles className="w-5.5 h-5.5 animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">AI Extracting</p>
                <h3 className="text-xl font-extrabold font-sans mt-0.5">{aiProcessingCount}</h3>
              </div>
            </div>
          </div>

          {/* Card 2: Pending Human verification */}
          <div
            onClick={() => setStatusFilter('Pending Verification')}
            className={`cursor-pointer group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${statusFilter === 'Pending Verification'
                ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 shadow-premium scale-[1.02]'
                : 'border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 hover:shadow-premium'
              }`}
          >
            <div className="flex items-center gap-4.5">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 group-hover:scale-110 transition-transform">
                <Clock className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">To Verify</p>
                <h3 className="text-xl font-extrabold font-sans mt-0.5">{pendingCount}</h3>
              </div>
            </div>
          </div>

          {/* Card 3: Verified */}
          <div
            onClick={() => setStatusFilter('Verified')}
            className={`cursor-pointer group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${statusFilter === 'Verified'
                ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-premium scale-[1.02]'
                : 'border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 hover:shadow-premium'
              }`}
          >
            <div className="flex items-center gap-4.5">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Verified</p>
                <h3 className="text-xl font-extrabold font-sans mt-0.5">{verifiedCount}</h3>
              </div>
            </div>
          </div>

          {/* Card 4: ERP Synced (Completed) */}
          <div
            onClick={() => setStatusFilter('Completed')}
            className={`cursor-pointer group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${statusFilter === 'Completed'
                ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-premium scale-[1.02]'
                : 'border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 hover:shadow-premium'
              }`}
          >
            <div className="flex items-center gap-4.5">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">ERP Synced</p>
                <h3 className="text-xl font-extrabold font-sans mt-0.5">{erpSyncedCount}</h3>
              </div>
            </div>
          </div>

          {/* Card 5: ERP Failed */}
          <div
            onClick={() => setStatusFilter('Failed')}
            className={`cursor-pointer group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${statusFilter === 'Failed'
                ? 'border-rose-500 bg-rose-500/5 dark:bg-rose-500/10 shadow-premium scale-[1.02]'
                : 'border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 hover:shadow-premium'
              }`}
          >
            <div className="flex items-center gap-4.5">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 dark:bg-rose-500/20 group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">ERP Failed</p>
                <h3 className="text-xl font-extrabold font-sans mt-0.5">{erpFailedCount}</h3>
              </div>
            </div>
          </div>
        </section>

        {/* Filters and Search */}
        <section className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-white/40 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 glass-panel">
          {/* Status Tabs */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200/20 dark:border-slate-800/20 self-start lg:self-auto overflow-x-auto max-w-full">
            {['All', 'Pending AI Extraction', 'Pending Verification', 'Verified', 'Automation Running', 'Completed', 'Failed', 'Rejected'].map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${statusFilter === tab
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
              >
                {tab === 'All'
                  ? 'All Invoices'
                  : tab === 'Pending AI Extraction'
                    ? 'AI Processing'
                    : tab === 'Automation Running'
                      ? 'ERP Syncing'
                      : tab === 'Completed'
                        ? 'ERP Synced'
                        : tab === 'Failed'
                          ? 'ERP Failed'
                          : tab}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 lg:max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search by supplier name, PAN, bill number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 hover:bg-slate-100 focus:bg-white dark:bg-slate-950/50 dark:hover:bg-slate-950 dark:focus:bg-slate-950/80 rounded-xl border border-slate-200/20 focus:border-brand/40 dark:border-slate-800/20 dark:focus:border-brand/40 text-sm focus:outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </section>

        {/* Invoices Table */}
        <section className="bg-white/40 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl overflow-hidden glass-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-slate-400 dark:text-slate-500 text-xs font-semibold tracking-wider uppercase bg-slate-100/20 dark:bg-slate-950/20">
                  <th className="py-4 px-6 text-center w-12">
                    <input
                      type="checkbox"
                      checked={filteredInvoices.length > 0 && selectedIds.length === filteredInvoices.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded text-brand focus:ring-brand border-slate-300 dark:border-slate-850 dark:bg-slate-900 focus:outline-none cursor-pointer"
                    />
                  </th>
                  <th className="py-4 px-6">Supplier Name</th>
                  <th className="py-4 px-6">Bill Number</th>
                  <th className="py-4 px-6">PAN</th>
                  <th className="py-4 px-6 text-right">Taxable Amount</th>
                  <th className="py-4 px-6">BS Date</th>
                  <th className="py-4 px-6">Captured / Uploaded</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-center">Sync Log</th>
                  <th className="py-4 px-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/30 dark:divide-slate-800/30">
                {loading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-6 text-center"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-800 rounded mx-auto"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-20 ml-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-full"></div></td>
                      <td className="py-4 px-6"><div className="h-4 w-12 mx-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                      <td className="py-4 px-6"><div className="h-8 w-16 mx-auto bg-slate-200 dark:bg-slate-800 rounded-lg"></div></td>
                    </tr>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-400">
                          <FileText className="w-8 h-8" />
                        </div>
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300">No Invoices Found</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                          We couldn't find any invoices matching the criteria. Try adjusting your filters or search term.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((invoice, index) => (
                    <tr
                      key={invoice.id}
                      onClick={() => onSelectInvoice(filteredInvoices.map(i => i.id), index)}
                      className={`group cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-950/30 transition-colors ${
                        selectedIds.includes(invoice.id)
                          ? 'bg-brand/5 dark:bg-brand/10'
                          : isInvalidOrDefault(invoice)
                            ? 'bg-rose-500/[0.02] dark:bg-rose-500/[0.01]'
                            : invoice.non_taxable_amount !== undefined && invoice.non_taxable_amount > 0
                              ? 'bg-cyan-500/[0.02] dark:bg-cyan-500/[0.01]'
                              : ''
                      }`}
                    >
                      <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(invoice.id)}
                          onChange={(e) => handleSelectRow(e, invoice.id)}
                          className="w-4 h-4 rounded text-brand focus:ring-brand border-slate-300 dark:border-slate-800 dark:bg-slate-900 focus:outline-none cursor-pointer"
                        />
                      </td>
                      <td className={`py-4 px-6 font-semibold text-slate-800 dark:text-slate-200 ${
                        isInvalidOrDefault(invoice)
                          ? 'border-l-4 border-rose-500 dark:border-l-4 dark:border-rose-500'
                          : invoice.non_taxable_amount !== undefined && invoice.non_taxable_amount > 0
                            ? 'border-l-4 border-cyan-500 dark:border-l-4 dark:border-cyan-400'
                            : ''
                      }`}>
                        <div className="flex items-center gap-2">
                          <span>{invoice.supplier_name}</span>
                          {isInvalidOrDefault(invoice) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/30 animate-pulse tracking-wider">
                              Missing / Placeholder
                            </span>
                          )}
                          {invoice.non_taxable_amount !== undefined && invoice.non_taxable_amount > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-400 border border-cyan-200/50 dark:border-cyan-800/30 animate-pulse tracking-wider">
                              Non-Taxable
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 font-mono text-sm">
                        {invoice.bill_number}
                      </td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 font-mono text-sm">
                        {invoice.supplier_pan}
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-800 dark:text-slate-200 font-mono text-sm">
                        <div className="flex flex-col items-end">
                          <span className="text-slate-800 dark:text-slate-200 font-bold" title="Taxable Amount">
                            T: Rs. {invoice.taxable_amount.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                          </span>
                          {invoice.non_taxable_amount !== undefined && invoice.non_taxable_amount > 0 && (
                            <span className="text-slate-400 dark:text-slate-500 text-[11px] font-semibold mt-0.5" title="Non-Taxable Amount">
                              NT: Rs. {invoice.non_taxable_amount.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 font-mono text-sm">
                        {invoice.miti_bs}
                      </td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 font-mono text-xs">
                        {invoice.captured_at ? (
                          <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold" title="Captured Original Click Time from Image EXIF">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{formatDate(invoice.captured_at)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500" title="No EXIF metadata. Showing uploaded time.">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            <span>{formatDate(invoice.created_at)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            invoice.status === 'Pending AI Extraction'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              : invoice.status === 'AI Processing'
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                : invoice.status === 'AI Failed'
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  : invoice.status === 'Pending Verification'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : invoice.status === 'Verified'
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                      : invoice.status === 'Automation Running'
                                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                        : invoice.status === 'Completed'
                                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                           }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                              invoice.status === 'Pending AI Extraction'
                                ? 'bg-purple-400'
                                : invoice.status === 'AI Processing'
                                  ? 'bg-indigo-500 animate-pulse'
                                  : invoice.status === 'AI Failed'
                                    ? 'bg-rose-500'
                                    : invoice.status === 'Pending Verification'
                                      ? 'bg-amber-500'
                                      : invoice.status === 'Verified'
                                        ? 'bg-blue-500'
                                        : invoice.status === 'Automation Running'
                                          ? 'bg-indigo-500 animate-spin border-t-transparent border-2'
                                          : invoice.status === 'Completed'
                                            ? 'bg-emerald-500'
                                            : 'bg-rose-500'
                            }`}></span>
                          {invoice.status === 'Pending AI Extraction'
                            ? 'AI Queued'
                            : invoice.status === 'AI Processing'
                              ? 'AI Extracting'
                              : invoice.status === 'AI Failed'
                                ? 'AI Failed'
                                : invoice.status === 'Automation Running'
                                  ? 'ERP Syncing'
                                  : invoice.status === 'Completed'
                                    ? 'ERP Synced'
                                    : invoice.status === 'Failed'
                                      ? 'ERP Failed'
                                      : invoice.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {invoice.automation_log ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLogInvoice(invoice);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                            title="View Automation Execution Logs"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {invoice.status === 'Pending Verification' && (
                            <button
                              onClick={() => handleDirectConfirm(invoice)}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-500 hover:text-white dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 transition-all active:scale-95"
                              title="Quick Confirm & Verify"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {invoice.status === 'Verified' && (
                            <button
                              onClick={() => handleStartAutomation([invoice.id])}
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-500 hover:text-white dark:bg-blue-950/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 transition-all active:scale-95"
                              title="Sync to ERP Now"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          )}
                          {(invoice.status === 'Failed' || invoice.status === 'Rejected') && (
                            <button
                              onClick={() => handleStartAutomation([invoice.id])}
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-500 hover:text-white dark:bg-amber-950/20 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 transition-all active:scale-95 font-bold text-xs flex items-center gap-1"
                              title="Retry Sync"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => onSelectInvoice(filteredInvoices.map(i => i.id), index)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-brand/10 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-brand transition-all active:scale-95"
                            title="Open Verification Panel"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Slide-out Terminal Log Drawer */}
      {logInvoice && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm transition-opacity">
          <div className="absolute inset-0" onClick={() => setLogInvoice(null)}></div>

          <div className="relative w-full max-w-2xl h-screen bg-slate-900 text-slate-100 shadow-2xl flex flex-col z-10 border-l border-slate-800 animate-slide-in">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand/10 text-brand rounded-xl border border-brand/20">
                  <Terminal className="w-5.5 h-5.5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">{logInvoice.supplier_name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Bill: {logInvoice.bill_number} • PAN: {logInvoice.supplier_pan}</p>
                </div>
              </div>
              <button
                onClick={() => setLogInvoice(null)}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Stepper Timeline */}
              <div className="p-5 bg-slate-950/40 border border-slate-800 rounded-2xl space-y-4">
                <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Invoice Processing Timeline</span>
                </h4>
                <div className="relative flex flex-col gap-6 pl-6 border-l border-slate-800">
                  {/* Step 1: Uploaded */}
                  <div className="relative">
                    <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px]">
                      ✓
                    </span>
                    <div>
                      <h5 className="text-xs font-bold text-slate-200">Invoice Uploaded</h5>
                      <p className="text-[10px] text-slate-500 mt-0.5">Uploaded on {formatDate(logInvoice.created_at)}</p>
                    </div>
                  </div>

                  {/* Step 2: AI Extraction */}
                  <div className="relative">
                    {(() => {
                      const isQueued = logInvoice.status === 'Pending AI Extraction';
                      const isProcessing = logInvoice.status === 'AI Processing';
                      const isFailed = logInvoice.status === 'AI Failed';
                      const isCompleted = !isQueued && !isProcessing && !isFailed;

                      if (isCompleted) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px]">✓</span>
                            <div>
                              <h5 className="text-xs font-bold text-slate-200">AI Extraction</h5>
                              <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">Success • Details extracted by Gemini</p>
                            </div>
                          </>
                        );
                      } else if (isFailed) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-rose-500 text-white font-extrabold text-[10px]">✗</span>
                            <div>
                              <h5 className="text-xs font-bold text-rose-400">AI Extraction</h5>
                              <p className="text-[10px] text-rose-500 font-semibold mt-0.5">Failed • n8n extraction failed</p>
                            </div>
                          </>
                        );
                      } else if (isProcessing) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-indigo-500 text-white animate-pulse text-[10px]">⚙</span>
                            <div>
                              <h5 className="text-xs font-bold text-indigo-400">AI Extraction</h5>
                              <p className="text-[10px] text-indigo-300 font-semibold mt-0.5 flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> In Progress • Extracting fields...
                              </p>
                            </div>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-purple-500 text-white animate-pulse text-[10px]">⏱</span>
                            <div>
                              <h5 className="text-xs font-bold text-purple-400">AI Extraction</h5>
                              <p className="text-[10px] text-purple-300 font-semibold mt-0.5">Queued • Waiting for queue slot</p>
                            </div>
                          </>
                        );
                      }
                    })()}
                  </div>

                  {/* Step 3: Human Verification */}
                  <div className="relative">
                    {(() => {
                      const isAiActive = logInvoice.status === 'Pending AI Extraction' || logInvoice.status === 'AI Processing' || logInvoice.status === 'AI Failed';
                      const isPendingVerify = logInvoice.status === 'Pending Verification';
                      const isRejected = logInvoice.status === 'Rejected';

                      if (isAiActive) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-slate-800 text-slate-500 text-[10px]">•</span>
                            <div>
                              <h5 className="text-xs font-bold text-slate-500">Human Verification</h5>
                              <p className="text-[10px] text-slate-600 mt-0.5">Waiting for AI extraction to complete</p>
                            </div>
                          </>
                        );
                      } else if (isPendingVerify) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-amber-500 text-slate-950 font-extrabold text-[10px]">!</span>
                            <div>
                              <h5 className="text-xs font-bold text-amber-400">Human Verification</h5>
                              <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Action Required • Review fields in verification panel</p>
                            </div>
                          </>
                        );
                      } else if (isRejected) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-rose-500 text-white font-extrabold text-[10px]">✗</span>
                            <div>
                              <h5 className="text-xs font-bold text-rose-400">Human Verification</h5>
                              <p className="text-[10px] text-rose-500 font-semibold mt-0.5">Rejected • Invoice rejected by user</p>
                            </div>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px]">✓</span>
                            <div>
                              <h5 className="text-xs font-bold text-slate-200">Human Verification</h5>
                              <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">Success • Details confirmed and verified</p>
                            </div>
                          </>
                        );
                      }
                    })()}
                  </div>

                  {/* Step 4: ERP Sync */}
                  <div className="relative">
                    {(() => {
                      const isBeforeVerify = logInvoice.status === 'Pending AI Extraction' || logInvoice.status === 'AI Processing' || logInvoice.status === 'AI Failed' || logInvoice.status === 'Pending Verification';
                      const isRejected = logInvoice.status === 'Rejected';
                      const isReady = logInvoice.status === 'Verified';
                      const isSyncing = logInvoice.status === 'Automation Running';
                      const isFailed = logInvoice.status === 'Failed';

                      if (isBeforeVerify) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-slate-800 text-slate-500 text-[10px]">•</span>
                            <div>
                              <h5 className="text-xs font-bold text-slate-500">ERP Portal Sync</h5>
                              <p className="text-[10px] text-slate-600 mt-0.5">Waiting for human verification</p>
                            </div>
                          </>
                        );
                      } else if (isRejected) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-slate-800 text-slate-500 text-[10px]">•</span>
                            <div>
                              <h5 className="text-xs font-bold text-slate-500">ERP Portal Sync</h5>
                              <p className="text-[10px] text-slate-600 mt-0.5">N/A • Invoice was rejected</p>
                            </div>
                          </>
                        );
                      } else if (isReady) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px]">▶</span>
                            <div>
                              <h5 className="text-xs font-bold text-blue-400">ERP Portal Sync</h5>
                              <p className="text-[10px] text-blue-550 dark:text-blue-400 font-semibold mt-0.5">Ready to Sync • Click play to launch browser automation</p>
                            </div>
                          </>
                        );
                      } else if (isSyncing) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-indigo-500 text-white animate-pulse text-[10px]">⚙</span>
                            <div>
                              <h5 className="text-xs font-bold text-indigo-400">ERP Portal Sync</h5>
                              <p className="text-[10px] text-indigo-300 font-semibold mt-0.5 flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> In Progress • Syncing in browser...
                              </p>
                            </div>
                          </>
                        );
                      } else if (isFailed) {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-rose-500 text-white font-extrabold text-[10px]">✗</span>
                            <div>
                              <h5 className="text-xs font-bold text-rose-400">ERP Portal Sync</h5>
                              <p className="text-[10px] text-rose-500 font-semibold mt-0.5">Failed • Sync automation encountered errors</p>
                            </div>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <span className="absolute -left-[30px] top-0 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[10px]">✓</span>
                            <div>
                              <h5 className="text-xs font-bold text-slate-200">ERP Portal Sync</h5>
                              <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">Success • Details synced to Khatacloud portal</p>
                            </div>
                          </>
                        );
                      }
                    })()}
                  </div>
                </div>

                {/* Smaller Metadata Row */}
                {(logInvoice.automation_started_at || logInvoice.automation_finished_at) && (
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/60 text-[10px] text-slate-400 font-mono">
                    {logInvoice.automation_started_at && (
                      <div>Started: {formatDate(logInvoice.automation_started_at)}</div>
                    )}
                    {logInvoice.automation_finished_at && (
                      <div>Finished: {formatDate(logInvoice.automation_finished_at)}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Error message box if failed */}
              {logInvoice.automation_error && (
                <div className="p-4.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Sync Error</h4>
                    <p className="text-xs text-slate-200 mt-1 font-semibold leading-relaxed">{logInvoice.automation_error}</p>
                  </div>
                </div>
              )}

              {/* Console Logs */}
              <div className="flex flex-col h-[400px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs shadow-inner">
                <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/80 flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60"></div>
                  <span className="text-[10px] text-slate-500 font-bold ml-2">Console Output</span>
                </div>
                <div className="flex-1 p-4.5 overflow-y-auto space-y-2 text-slate-300 scrollbar-thin select-text">
                  {logInvoice.automation_log ? (
                    logInvoice.automation_log.split('\n').map((line, i) => {
                      const isError = line.includes('[ERROR]');
                      const isInfo = line.includes('[INFO]');
                      let cleanLine = line;
                      if (isError) cleanLine = line.replace('[ERROR] ', '');
                      if (isInfo) cleanLine = line.replace('[INFO] ', '');

                      return (
                        <div key={i} className={`leading-relaxed ${isError ? 'text-rose-400 font-semibold' : ''} ${isInfo ? 'text-slate-300' : 'text-slate-400'}`}>
                          {isError && <span className="text-rose-500 font-bold mr-1.5">✗</span>}
                          {isInfo && <span className="text-indigo-400 font-bold mr-1.5">❯</span>}
                          {cleanLine}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 italic text-center mt-12">No logs captured for this sync.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur">
              <button
                onClick={() => setLogInvoice(null)}
                className="px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white font-bold hover:bg-slate-800 text-xs transition-all active:scale-95"
              >
                Close Logs
              </button>
              {(logInvoice.status === 'Failed' || logInvoice.status === 'Rejected') && (
                <button
                  onClick={() => {
                    handleStartAutomation([logInvoice.id]);
                    setLogInvoice(null);
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Sync Now</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Bulk Selection */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-md text-white border border-slate-800 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-6 shadow-2xl z-40 animate-in slide-in-from-bottom-8 duration-300 w-[90%] max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              {selectedIds.length}
            </span>
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Selected Invoices</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkVerify}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 border-0 cursor-pointer shadow-md"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Verify</span>
            </button>

            <button
              onClick={handleBulkSync}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 border-0 cursor-pointer shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Sync ERP</span>
            </button>

            <button
              onClick={handleBulkReject}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 border-0 cursor-pointer shadow-md"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>

            <div className="w-px h-6 bg-slate-800 mx-1"></div>

            <button
              onClick={() => setSelectedIds([])}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all active:scale-95 border-0 cursor-pointer"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
