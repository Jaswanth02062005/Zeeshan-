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
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

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
  const [selectedCategory, setSelectedCategory] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart State
  const [cart, setCart] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // Active Order State (Realtime)
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [orderMessage, setOrderMessage] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);

  // Load Menu Data and verify active sessions
  useEffect(() => {
    // Check local session
    const savedUser = MockAuth.getSessionUser();
    if (savedUser) {
      setUser(savedUser);
      // Fetch active order if any
      const savedOrders = MockDatabase.getOrders();
      const pendingOrder = savedOrders.find(
        (o: any) => o.customer_phone === savedUser.phoneNumber && 
        !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
      );
      if (pendingOrder) {
        setActiveOrder(pendingOrder);
      }
    }

    // Load initial mock menu items
    setCategories(MockDatabase.getCategories());
    setMenuItems(MockDatabase.getMenuItems());
    
    // Fetch live db if not in Mock Mode
    if (!isMockMode) {
      fetchLiveDb();
    }
  }, []);

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
      // Try to re-bind any existing active orders
      const savedOrders = MockDatabase.getOrders();
      const pendingOrder = savedOrders.find(
        (o: any) => o.customer_phone === loggedUser.phoneNumber && 
        !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
      );
      if (pendingOrder) {
        setActiveOrder(pendingOrder);
      }
    } catch (err: any) {
      setAuthError('Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
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

    const newOrder = {
      id: 'ord_' + Math.random().toString(36).substr(2, 9),
      customer_phone: user.phoneNumber || phoneNumber,
      items: cart,
      total_amount: cartTotal,
      status: 'PENDING_ACCEPTANCE',
      created_at: new Date().toISOString()
    };

    if (isMockMode) {
      MockDatabase.saveOrder(newOrder);
      setActiveOrder(newOrder);
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
    const matchesCategory = item.category_id === selectedCategory;
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
      ) : activeOrder ? (
        /* LIVE ORDER TRACKING & PAYMENT AUTOMATION ROUTE */
        <div className="flex-1 flex flex-col justify-center px-6 py-6">
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
                  Accepted (Awaiting Payment Processing)
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
            )}

            {/* Post-payment Preparation */}
            {(activeOrder.status === 'PAID' || activeOrder.status === 'PREPARING') && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2 animate-bounce" />
                <h4 className="text-sm font-bold text-emerald-400">Order Paid successfully</h4>
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
        /* MENU BROWSING VIEW */
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

      {/* FLOAT CART BAR */}
      {user && !activeOrder && cart.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-sm px-4 z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-full py-4 px-6 flex items-center justify-between shadow-xl shadow-amber-500/20 animate-bounce"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} />
              <span className="text-xs font-bold">{cart.length} {cart.length === 1 ? 'item' : 'items'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold">View Basket (₹{cartTotal.toFixed(2)})</span>
              <ChevronRight size={16} />
            </div>
          </button>
        </div>
      )}

      {/* CART SHEETS DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0f0f12] rounded-t-2xl border-t border-zinc-800 p-5 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShoppingBag size={16} /> My Basket
              </h3>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {/* Cart Items List */}
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.menuItem.id} className="flex justify-between items-center bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/40">
                  <div>
                    <h5 className="text-xs font-bold text-white">{item.menuItem.name}</h5>
                    <p className="text-[10px] text-amber-500 font-semibold mt-0.5">
                      ₹{parseFloat(item.menuItem.price).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => updateQuantity(item.menuItem.id, -1)}
                      className="p-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 rounded"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="text-xs font-bold text-white">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.menuItem.id, 1)}
                      className="p-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 rounded"
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
                className="w-full bg-[#15151a] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 h-16 resize-none"
              />
            </div>

            {/* Totals & Submit */}
            <div className="pt-3 border-t border-zinc-800 space-y-4">
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
          </div>
        </div>
      )}
    </div>
  );
}
