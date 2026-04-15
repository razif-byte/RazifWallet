import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, 
  Send, 
  RefreshCw, 
  History, 
  User as UserIcon, 
  LogOut, 
  ArrowRightLeft, 
  TrendingUp, 
  MessageSquare,
  ChevronRight,
  CreditCard,
  Smartphone,
  Bitcoin,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, Transaction } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BTC_PRICE_MYR = 285000; // Mock real-time price

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'transfer' | 'swap' | 'history' | 'assistant'>('home');
  const [showTransferModal, setShowTransferModal] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<'MYRtoBTC' | 'BTCtoMYR'>('MYRtoBTC');
  const [swapAmount, setSwapAmount] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await ensureUserProfile(currentUser);
        subscribeToData(currentUser.uid);
      } else {
        setProfile(null);
        setTransactions([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const ensureUserProfile = async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    try {
      const docSnap = await getDoc(userRef);
      if (!docSnap.exists()) {
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email!,
          displayName: user.displayName,
          balanceMYR: 1000, // Starting balance
          balanceBTC: 0.005, // Starting balance
          createdAt: serverTimestamp(),
        };
        await setDoc(userRef, newProfile);
        setProfile(newProfile);
      } else {
        setProfile(docSnap.data() as UserProfile);
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
      setError("Failed to load profile. Please check your connection.");
    }
  };

  const subscribeToData = (uid: string) => {
    const userRef = doc(db, 'users', uid);
    const unsubProfile = onSnapshot(userRef, (doc) => {
      if (doc.exists()) setProfile(doc.data() as UserProfile);
    });

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', uid),
      orderBy('timestamp', 'desc')
    );
    const unsubTransactions = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
      setLoading(false);
    });

    return () => {
      unsubProfile();
      unsubTransactions();
    };
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleTransfer = async (type: string, destination: string, amount: number) => {
    if (!profile || !user) return;
    
    if (profile.balanceMYR < amount) {
      setError("Insufficient MYR balance");
      return;
    }

    try {
      const tx: Transaction = {
        userId: user.uid,
        type: 'transfer',
        subType: type,
        amount,
        currency: 'MYR',
        destination,
        status: 'completed',
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, 'transactions'), tx);
      await updateDoc(doc(db, 'users', user.uid), {
        balanceMYR: profile.balanceMYR - amount
      });
      setShowTransferModal(null);
    } catch (err) {
      console.error("Transfer failed:", err);
      setError("Transfer failed. Please try again.");
    }
  };

  const handleBTCTransfer = async (destination: string, amount: number) => {
    if (!profile || !user) return;
    
    if (profile.balanceBTC < amount) {
      setError("Insufficient BTC balance");
      return;
    }

    try {
      const tx: Transaction = {
        userId: user.uid,
        type: 'transfer',
        subType: 'BTC Wallet',
        amount,
        currency: 'BTC',
        destination,
        status: 'completed',
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, 'transactions'), tx);
      await updateDoc(doc(db, 'users', user.uid), {
        balanceBTC: profile.balanceBTC - amount
      });
      setShowTransferModal(null);
    } catch (err) {
      console.error("BTC Transfer failed:", err);
      setError("BTC Transfer failed.");
    }
  };

  const handleSwap = async () => {
    if (!profile || !user || !swapAmount) return;
    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      if (swapMode === 'MYRtoBTC') {
        if (profile.balanceMYR < amount) {
          setError("Insufficient MYR balance");
          return;
        }
        const btcAmount = amount / BTC_PRICE_MYR;
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          type: 'swap',
          subType: 'MYR to BTC',
          amount,
          currency: 'MYR',
          targetAmount: btcAmount,
          targetCurrency: 'BTC',
          status: 'completed',
          timestamp: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', user.uid), {
          balanceMYR: profile.balanceMYR - amount,
          balanceBTC: profile.balanceBTC + btcAmount
        });
      } else {
        if (profile.balanceBTC < amount) {
          setError("Insufficient BTC balance");
          return;
        }
        const myrAmount = amount * BTC_PRICE_MYR;
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          type: 'swap',
          subType: 'BTC to MYR',
          amount,
          currency: 'BTC',
          targetAmount: myrAmount,
          targetCurrency: 'MYR',
          status: 'completed',
          timestamp: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', user.uid), {
          balanceBTC: profile.balanceBTC - amount,
          balanceMYR: profile.balanceMYR + myrAmount
        });
      }
      setSwapAmount('');
      setActiveTab('home');
    } catch (err) {
      console.error("Swap failed:", err);
      setError("Swap failed.");
    }
  };

  const askGemini = async (text: string) => {
    const newMessages = [...chatMessages, { role: 'user' as const, text }];
    setChatMessages(newMessages);
    setIsChatting(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: 'user', parts: [{ text: `You are RazifWallet Assistant. Help the user with their financial queries. Current BTC Price: RM${BTC_PRICE_MYR.toLocaleString()}. User Balance: RM${profile?.balanceMYR.toFixed(2)}, BTC ${profile?.balanceBTC.toFixed(8)}. Query: ${text}` }] }]
      });
      setChatMessages([...newMessages, { role: 'model', text: response.text || "I couldn't generate a response." }]);
    } catch (err) {
      console.error("Gemini error:", err);
      setChatMessages([...newMessages, { role: 'model', text: "Sorry, I'm having trouble connecting to my brain right now." }]);
    } finally {
      setIsChatting(false);
    }
  };

  if (loading && user) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-neutral-100"
        >
          <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-2">RazifWallet</h1>
          <p className="text-neutral-500 mb-8">Secure, simple, and smart e-wallet for your MYR and Bitcoin.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-neutral-900 text-white py-4 rounded-xl font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-3"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-bottom border-neutral-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">RazifWallet</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveTab('assistant')} className="p-2 hover:bg-neutral-100 rounded-full transition-colors relative">
            <MessageSquare className="w-5 h-5 text-neutral-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-neutral-900 rounded-full border-2 border-white"></span>
          </button>
          <button onClick={handleLogout} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
            <LogOut className="w-5 h-5 text-neutral-600" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-6">
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-50 border border-red-100 p-4 rounded-2xl mb-6 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
          </motion.div>
        )}

        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* Balance Card */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-neutral-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden"
            >
              <div className="relative z-10">
                <p className="text-neutral-400 text-sm font-medium mb-1 uppercase tracking-wider">Total Balance</p>
                <h2 className="text-4xl font-bold mb-6">RM {(profile?.balanceMYR || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                
                <div className="flex items-center justify-between pt-6 border-t border-neutral-800">
                  <div>
                    <p className="text-neutral-400 text-xs mb-1">Bitcoin Wallet</p>
                    <p className="font-mono text-lg">{profile?.balanceBTC.toFixed(8)} BTC</p>
                  </div>
                  <div className="text-right">
                    <p className="text-neutral-400 text-xs mb-1">BTC Value</p>
                    <p className="text-neutral-300">RM {((profile?.balanceBTC || 0) * BTC_PRICE_MYR).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
              <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 bg-white/5 rounded-full blur-2xl"></div>
            </motion.div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => setActiveTab('transfer')}
                className="bg-white p-4 rounded-2xl border border-neutral-100 flex flex-col items-center gap-2 hover:bg-neutral-50 transition-colors"
              >
                <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center">
                  <Send className="w-5 h-5 text-neutral-900" />
                </div>
                <span className="text-xs font-semibold">Transfer</span>
              </button>
              <button 
                onClick={() => setActiveTab('swap')}
                className="bg-white p-4 rounded-2xl border border-neutral-100 flex flex-col items-center gap-2 hover:bg-neutral-50 transition-colors"
              >
                <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-neutral-900" />
                </div>
                <span className="text-xs font-semibold">Swap</span>
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className="bg-white p-4 rounded-2xl border border-neutral-100 flex flex-col items-center gap-2 hover:bg-neutral-50 transition-colors"
              >
                <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-neutral-900" />
                </div>
                <span className="text-xs font-semibold">History</span>
              </button>
            </div>

            {/* Market Chart */}
            <div className="bg-white p-6 rounded-3xl border border-neutral-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg">BTC / MYR</h3>
                <span className="text-green-500 text-sm font-bold flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> +2.4%
                </span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[
                    { name: 'Mon', val: 275000 },
                    { name: 'Tue', val: 278000 },
                    { name: 'Wed', val: 272000 },
                    { name: 'Thu', val: 280000 },
                    { name: 'Fri', val: 285000 },
                  ]}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#171717" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#171717" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="val" stroke="#171717" fillOpacity={1} fill="url(#colorVal)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Transactions */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Recent Activity</h3>
                <button onClick={() => setActiveTab('history')} className="text-neutral-500 text-sm font-medium">See all</button>
              </div>
              <div className="space-y-3">
                {transactions.slice(0, 3).map((tx) => (
                  <div key={tx.id} className="bg-white p-4 rounded-2xl border border-neutral-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        tx.type === 'swap' ? "bg-blue-50" : "bg-neutral-50"
                      )}>
                        {tx.type === 'swap' ? <ArrowRightLeft className="w-5 h-5 text-blue-600" /> : <Send className="w-5 h-5 text-neutral-600" />}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{tx.subType}</p>
                        <p className="text-neutral-400 text-xs">{tx.timestamp?.toDate().toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">
                        {tx.type === 'swap' ? '' : '-'} {tx.amount} {tx.currency}
                      </p>
                      <p className="text-neutral-400 text-xs uppercase">{tx.status}</p>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-neutral-400">
                    <p className="text-sm">No transactions yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">Transfer Money</h2>
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => setShowTransferModal('CIMB Bank')}
                className="bg-white p-6 rounded-3xl border border-neutral-100 flex items-center justify-between hover:border-neutral-300 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">CIMB Bank</p>
                    <p className="text-neutral-400 text-xs">Instant bank transfer</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-300" />
              </button>

              <button 
                onClick={() => setShowTransferModal('Touch \'n Go')}
                className="bg-white p-6 rounded-3xl border border-neutral-100 flex items-center justify-between hover:border-neutral-300 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">Touch 'n Go</p>
                    <p className="text-neutral-400 text-xs">Transfer to e-wallet</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-300" />
              </button>

              <button 
                onClick={() => setShowTransferModal('BTC Wallet')}
                className="bg-white p-6 rounded-3xl border border-neutral-100 flex items-center justify-between hover:border-neutral-300 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
                    <Bitcoin className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">Bitcoin Wallet</p>
                    <p className="text-neutral-400 text-xs">Send crypto worldwide</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-300" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'swap' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">Currency Swap</h2>
            <div className="bg-white p-8 rounded-[2rem] border border-neutral-100 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="bg-neutral-50 p-4 rounded-2xl">
                  <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">From</label>
                  <div className="flex items-center justify-between">
                    <input 
                      type="number" 
                      value={swapAmount}
                      onChange={(e) => setSwapAmount(e.target.value)}
                      placeholder="0.00"
                      className="bg-transparent text-2xl font-bold outline-none w-full"
                    />
                    <span className="font-bold text-lg">{swapMode === 'MYRtoBTC' ? 'MYR' : 'BTC'}</span>
                  </div>
                </div>

                <div className="flex justify-center -my-6 relative z-10">
                  <button 
                    onClick={() => setSwapMode(swapMode === 'MYRtoBTC' ? 'BTCtoMYR' : 'MYRtoBTC')}
                    className="bg-neutral-900 text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-neutral-50 p-4 rounded-2xl">
                  <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">To (Estimated)</label>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">
                      {swapAmount ? (swapMode === 'MYRtoBTC' ? (parseFloat(swapAmount) / BTC_PRICE_MYR).toFixed(8) : (parseFloat(swapAmount) * BTC_PRICE_MYR).toFixed(2)) : '0.00'}
                    </div>
                    <span className="font-bold text-lg">{swapMode === 'MYRtoBTC' ? 'BTC' : 'MYR'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Exchange Rate</span>
                  <span className="font-medium">1 BTC = RM {BTC_PRICE_MYR.toLocaleString()}</span>
                </div>
                <button 
                  onClick={handleSwap}
                  disabled={!swapAmount}
                  className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Confirm Swap
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">Transaction History</h2>
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-white p-5 rounded-3xl border border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      tx.type === 'swap' ? "bg-blue-50" : "bg-neutral-50"
                    )}>
                      {tx.type === 'swap' ? <ArrowRightLeft className="w-6 h-6 text-blue-600" /> : <Send className="w-6 h-6 text-neutral-600" />}
                    </div>
                    <div>
                      <p className="font-bold">{tx.subType}</p>
                      <p className="text-neutral-400 text-xs">{tx.timestamp?.toDate().toLocaleString()}</p>
                      {tx.destination && <p className="text-neutral-500 text-[10px] mt-1 truncate max-w-[120px]">To: {tx.destination}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-bold",
                      tx.type === 'swap' ? "text-blue-600" : "text-neutral-900"
                    )}>
                      {tx.type === 'swap' ? '' : '-'} {tx.amount} {tx.currency}
                    </p>
                    {tx.targetAmount && (
                      <p className="text-green-600 text-xs font-bold">
                        + {tx.targetAmount.toFixed(tx.targetCurrency === 'BTC' ? 8 : 2)} {tx.targetCurrency}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {tx.status === 'completed' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Loader2 className="w-3 h-3 animate-spin text-neutral-300" />}
                      <span className="text-[10px] uppercase font-bold text-neutral-400">{tx.status}</span>
                    </div>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <div className="text-center py-20">
                  <History className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                  <p className="text-neutral-400">No transactions found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'assistant' && (
          <div className="flex flex-col h-[calc(100vh-180px)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">RazifWallet AI</h2>
                <p className="text-xs text-neutral-500">Your smart financial assistant</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-hide">
              {chatMessages.length === 0 && (
                <div className="text-center py-10 px-6">
                  <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-neutral-400" />
                  </div>
                  <p className="text-neutral-500 text-sm">Ask me about BTC rates, how to transfer, or for financial tips!</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn(
                  "flex",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  <div className={cn(
                    "max-w-[85%] p-4 rounded-2xl text-sm",
                    msg.role === 'user' ? "bg-neutral-900 text-white rounded-tr-none" : "bg-white border border-neutral-100 rounded-tl-none"
                  )}>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-white border border-neutral-100 p-4 rounded-2xl rounded-tl-none">
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <input 
                type="text" 
                placeholder="Type your question..."
                className="w-full bg-white border border-neutral-100 p-4 pr-12 rounded-2xl outline-none focus:border-neutral-300 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value) {
                    askGemini(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <button className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 transition-colors">
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-neutral-100 px-6 py-3 flex items-center justify-around z-20">
        <button onClick={() => setActiveTab('home')} className={cn("flex flex-col items-center gap-1", activeTab === 'home' ? "text-neutral-900" : "text-neutral-400")}>
          <Wallet className="w-6 h-6" />
          <span className="text-[10px] font-bold">Home</span>
        </button>
        <button onClick={() => setActiveTab('transfer')} className={cn("flex flex-col items-center gap-1", activeTab === 'transfer' ? "text-neutral-900" : "text-neutral-400")}>
          <Send className="w-6 h-6" />
          <span className="text-[10px] font-bold">Transfer</span>
        </button>
        <button onClick={() => setActiveTab('swap')} className={cn("flex flex-col items-center gap-1", activeTab === 'swap' ? "text-neutral-900" : "text-neutral-400")}>
          <RefreshCw className="w-6 h-6" />
          <span className="text-[10px] font-bold">Swap</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={cn("flex flex-col items-center gap-1", activeTab === 'history' ? "text-neutral-900" : "text-neutral-400")}>
          <History className="w-5 h-6" />
          <span className="text-[10px] font-bold">History</span>
        </button>
      </nav>

      {/* Transfer Modal */}
      <AnimatePresence>
        {showTransferModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Transfer to {showTransferModal}</h3>
                <button onClick={() => setShowTransferModal(null)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-6 h-6 text-neutral-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Recipient Details</label>
                  <input 
                    type="text" 
                    placeholder={showTransferModal === 'BTC Wallet' ? "Enter BTC Address" : "Enter Account Number / Phone"}
                    className="w-full bg-neutral-50 p-4 rounded-2xl outline-none border border-transparent focus:border-neutral-200 transition-all font-medium"
                    id="dest-input"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Amount ({showTransferModal === 'BTC Wallet' ? 'BTC' : 'MYR'})</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="0.00"
                      className="w-full bg-neutral-50 p-4 rounded-2xl outline-none border border-transparent focus:border-neutral-200 transition-all text-2xl font-bold"
                      id="amount-input"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-neutral-400">
                      {showTransferModal === 'BTC Wallet' ? 'BTC' : 'MYR'}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-2 font-medium">
                    Available: {showTransferModal === 'BTC Wallet' ? `${profile?.balanceBTC.toFixed(8)} BTC` : `RM ${profile?.balanceMYR.toFixed(2)}`}
                  </p>
                </div>

                <button 
                  onClick={() => {
                    const dest = (document.getElementById('dest-input') as HTMLInputElement).value;
                    const amt = parseFloat((document.getElementById('amount-input') as HTMLInputElement).value);
                    if (dest && amt > 0) {
                      if (showTransferModal === 'BTC Wallet') {
                        handleBTCTransfer(dest, amt);
                      } else {
                        handleTransfer(showTransferModal, dest, amt);
                      }
                    }
                  }}
                  className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold hover:bg-neutral-800 transition-colors shadow-lg"
                >
                  Send Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

