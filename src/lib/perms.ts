export type Role = 'admin' | 'accountant' | 'sales' | 'viewer';
export const ROLES: Role[] = ['admin', 'accountant', 'sales', 'viewer'];
export const ROLE_LABEL: Record<Role, string> = { admin: 'مدير', accountant: 'محاسب', sales: 'مبيعات', viewer: 'مشاهد' };

export interface Perms {
  role: Role;
  ownOnly: boolean;        // sees only own quotes / customers
  quotesWrite: 'all' | 'own' | 'due' | 'none'; // 'due' = may only edit contract payment due dates
  customersWrite: boolean;
  itemsWrite: boolean;
  receipts: boolean;       // sees receipts / payments
  receiptsWrite: boolean;
  voidReceipts: boolean;
  settingsWrite: boolean;
  users: boolean;
  audit: boolean;
  backup: boolean;
  reports: boolean;
  approve: boolean;        // may approve large discounts
  takeoff: boolean;        // may use the quantity take-off tool
  seeCost: boolean;        // may see item / line costs and margins
  invoices: boolean;       // may see tax invoices
  invoicesWrite: boolean;  // may issue tax invoices / credit notes
  agreements: 'all' | 'own' | 'read' | 'none'; // agreements & contracts library
  pdocs: 'write' | 'read' | 'none'; // variation orders & interim payment certificates
}

export function permsFor(role: Role): Perms {
  switch (role) {
    case 'admin':
      return { role, ownOnly: false, quotesWrite: 'all', customersWrite: true, itemsWrite: true, receipts: true, receiptsWrite: true, voidReceipts: true, settingsWrite: true, users: true, audit: true, backup: true, reports: true, approve: true, takeoff: true, seeCost: true, invoices: true, invoicesWrite: true, agreements: 'all', pdocs: 'write' };
    case 'accountant':
      return { role, ownOnly: false, quotesWrite: 'due', customersWrite: true, itemsWrite: false, receipts: true, receiptsWrite: true, voidReceipts: true, settingsWrite: false, users: false, audit: false, backup: false, reports: true, approve: false, takeoff: false, seeCost: true, invoices: true, invoicesWrite: true, agreements: 'read', pdocs: 'write' };
    case 'sales':
      return { role, ownOnly: true, quotesWrite: 'own', customersWrite: true, itemsWrite: false, receipts: false, receiptsWrite: false, voidReceipts: false, settingsWrite: false, users: false, audit: false, backup: false, reports: false, approve: false, takeoff: true, seeCost: false, invoices: false, invoicesWrite: false, agreements: 'own', pdocs: 'read' };
    default:
      return { role: 'viewer', ownOnly: false, quotesWrite: 'none', customersWrite: false, itemsWrite: false, receipts: true, receiptsWrite: false, voidReceipts: false, settingsWrite: false, users: false, audit: false, backup: false, reports: false, approve: false, takeoff: false, seeCost: false, invoices: false, invoicesWrite: false, agreements: 'none', pdocs: 'none' };
  }
}
