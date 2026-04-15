export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  balanceMYR: number;
  balanceBTC: number;
  createdAt: any;
}

export interface Transaction {
  id?: string;
  userId: string;
  type: 'transfer' | 'swap';
  subType: string;
  amount: number;
  currency: 'MYR' | 'BTC';
  targetAmount?: number;
  targetCurrency?: string;
  destination?: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: any;
}
