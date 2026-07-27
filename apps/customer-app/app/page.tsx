'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  Search, 
  ShoppingBag, 
  Plus, 
  Minus, 
  LogOut, 
  Loader2, 
  CheckCircle, 
  Compass, 
  CreditCard, 
  ChevronRight,
  TrendingUp,
  MapPin,
  Clock,
  ChevronLeft
} from 'lucide-react';
import { isMockMode, MockDatabase, supabase } from '../lib/supabase';
import { isFirebaseMock, auth, MockAuth } from '../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged } from 'firebase/auth';
import { Home, User } from 'lucide-react';

export default function CustomerApp() {
  // Session State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verificationId, setVerificationId] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // App Content State
  const [categories, setCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart State
  const [cart, setCart] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'COD'>('ONLINE');

  // Active Order State (Realtime)
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [orderMessage, setOrderMessage] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [activeFooterTab, setActiveFooterTab] = useState<'home' | 'cart' | 'profile'>('home');
  const [showAddressSetup, setShowAddressSetup] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempAddress, setTempAddress] = useState('');
  const [deliveryAddressInput, setDeliveryAddressInput] = useState('');

  // Load Menu Data and verify active sessions
  useEffect(() => {
    // Check local session
    const savedUser = MockAuth.getSessionUser();
    if (savedUser) {
      setUser(savedUser);
      // Check address
      const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
      const userProfile = savedProfiles[savedUser.phoneNumber];
      if (!userProfile?.address) {
        setShowAddressSetup(true);
      } else {
        setShowAddressSetup(false);
        setDeliveryAddressInput(userProfile.address);
      }
      // Fetch active order if any
      const savedOrders = MockDatabase.getOrders();
      const pendingOrder = savedOrders.find(
        (o: any) => o.customer_phone === savedUser.phoneNumber && 
        !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
      );
      if (pendingOrder) {
        setActiveOrder(pendingOrder);
        setShowTracking(true);
      }
    }

    if (!isFirebaseMock && auth) {
      const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser);
          // Check address
          const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
          const userProfile = savedProfiles[firebaseUser.phoneNumber];
          if (!userProfile?.address) {
            setShowAddressSetup(true);
          } else {
            setShowAddressSetup(false);
            setDeliveryAddressInput(userProfile.address);
          }
          const savedOrders = MockDatabase.getOrders();
          const pendingOrder = savedOrders.find(
            (o: any) => o.customer_phone === firebaseUser.phoneNumber && 
            !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
          );
          if (pendingOrder) {
            setActiveOrder(pendingOrder);
            setShowTracking(true);
          }
        } else {
          setUser(null);
        }
      });
      return () => unsubscribeAuth();
    }

    // Load initial mock menu items
    setCategories(MockDatabase.getCategories());
    setMenuItems(MockDatabase.getMenuItems());
    
    // Fetch live db if not in Mock Mode
    if (!isMockMode) {
      fetchLiveDb();
    }
  }, []);

  // Sync address input when accessing profile page
  useEffect(() => {
    if (activeFooterTab === 'profile' && user) {
      const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
      const profile = savedProfiles[user.phoneNumber] || { name: '', address: '' };
      setTempName(profile.name || '');
      setTempAddress(profile.address || '');
    }
  }, [activeFooterTab, user]);

  // Report live user activity & cart status for admin auditing
  useEffect(() => {
    if (!user) return;
    
    const reportActivity = () => {
      const activeUsers = MockDatabase.getStorage<Record<string, { name: string; last_active: string; cart: any[]; current_tab: string }>>('mock_user_activity', {});
      const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
      const profile = savedProfiles[user.phoneNumber] || { name: 'Guest User', address: '' };
      
      activeUsers[user.phoneNumber] = {
        name: profile.name,
        last_active: new Date().toISOString(),
        cart: cart,
        current_tab: activeFooterTab
      };
      MockDatabase.setStorage('mock_user_activity', activeUsers);
    };

    reportActivity();
    const interval = setInterval(reportActivity, 4000); // sync every 4 seconds
    return () => clearInterval(interval);
  }, [user, cart, activeFooterTab]);

  // Listen for realtime menu & category updates in mock mode
  useEffect(() => {
    if (!isMockMode) return;

    const listener = (event: any) => {
      if (event.detail.key === 'mock_categories') {
        setCategories(event.detail.value);
      }
      if (event.detail.key === 'mock_menu_items') {
        setMenuItems(event.detail.value);
      }
    };
    window.addEventListener('mock-db-update', listener);
    return () => window.removeEventListener('mock-db-update', listener);
  }, []);

  // Request permission for Web Push Notifications on startup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Trigger web notification when active order status updates
  useEffect(() => {
    if (!activeOrder) return;
    const prevStatusKey = `order_prev_status_${activeOrder.id}`;
    const previousStatus = localStorage.getItem(prevStatusKey);
    if (previousStatus && previousStatus !== activeOrder.status) {
      if ('Notification' in window && Notification.permission === 'granted') {
        let cleanStatus = activeOrder.status.replace(/_/g, ' ');
        new Notification('Zeeshans Feast Update', {
          body: `Your order is now: ${cleanStatus}!`,
          tag: activeOrder.id,
          requireInteraction: true
        });
      }
    }
    localStorage.setItem(prevStatusKey, activeOrder.status);
  }, [activeOrder?.status, activeOrder?.id]);

  const fetchLiveDb = async () => {
    try {
      const { data: cats } = await supabase.from('categories').select('*');
      if (cats && cats.length > 0) setCategories(cats);
      
      const { data: items } = await supabase.from('menu_items').select('*');
      if (items && items.length > 0) setMenuItems(items);
    } catch (err) {
      console.error('Error fetching live Supabase data: ', err);
    }
  };

  // Realtime subscription setup
  useEffect(() => {
    if (!activeOrder) return;

    if (isMockMode) {
      // Mock db polling / event listener
      const unsubscribe = MockDatabase.subscribeToOrder(activeOrder.id, (updatedOrder) => {
        setActiveOrder(updatedOrder);
      });
      return () => unsubscribe();
    } else {
      // Supabase realtime subscription
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrder.id}` },
          (payload: any) => {
            setActiveOrder(payload.new);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeOrder?.id]);

  // Auth Functions
  const setupRecaptcha = () => {
    if (typeof window === 'undefined' || !auth) return;
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {}
      });
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setLoading(true);
    setAuthError('');

    if (isFirebaseMock) {
      try {
        const verifier = await MockAuth.sendOTP(phoneNumber);
        setVerificationId(verifier);
      } catch (err: any) {
        setAuthError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      try {
        setupRecaptcha();
        const appVerifier = (window as any).recaptchaVerifier;
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        setVerificationId(confirmationResult);
      } catch (err: any) {
        setAuthError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || !verificationId) return;
    setLoading(true);
    setAuthError('');

    try {
      const result = await verificationId.confirm(otpCode);
      const loggedUser = result.user;
      setUser(loggedUser);
      
      // Check address
      const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
      const userProfile = savedProfiles[loggedUser.phoneNumber];
      if (!userProfile?.address) {
        setShowAddressSetup(true);
      } else {
        setShowAddressSetup(false);
        setDeliveryAddressInput(userProfile.address);
      }

      // Try to re-bind any existing active orders
      const savedOrders = MockDatabase.getOrders();
      const pendingOrder = savedOrders.find(
        (o: any) => o.customer_phone === loggedUser.phoneNumber && 
        !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
      );
      if (pendingOrder) {
        setActiveOrder(pendingOrder);
        setShowTracking(true);
      }
    } catch (err: any) {
      setAuthError('Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddress = () => {
    if (!nameInput.trim() || !addressInput.trim() || !user) return;
    const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
    const updated = { ...savedProfiles, [user.phoneNumber]: { name: nameInput, address: addressInput } };
    MockDatabase.setStorage('mock_user_profiles', updated);
    setDeliveryAddressInput(addressInput);
    setShowAddressSetup(false);
  };

  const handleUpdateAddressProfile = () => {
    if (!tempName.trim() || !tempAddress.trim() || !user) return;
    const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
    const updated = { ...savedProfiles, [user.phoneNumber]: { name: tempName, address: tempAddress } };
    MockDatabase.setStorage('mock_user_profiles', updated);
    setDeliveryAddressInput(tempAddress);
    setIsEditingAddress(false);
  };

  const handleLogout = () => {
    if (user) {
      const activeUsers = MockDatabase.getStorage<Record<string, any>>('mock_user_activity', {});
      delete activeUsers[user.phoneNumber];
      MockDatabase.setStorage('mock_user_activity', activeUsers);
    }
    MockAuth.logout();
    setUser(null);
    setActiveOrder(null);
    setCart([]);
  };

  // Cart Management
  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItem.id === item.id);
      if (existing) {
        return prev.map(i => i.menuItem.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.menuItem.id === itemId) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : null;
        }
        return i;
      }).filter(Boolean) as any[];
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.menuItem.price * item.quantity), 0);

  // Order Submission
  const submitOrder = async () => {
    if (cart.length === 0 || !user) return;
    setCheckingOut(true);

    const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
    const profile = savedProfiles[user.phoneNumber || phoneNumber] || { name: 'Guest User', address: 'No address' };

    const newOrder = {
      id: 'ord_' + Math.random().toString(36).substr(2, 9),
      customer_phone: user.phoneNumber || phoneNumber,
      customer_name: profile.name,
      customer_address: deliveryAddressInput || profile.address,
      payment_method: paymentMethod,
      items: cart,
      total_amount: cartTotal,
      status: 'PENDING_ACCEPTANCE',
      created_at: new Date().toISOString()
    };

    if (isMockMode) {
      MockDatabase.saveOrder(newOrder);
      setActiveOrder(newOrder);
      setShowTracking(true);
      setCart([]);
      setIsCartOpen(false);
      setCheckingOut(false);
    } else {
      try {
        const { data, error } = await supabase
          .from('orders')
          .insert([newOrder])
          .select()
          .single();

        if (error) throw error;
        setActiveOrder(data || newOrder);
        setShowTracking(true);
        setCart([]);
        setIsCartOpen(false);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setCheckingOut(false);
      }
    }
  };

  const triggerPaymentMock = () => {
    setLoading(true);
    setTimeout(() => {
      const updatedOrder = { ...activeOrder, status: 'PAID', payment_id: 'pay_' + Math.random().toString(36).substr(2, 9) };
      MockDatabase.saveOrder(updatedOrder);
      setActiveOrder(updatedOrder);
      setLoading(false);
    }, 1500);
  };

  // Filter Items
  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto no-scrollbar pb-24">
      {/* Recaptcha verification root */}
      <div id="recaptcha-container"></div>

      {/* HEADER BAR */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-[#1a1a1f] sticky top-0 bg-[#0d0d0e]/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-black shadow-md shadow-amber-500/20">
            Z
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-white">ZEESHANS</h1>
            <p className="text-[10px] text-zinc-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Live Kitchen
            </p>
          </div>
        </div>

        {user && (
          <button 
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-zinc-800/50 text-zinc-400 transition-colors"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        )}
      </header>

      {/* LOGIN OR MAIN SCREEN */}
      {!user ? (
        <div className="flex-1 flex flex-col justify-center px-6 py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-white mb-2">Welcome to Zeeshans</h2>
            <p className="text-sm text-zinc-400">Authenticate with your phone number to check our menu and order.</p>
          </div>

          <div className="glass p-6 rounded-2xl border border-zinc-800">
            {!verificationId ? (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Phone Number</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500 text-sm">+91</span>
                    <input 
                      type="tel" 
                      placeholder="9876543210" 
                      value={phoneNumber} 
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-[#16161b] border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-all text-sm"
                    />
                  </div>
                </div>

                {authError && <p className="text-xs text-red-500 mt-1">{authError}</p>}

                <button 
                  type="submit" 
                  disabled={loading || phoneNumber.length < 10}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-semibold rounded-xl py-3 text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
                  Send Verification Code
                </button>
                <p className="text-[10px] text-zinc-500 text-center mt-2">
                  (Demo fallback enabled: Use any number + password code 123456)
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Enter Verification Code</label>
                  <input 
                    type="text" 
                    placeholder="123456" 
                    value={otpCode} 
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full bg-[#16161b] border border-zinc-800 rounded-xl py-3 px-4 text-white text-center tracking-widest font-bold placeholder-zinc-700 focus:outline-none focus:border-amber-500 transition-all text-base"
                    maxLength={6}
                  />
                </div>

                {authError && <p className="text-xs text-red-500 mt-1">{authError}</p>}

                <button 
                  type="submit" 
                  disabled={loading || otpCode.length < 6}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-semibold rounded-xl py-3 text-sm transition-all flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Verify & Enter
                </button>
                <button 
                  type="button" 
                  onClick={() => setVerificationId(null)}
                  className="w-full text-zinc-500 hover:text-white text-xs font-medium transition-colors pt-2"
                >
                  Change Phone Number
                </button>
              </form>
            )}
          </div>
        </div>
      ) : showAddressSetup ? (
        /* ADDRESS SETUP FOR NEW USERS */
        <div className="flex-1 flex flex-col justify-center px-6 py-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">Profile Setup</h2>
            <p className="text-xs text-zinc-500 mt-1">Please enter your details to complete registration.</p>
          </div>

          <div className="glass p-6 rounded-2xl border border-zinc-800 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Your Full Name</label>
              <input 
                type="text"
                placeholder="E.g., Jaswanth" 
                value={nameInput} 
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Delivery Address</label>
              <textarea 
                placeholder="Flat No, Building Name, Street, Landmark..." 
                value={addressInput} 
                onChange={(e) => setAddressInput(e.target.value)}
                className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500 transition-all h-20 resize-none"
              />
            </div>

            <button 
              onClick={handleSaveAddress}
              disabled={!nameInput.trim() || !addressInput.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              Save & Continue
            </button>
          </div>
        </div>
      ) : (activeOrder && showTracking) ? (
        /* LIVE ORDER TRACKING & PAYMENT AUTOMATION ROUTE */
        <div className="flex-1 flex flex-col justify-center px-6 py-6">
          <div className="flex items-center gap-2 mb-6">
            <button 
              onClick={() => setShowTracking(false)}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <ChevronLeft size={14} /> Back to Menu
            </button>
          </div>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <ShoppingBag size={32} />
            </div>
            <h2 className="text-xl font-bold text-white">Track Your Feast</h2>
            <p className="text-xs text-zinc-500 mt-1">Order ID: {activeOrder.id}</p>
          </div>

          <div className="glass p-6 rounded-2xl border border-zinc-800 space-y-6">
            {/* Status Visual Tracker */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${['PENDING_ACCEPTANCE', 'ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-amber-500 animate-ping' : 'bg-zinc-800'}`} />
                <span className={`text-sm ${activeOrder.status === 'PENDING_ACCEPTANCE' ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}>
                  Submitted & Awaiting Kitchen Approval
                </span>
              </div>
              <div className="w-0.5 h-6 bg-zinc-800 ml-1.5" />
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${['ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                <span className={`text-sm ${activeOrder.status === 'ACCEPTED' ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}>
                  {activeOrder.payment_method === 'COD' ? 'Accepted (Cash on Delivery)' : 'Accepted (Awaiting Payment Processing)'}
                </span>
              </div>
              <div className="w-0.5 h-6 bg-zinc-800 ml-1.5" />
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${['PAID', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                <span className={`text-sm ${activeOrder.status === 'PAID' || activeOrder.status === 'PREPARING' ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}>
                  Kitchen Preparing your Meal
                </span>
              </div>
              <div className="w-0.5 h-6 bg-zinc-800 ml-1.5" />
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${['READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                <span className={`text-sm ${['READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}`}>
                  Ready for Delivery / Pickup!
                </span>
              </div>
            </div>

            {/* AUTOMATED PAYMENT INTERACTION SCREEN TRIGGER */}
            {activeOrder.status === 'ACCEPTED' && (
              activeOrder.payment_method === 'COD' ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1">
                  <h4 className="text-sm font-bold text-emerald-400">Approved (COD)</h4>
                  <p className="text-[11px] text-zinc-400 font-semibold">Payment of ₹{activeOrder.total_amount.toFixed(2)} will be collected in cash upon delivery.</p>
                  <p className="text-[10px] text-zinc-500 font-medium">Awaiting kitchen staff to start cooking.</p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-bounce">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-amber-400">Payment Request Triggered</h4>
                      <p className="text-[11px] text-zinc-400">Complete payment to start preparation.</p>
                    </div>
                    <span className="text-sm font-bold text-white">₹{activeOrder.total_amount.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={triggerPaymentMock}
                    disabled={loading}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg py-2.5 text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    Pay Now with Razorpay / UPI
                  </button>
                </div>
              )
            )}

            {/* Post-payment Preparation */}
            {(activeOrder.status === 'PAID' || activeOrder.status === 'PREPARING') && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2 animate-bounce" />
                <h4 className="text-sm font-bold text-emerald-400">
                  {activeOrder.payment_method === 'COD' ? 'Preparing Order' : 'Order Paid successfully'}
                </h4>
                <p className="text-[11px] text-zinc-400 mt-1">Our chefs have started cooking your delicious dishes!</p>
              </div>
            )}

            {/* Rejected / Cancelled */}
            {(activeOrder.status === 'REJECTED' || activeOrder.status === 'CANCELLED') && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
                <h4 className="text-sm font-bold text-red-400">Order Rejected or Cancelled</h4>
                <p className="text-[11px] text-zinc-400 mt-1">Please try ordering again or contact management.</p>
                <button
                  onClick={() => setActiveOrder(null)}
                  className="mt-3 px-4 py-1.5 bg-zinc-800 text-white rounded-lg text-xs hover:bg-zinc-700 transition-colors"
                >
                  Go Back to Menu
                </button>
              </div>
            )}

            {activeOrder.status === 'COMPLETED' && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-emerald-400">Order Completed</h4>
                <p className="text-[11px] text-zinc-400 mt-1">Thank you for dining with Zeeshans!</p>
                <button
                  onClick={() => setActiveOrder(null)}
                  className="mt-3 px-4 py-1.5 bg-zinc-800 text-white rounded-lg text-xs hover:bg-zinc-700 transition-colors"
                >
                  Order Again
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB NAVIGATION SYSTEM */
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
            
            {/* HOME VIEW (MENU BROWSING) */}
            {activeFooterTab === 'home' && (
              <>
                {/* Hero Banner Card */}
                <div className="px-5 pt-4 pb-2">
                  <div className="relative rounded-2xl overflow-hidden h-36 flex items-end p-4 bg-gradient-to-t from-black via-black/40 to-transparent">
                    <img 
                      src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&auto=format&fit=crop&q=80" 
                      className="absolute inset-0 w-full h-full object-cover -z-10 brightness-[0.4]"
                      alt="Dining Room"
                    />
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                        EST. 2026
                      </span>
                      <h3 className="text-lg font-extrabold text-white">Luxurious Culinary Experience</h3>
                      <p className="text-xs text-zinc-300">Curated with premium handpicked ingredients.</p>
                    </div>
                  </div>
                </div>

                {/* Search bar */}
                <div className="px-5 py-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 text-zinc-500" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search favorite dishes..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#131317] border border-zinc-800/80 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                </div>

                {/* Categories Tab Scroll */}
                <div className="px-5 py-2 overflow-x-auto flex gap-2 no-scrollbar sticky top-[68px] bg-[#0d0d0e] z-30 pb-3">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${selectedCategory === 'all' ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10' : 'bg-zinc-900 text-zinc-400 border border-zinc-800/40 hover:bg-zinc-800/60'}`}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${selectedCategory === cat.id ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10' : 'bg-zinc-900 text-zinc-400 border border-zinc-800/40 hover:bg-zinc-800/60'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Menu Items Grid */}
                <div className="px-5 space-y-4 flex-1">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => (
                      <div 
                        key={item.id}
                        className="glass p-3.5 rounded-xl border border-zinc-800/50 flex gap-4 hover:border-zinc-700/50 transition-colors"
                      >
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900">
                          <img 
                            src={item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80'} 
                            alt={item.name} 
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 flex flex-col justify-between py-0.5">
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="text-xs font-bold text-white line-clamp-1">{item.name}</h4>
                              <span className="text-xs font-bold text-amber-500">₹{parseFloat(item.price).toFixed(2)}</span>
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/30">
                            <span className="text-[9px] text-zinc-500 flex items-center gap-1">
                              <Clock size={10} /> 15-20 min
                            </span>

                            {cart.find(i => i.menuItem.id === item.id) ? (
                              <div className="flex items-center bg-zinc-900 rounded-md border border-zinc-800 px-1 py-0.5 gap-2">
                                <button 
                                  onClick={() => updateQuantity(item.id, -1)}
                                  className="p-1 text-zinc-400 hover:text-white"
                                >
                                  <Minus size={10} />
                                </button>
                                <span className="text-[11px] font-bold text-white">
                                  {cart.find(i => i.menuItem.id === item.id).quantity}
                                </span>
                                <button 
                                  onClick={() => updateQuantity(item.id, 1)}
                                  className="p-1 text-zinc-400 hover:text-white"
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(item)}
                                disabled={!item.is_available}
                                className="bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black text-[10px] font-bold px-3 py-1 rounded-md transition-colors flex items-center gap-1"
                              >
                                <Plus size={10} /> Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No items available in this category.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* CART VIEW */}
            {activeFooterTab === 'cart' && (
              <div className="p-5 space-y-6">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShoppingBag size={18} className="text-amber-500" /> My Basket
                </h3>

                {cart.length === 0 ? (
                  <div className="text-center py-20 space-y-4 bg-zinc-950 border border-zinc-850 rounded-2xl">
                    <ShoppingBag className="mx-auto text-zinc-650" size={40} />
                    <h4 className="text-xs font-bold text-zinc-300">Your basket is empty</h4>
                    <p className="text-[10px] text-zinc-500">Go back to the menu to add items.</p>
                    <button 
                      onClick={() => setActiveFooterTab('home')}
                      className="px-4 py-2 bg-amber-500 text-black text-xs font-bold rounded-xl"
                    >
                      Browse Menu
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Cart Items List */}
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={item.menuItem.id} className="flex justify-between items-center bg-[#18181b] p-3 rounded-lg border border-zinc-850">
                          <div>
                            <h5 className="text-xs font-bold text-white">{item.menuItem.name}</h5>
                            <p className="text-[10px] text-amber-500 font-semibold mt-0.5">
                              ₹{parseFloat(item.menuItem.price).toFixed(2)}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => updateQuantity(item.menuItem.id, -1)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                            >
                              <Minus size={11} />
                            </button>
                            <span className="text-xs font-bold text-white">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.menuItem.id, 1)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Notes Input */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-zinc-400">Cooking notes / instructions</label>
                      <textarea
                        placeholder="E.g. Make it extra spicy, no onions..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-[#16161b] border border-zinc-855 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500/50 h-16 resize-none"
                      />
                    </div>

                    {/* Delivery Address Input */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-zinc-400">Delivery Address for this Order</label>
                      <textarea
                        placeholder="Flat No, Building Name, Street, Landmark..."
                        value={deliveryAddressInput}
                        onChange={(e) => setDeliveryAddressInput(e.target.value)}
                        className="w-full bg-[#16161b] border border-zinc-855 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500/50 h-16 resize-none"
                        required
                      />
                    </div>

                    {/* Payment Method Selector */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-semibold text-zinc-400">Payment Method</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('ONLINE')}
                          className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${paymentMethod === 'ONLINE' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-white'}`}
                        >
                          <CreditCard size={14} /> Pay Online
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('COD')}
                          className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${paymentMethod === 'COD' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-white'}`}
                        >
                          <ShoppingBag size={14} /> Cash on Delivery
                        </button>
                      </div>
                    </div>

                    {/* Totals & Submit */}
                    <div className="pt-4 border-t border-zinc-850 space-y-4">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Subtotal</span>
                        <span>₹{cartTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-white">
                        <span>Total Amount</span>
                        <span>₹{cartTotal.toFixed(2)}</span>
                      </div>

                      <button
                        onClick={submitOrder}
                        disabled={checkingOut}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-3.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                      >
                        {checkingOut && <Loader2 size={14} className="animate-spin" />}
                        Confirm and Place Order (₹{cartTotal.toFixed(2)})
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PROFILE VIEW */}
            {activeFooterTab === 'profile' && (
              <div className="p-5 space-y-6">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <User size={18} className="text-amber-500" /> My Profile
                </h3>

                {/* Profile Card */}
                <div className="glass p-5 rounded-2xl border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Phone Number</span>
                    <h4 className="text-sm font-bold text-white">{user.phoneNumber || 'Guest User'}</h4>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl transition-all text-xs font-bold flex items-center gap-1.5"
                  >
                    <LogOut size={14} /> Log Out
                  </button>
                </div>

                {/* Delivery Address Card */}
                <div className="glass p-5 rounded-2xl border border-zinc-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Profile Details</span>
                    <button
                      onClick={() => setIsEditingAddress(!isEditingAddress)}
                      className="text-xs text-amber-500 font-semibold hover:text-amber-600"
                    >
                      {isEditingAddress ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {isEditingAddress ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-semibold text-zinc-400 mb-1">Name</label>
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-zinc-400 mb-1">Address</label>
                        <textarea
                          value={tempAddress}
                          onChange={(e) => setTempAddress(e.target.value)}
                          className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50 h-16 resize-none"
                        />
                      </div>
                      <button
                        onClick={handleUpdateAddressProfile}
                        className="bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Save Changes
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-zinc-500 text-[10px] font-medium block">Name</span>
                        <p className="text-white font-semibold">
                          {MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {})[user.phoneNumber]?.name || 'Not set'}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] font-medium block">Address</span>
                        <p className="text-zinc-300 leading-relaxed">
                          {MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {})[user.phoneNumber]?.address || 'No address added yet.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Order History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Order History</h4>
                  
                  {MockDatabase.getOrders().filter(o => o.customer_phone === user.phoneNumber).length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs bg-zinc-950 border border-zinc-850 rounded-2xl">
                      No orders placed yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {MockDatabase.getOrders()
                        .filter(o => o.customer_phone === user.phoneNumber)
                        .map((order) => (
                          <div key={order.id} className="bg-[#18181b] p-4 rounded-xl border border-zinc-850 space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">ID: {order.id}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${['COMPLETED'].includes(order.status) ? 'bg-emerald-500/10 text-emerald-400' : ['REJECTED', 'CANCELLED'].includes(order.status) ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                    {order.status}
                                  </span>
                                </div>
                                <span className="text-[10px] text-zinc-500">{new Date(order.created_at || Date.now()).toLocaleDateString()}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-bold text-white">₹{order.total_amount.toFixed(2)}</span>
                              </div>
                            </div>
                            
                            {/* Ordered Items List */}
                            {order.items && order.items.length > 0 && (
                              <div className="border-t border-zinc-850 pt-2 space-y-0.5">
                                {order.items.map((i: any, index: number) => (
                                  <div key={index} className="flex justify-between text-[10px] text-zinc-400">
                                    <span>{i.menuItem?.name || 'Item'} <strong className="text-zinc-300">x{i.quantity}</strong></span>
                                    <span>₹{(parseFloat(i.menuItem?.price || '0') * i.quantity).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Delivery Address */}
                            {order.customer_address && (
                              <div className="text-[10px] text-zinc-500 bg-zinc-950/45 p-2 rounded-lg border border-zinc-900/50 leading-relaxed">
                                <strong>Address:</strong> {order.customer_address}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ACTIVE ORDER TRACKER FLOAT BAR */}
          {activeOrder && !showTracking && (
            <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 w-full max-w-sm px-4 z-40">
              <button
                onClick={() => setShowTracking(true)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full py-4 px-6 flex items-center justify-between shadow-xl shadow-emerald-500/20 animate-pulse border border-emerald-600/30"
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-white">Order Active: {activeOrder.status}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-white">Track Feast</span>
                  <ChevronRight size={16} className="text-white" />
                </div>
              </button>
            </div>
          )}

          {/* BOTTOM NAVIGATION FOOTER */}
          <footer className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-[#0c0c0e]/95 backdrop-blur-md border-t border-[#1a1a1f] py-3 flex justify-around items-center z-45 shadow-xl">
            <button
              onClick={() => setActiveFooterTab('home')}
              className={`flex flex-col items-center gap-1 transition-colors ${activeFooterTab === 'home' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Home size={18} />
              <span className="text-[9px] font-bold">Home</span>
            </button>

            <button
              onClick={() => setActiveFooterTab('cart')}
              className={`flex flex-col items-center gap-1 relative transition-colors ${activeFooterTab === 'cart' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <ShoppingBag size={18} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-white text-[8px] font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center border border-[#0c0c0e]">
                  {cart.length}
                </span>
              )}
              <span className="text-[9px] font-bold">Cart</span>
            </button>

            <button
              onClick={() => setActiveFooterTab('profile')}
              className={`flex flex-col items-center gap-1 transition-colors ${activeFooterTab === 'profile' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <User size={18} />
              <span className="text-[9px] font-bold">Profile</span>
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
