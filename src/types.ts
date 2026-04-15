export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  balanceMYR: number;
  balanceBTC: number;
  createdAt: any;
}

export interface Card {
  id?: string;
  userId: string;
  type: 'visa' | 'mastercard' | 'tng';
  last4: string;
  expiry: string;
  cardholderName: string;
  addedAt: any;
}

export interface Transaction {
  id?: string;
  userId: string;
  type: 'transfer' | 'swap' | 'deposit' | 'withdraw' | 'trade';
  subType: string;
  amount: number;
  currency: 'MYR' | 'BTC' | 'USD' | 'EUR' | 'GBP';
  targetAmount?: number;
  targetCurrency?: string;
  destination?: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: any;
}

export interface ForexTrade {
  id?: string;
  userId: string;
  pair: string; // e.g., "USD/MYR"
  type: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  status: 'open' | 'closed';
  timestamp: any;
  closedAt?: any;
  profit?: number;
}
