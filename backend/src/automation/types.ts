export type InvoiceStatus = 
  | 'Pending AI Extraction'
  | 'AI Processing'
  | 'AI Failed'
  | 'Pending Verification'
  | 'Verified'
  | 'Rejected'
  | 'Automation Running'
  | 'Completed'
  | 'Failed';

export interface AutomationResult {
  invoiceId: string;
  status: 'Completed' | 'Failed';
  automation_error: string | null;
  automation_log: string;
  automation_started_at: Date;
  automation_finished_at: Date;
}
