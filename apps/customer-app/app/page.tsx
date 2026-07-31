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
import { Home, User, X } from 'lucide-react';

const getCategoryEmoji = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('biryani')) return '🍲';
  if (n.includes('starter') || n.includes('appetizer')) return '🍢';
  if (n.includes('curry') || n.includes('gravy')) return '🍛';
  if (n.includes('bread') || n.includes('roti') || n.includes('naan')) return '🫓';
  if (n.includes('dessert') || n.includes('sweet')) return '🍰';
  if (n.includes('drink') || n.includes('beverage')) return '🥤';
  if (n.includes('rice')) return '🍚';
  return '🍽️';
};

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

  // Portion Customizer states
  const [customizingItem, setCustomizingItem] = useState<any>(null);
  const [selectedPortion, setSelectedPortion] = useState<'Half' | 'Full'>('Full');
  const [selectedSpice, setSelectedSpice] = useState<'Mild' | 'Medium' | 'Spicy'>('Medium');

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

  // Structured Address States (Setup Profile)
  const [flatNo, setFlatNo] = useState('');
  const [streetArea, setStreetArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');

  // Structured Address States (Edit Profile)
  const [tempFlatNo, setTempFlatNo] = useState('');
  const [tempStreetArea, setTempStreetArea] = useState('');
  const [tempLandmark, setTempLandmark] = useState('');
  const [tempPincode, setTempPincode] = useState('');

  const compileAddress = (flat: string, street: string, land: string, pin: string) => {
    return [flat.trim(), street.trim(), land.trim(), pin.trim()].filter(Boolean).join(', ');
  };

  const parseAddress = (fullAddress: string) => {
    const parts = fullAddress ? fullAddress.split(', ') : [];
    return {
      flat: parts[0] || '',
      street: parts[1] || '',
      landmark: parts[2] || '',
      pincode: parts[3] || ''
    };
  };

  // User Order History & Active Order state handlers
  const [ordersList, setOrdersList] = useState<any[]>([]);

  const fetchUserOrders = async (phone: string) => {
    if (isMockMode) {
      const savedOrders = MockDatabase.getOrders();
      setOrdersList(savedOrders.filter((o: any) => o.customer_phone === phone));
    } else {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_phone', phone)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) setOrdersList(data);
      } catch (err) {
        console.error('Error fetching user orders from Supabase:', err);
      }
    }
  };

  const fetchActiveOrder = async (phone: string) => {
    if (isMockMode) {
      const savedOrders = MockDatabase.getOrders();
      const pendingOrder = savedOrders.find(
        (o: any) => o.customer_phone === phone && 
        !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
      );
      if (pendingOrder) {
        setActiveOrder(pendingOrder);
        setShowTracking(true);
      }
    } else {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_phone', phone)
          .not('status', 'in', '("COMPLETED","CANCELLED","REJECTED")')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
          setActiveOrder(data[0]);
          setShowTracking(true);
        }
      } catch (err) {
        console.error('Error fetching active order:', err);
      }
    }
  };

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
      // Fetch active order & history
      fetchActiveOrder(savedUser.phoneNumber);
      fetchUserOrders(savedUser.phoneNumber);
    }

    if (!isFirebaseMock && auth) {
      const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser);
          // Check address
          const phone = firebaseUser.phoneNumber || '';
          const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
          const userProfile = phone ? savedProfiles[phone] : null;
          if (!userProfile?.address) {
            setShowAddressSetup(true);
          } else {
            setShowAddressSetup(false);
            setDeliveryAddressInput(userProfile.address);
          }
          if (phone) {
            fetchActiveOrder(phone);
            fetchUserOrders(phone);
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
      const parsed = parseAddress(profile.address || '');
      setTempFlatNo(parsed.flat);
      setTempStreetArea(parsed.street);
      setTempLandmark(parsed.landmark);
      setTempPincode(parsed.pincode);
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
      fetchActiveOrder(loggedUser.phoneNumber);
      fetchUserOrders(loggedUser.phoneNumber);
    } catch (err: any) {
      setAuthError('Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddress = () => {
    const combined = compileAddress(flatNo, streetArea, landmark, pincode);
    if (!nameInput.trim() || !combined.trim() || !user) return;
    const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
    const updated = { ...savedProfiles, [user.phoneNumber]: { name: nameInput, address: combined } };
    MockDatabase.setStorage('mock_user_profiles', updated);
    setDeliveryAddressInput(combined);
    setShowAddressSetup(false);
  };

  const handleUpdateAddressProfile = () => {
    const combined = compileAddress(tempFlatNo, tempStreetArea, tempLandmark, tempPincode);
    if (!tempName.trim() || !combined.trim() || !user) return;
    const savedProfiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
    const updated = { ...savedProfiles, [user.phoneNumber]: { name: tempName, address: combined } };
    MockDatabase.setStorage('mock_user_profiles', updated);
    setDeliveryAddressInput(combined);
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
    setOrdersList([]);
    setCart([]);
  };

  // Cart Management
  const getItemQuantityInCart = (itemId: string) => {
    return cart.filter(i => i.menuItem.id === itemId).reduce((sum, i) => sum + i.quantity, 0);
  };

  const addToCart = (item: any, portionOverride?: 'Half' | 'Full', spiceOverride?: 'Mild' | 'Medium' | 'Spicy') => {
    const isStarterOrMain = item.category_id === '1' || item.category_id === '2';
    // Trigger customizer sheet first if it has portions and no portion override is provided,
    // OR if it's a food item that has spice preferences and no spice override is provided.
    if ((item.has_portions || isStarterOrMain) && (!portionOverride && !spiceOverride)) {
      setCustomizingItem(item);
      setSelectedPortion(item.has_portions ? 'Full' : 'Full');
      setSelectedSpice('Medium');
      return;
    }

    const finalPortion = item.has_portions ? (portionOverride || 'Full') : null;
    const finalSpice = isStarterOrMain ? (spiceOverride || 'Medium') : null;

    setCart(prev => {
      const existing = prev.find(i => 
        i.menuItem.id === item.id && 
        i.portion === finalPortion && 
        i.spice === finalSpice
      );
      if (existing) {
        return prev.map(i => 
          (i.menuItem.id === item.id && i.portion === finalPortion && i.spice === finalSpice) 
            ? { ...i, quantity: i.quantity + 1 } 
            : i
        );
      }
      return [...prev, { menuItem: item, quantity: 1, portion: finalPortion, spice: finalSpice }];
    });
  };

  const updateQuantity = (
    itemId: string, 
    delta: number, 
    portion?: 'Half' | 'Full' | null, 
    spice?: 'Mild' | 'Medium' | 'Spicy' | null
  ) => {
    setCart(prev => {
      return prev.map(i => {
        // If portion/spice are supplied, match them exactly. Otherwise fall back to last item matches.
        const matchPortion = portion !== undefined ? i.portion === portion : true;
        const matchSpice = spice !== undefined ? i.spice === spice : true;
        
        if (i.menuItem.id === itemId && matchPortion && matchSpice) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : null;
        }
        return i;
      }).filter(Boolean) as any[];
    });
  };

  const cartTotal = cart.reduce((sum, item) => {
    let activePrice = item.menuItem.offer_price !== null && item.menuItem.offer_price !== undefined
      ? parseFloat(item.menuItem.offer_price)
      : parseFloat(item.menuItem.price);
      
    if (item.portion === 'Half' && item.menuItem.price_half !== null && item.menuItem.price_half !== undefined) {
      activePrice = parseFloat(item.menuItem.price_half);
    } else if (item.portion === 'Full' && item.menuItem.price_full !== null && item.menuItem.price_full !== undefined) {
      activePrice = parseFloat(item.menuItem.price_full);
    }
    
    return sum + (activePrice * item.quantity);
  }, 0);

  const startersCategory = categories.find(c => c.name.toLowerCase().includes('starter'));
  const startersCategoryId = startersCategory ? startersCategory.id : '1';
  const recommendedStarters = menuItems.filter(item => 
    item.category_id === startersCategoryId && 
    item.is_available &&
    !cart.some(cartItem => cartItem.menuItem.id === item.id)
  );

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
      setOrdersList(prev => [newOrder, ...prev]);
      setShowTracking(true);
      setCart([]);
      setIsCartOpen(false);
      setCheckingOut(false);
    } else {
      try {
        const { id, ...supabaseOrder } = newOrder; // Omit client-generated 'ord_...' ID so Postgres generates a UUID!
        const { data, error } = await supabase
          .from('orders')
          .insert([supabaseOrder])
          .select()
          .single();

        if (error) throw error;
        const placedOrder = data || newOrder;
        setActiveOrder(placedOrder);
        setOrdersList(prev => [placedOrder, ...prev]);
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

  const triggerPaymentMock = async () => {
    setLoading(true);
    const payId = 'pay_' + Math.random().toString(36).substr(2, 9);
    const updatedOrder = { ...activeOrder, status: 'PAID', payment_id: payId };

    if (isMockMode) {
      setTimeout(() => {
        MockDatabase.saveOrder(updatedOrder);
        setActiveOrder(updatedOrder);
        setLoading(false);
      }, 500);
    } else {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'PAID', payment_id: payId })
          .eq('id', activeOrder.id);
        if (error) throw error;
        setActiveOrder(updatedOrder);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Filter Items
  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto no-scrollbar pb-24 relative bg-[#09090b]">
      {/* Ambient background glows */}
      <div className="ambient-glow" />
      <div className="ambient-glow-bottom" />

      {/* Recaptcha verification root */}
      <div id="recaptcha-container" className="relative z-50"></div>

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

      {!user ? (
        <div className="flex-1 flex flex-col justify-center px-6 py-12 relative overflow-hidden">
          {/* Ambient image background with linear vignettes */}
          <div className="absolute inset-0 z-0 bg-[url('https://images.unsplash.com/photo-1544025162-d76694265947?w=1000&auto=format&fit=crop&q=80')] bg-cover bg-center brightness-[0.2]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/80 via-[#09090b]/95 to-[#09090b] z-0" />
          
          <div className="relative z-10 space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-3xl font-extrabold text-white mb-2 tracking-wide font-sans uppercase">Welcome to Zeeshans</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">Authenticate with your phone number to check our menu and order your royal feast.</p>
            </div>

            <div className="glass-premium p-6 rounded-2xl border border-zinc-850">
              {!verificationId ? (
                <form onSubmit={handleSendOTP} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-450">Phone Number</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-zinc-400 text-sm font-bold border-r border-zinc-800/40 pr-3">+91</span>
                      <input 
                        type="tel" 
                        placeholder="9876543210" 
                        value={phoneNumber} 
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length <= 10) {
                            setPhoneNumber(val);
                          }
                        }}
                        maxLength={10}
                        className="w-full bg-[#0a0a0c]/80 border border-zinc-850 rounded-xl py-3 pl-16 pr-4 text-white placeholder-zinc-650 focus-glow-gold transition-all text-sm font-bold tracking-widest"
                      />
                    </div>
                  </div>

                  {authError && <p className="text-xs text-red-500 mt-1">{authError}</p>}

                  <button 
                    type="submit" 
                    disabled={loading || phoneNumber.length !== 10}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-900 disabled:text-zinc-650 text-black font-extrabold rounded-xl py-3.5 text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95 duration-200"
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />}
                    Send Verification Code
                  </button>
                  <p className="text-[9px] text-zinc-500 text-center mt-2 tracking-wider">
                    (Demo fallback enabled: Use any number + password code 123456)
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-450">Enter Verification Code</label>
                    <input 
                      type="text" 
                      placeholder="123456" 
                      value={otpCode} 
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full bg-[#0a0a0c]/80 border border-zinc-850 rounded-xl py-3 px-4 text-white text-center tracking-[0.4em] font-extrabold placeholder-zinc-700 focus-glow-gold transition-all text-base"
                      maxLength={6}
                    />
                  </div>

                  {authError && <p className="text-xs text-red-500 mt-1">{authError}</p>}

                  <button 
                    type="submit" 
                    disabled={loading || otpCode.length < 6}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-900 disabled:text-zinc-650 text-black font-extrabold rounded-xl py-3.5 text-xs transition-all flex items-center justify-center gap-2 active:scale-95 duration-200"
                  >
                    {loading && <Loader2 size={15} className="animate-spin" />}
                    Verify & Enter
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setVerificationId(null)}
                    className="w-full text-zinc-500 hover:text-white text-xs font-bold transition-colors pt-2 uppercase tracking-widest text-[9px]"
                  >
                    Change Phone Number
                  </button>
                </form>
              )}
            </div>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Flat / House No</label>
                <input 
                  type="text"
                  placeholder="Flat 402, Building A" 
                  value={flatNo} 
                  onChange={(e) => setFlatNo(e.target.value)}
                  className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Pincode</label>
                <input 
                  type="text"
                  placeholder="500033" 
                  value={pincode} 
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Street / Area</label>
              <input 
                type="text"
                placeholder="Jubilee Hills, Road No 10" 
                value={streetArea} 
                onChange={(e) => setStreetArea(e.target.value)}
                className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Landmark (Optional)</label>
              <input 
                type="text"
                placeholder="Opposite Metro Station" 
                value={landmark} 
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500 transition-all"
              />
            </div>

            <button 
              onClick={handleSaveAddress}
              disabled={!nameInput.trim() || !flatNo.trim() || !streetArea.trim() || !pincode.trim()}
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
            <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse border border-amber-500/25">
              <ShoppingBag size={32} />
            </div>
            <h2 className="text-xl font-bold text-white">Track Your Feast</h2>
            <p className="text-xs text-zinc-500 mt-1">Order ID: {activeOrder.id}</p>
          </div>

          <div className="glass p-6 rounded-2xl border border-zinc-800 space-y-6 shadow-xl">
            {/* Gamified Horizontal Progress Tracker */}
            <div className="p-4 bg-[#111115] border border-zinc-850 rounded-2xl relative mb-6">
              {/* Progress Line Background */}
              <div className="absolute top-[28px] left-[10%] right-[10%] h-[3px] bg-zinc-800 -z-0" />
              {/* Active Progress Line */}
              <div 
                className="absolute top-[28px] left-[10%] h-[3px] bg-amber-500 transition-all duration-700 -z-0" 
                style={{ 
                  width: activeOrder.status === 'PENDING_ACCEPTANCE' ? '0%' :
                         activeOrder.status === 'ACCEPTED' ? '33%' :
                         ['PAID', 'PREPARING'].includes(activeOrder.status) ? '66%' : '90%'
                }}
              />

              <div className="flex justify-between items-center relative z-10">
                {/* Step 1: Placed */}
                <div className="flex flex-col items-center gap-1.5 w-16">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${['PENDING_ACCEPTANCE', 'ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-amber-500 border-amber-400 text-black shadow-md shadow-amber-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                    📝
                  </div>
                  <span className="text-[9px] font-bold text-center text-zinc-300">Placed</span>
                </div>

                {/* Step 2: Accepted */}
                <div className="flex flex-col items-center gap-1.5 w-16">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${['ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-amber-500 border-amber-400 text-black shadow-md shadow-amber-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                    🤝
                  </div>
                  <span className="text-[9px] font-bold text-center text-zinc-300">Accepted</span>
                </div>

                {/* Step 3: Cooking */}
                <div className="flex flex-col items-center gap-1.5 w-16">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${['PAID', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-amber-500 border-amber-400 text-black shadow-md shadow-amber-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500'} ${['PAID', 'PREPARING'].includes(activeOrder.status) ? 'animate-pulse' : ''}`}>
                    🍳
                  </div>
                  <span className="text-[9px] font-bold text-center text-zinc-300">Cooking</span>
                </div>

                {/* Step 4: Dispatch */}
                <div className="flex flex-col items-center gap-1.5 w-16">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs transition-all ${['READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED'].includes(activeOrder.status) ? 'bg-emerald-500 border-emerald-400 text-black shadow-md shadow-emerald-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500'} ${['READY_FOR_PICKUP', 'DELIVERING'].includes(activeOrder.status) ? 'animate-bounce' : ''}`}>
                    🛵
                  </div>
                  <span className="text-[9px] font-bold text-center text-zinc-300">Out</span>
                </div>
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
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
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
                <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2" />
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

          {/* Help Support Panel */}
          <div className="mt-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <div>
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Need assistance?</h4>
              <p className="text-[10px] text-zinc-400 mt-0.5">Call kitchen staff directly for quick updates.</p>
            </div>
            <a 
              href="tel:+919876543210"
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <Phone size={12} /> Call Support
            </a>
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
                  <div className="relative rounded-2xl overflow-hidden h-40 flex items-end p-4 border border-zinc-800/40 shadow-2xl bg-gradient-to-t from-[#09090b] via-black/30 to-transparent">
                    <img 
                      src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&auto=format&fit=crop&q=80" 
                      className="absolute inset-0 w-full h-full object-cover -z-10 brightness-[0.35] scale-105 hover:scale-100 transition-transform duration-700"
                      alt="Dining Room"
                    />
                    <div className="space-y-1 z-10 w-full">
                      <div className="flex justify-between items-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-extrabold border border-amber-500/30 uppercase tracking-widest">
                          EST. 2026
                        </span>
                        <div className="flex gap-1 text-amber-500">
                          <span className="text-[10px] font-bold">★ 4.9 Rating</span>
                        </div>
                      </div>
                      <h3 className="text-xl font-extrabold text-white leading-tight mt-1">Luxurious Culinary Feast</h3>
                      <p className="text-[11px] text-zinc-300 flex items-center gap-1">
                        <MapPin size={10} className="text-amber-500" /> Handcrafted Royal Kitchen
                      </p>
                    </div>
                    {/* Shadow overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent -z-10" />
                  </div>
                </div>

                {/* Chef's Signature Section */}
                <div className="space-y-2.5 pt-2">
                  <div className="px-5 flex items-center justify-between">
                    <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-amber-500/90 flex items-center gap-1.5 glow-amber">
                      ✨ Chef's Royal Signatures
                    </h4>
                    <span className="text-[8px] bg-amber-500/10 text-amber-400 font-extrabold px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-wider">Must Try</span>
                  </div>
                  
                  <div className="flex gap-4 overflow-x-auto pb-3 pt-1 no-scrollbar px-5 scroll-smooth snap-x">
                    {menuItems.filter(item => item.is_available).slice(0, 4).map((item) => {
                      const isNonVeg = item.name.toLowerCase().includes('chicken') || 
                                        item.name.toLowerCase().includes('mutton') || 
                                        item.name.toLowerCase().includes('fish') ||
                                        item.name.toLowerCase().includes('egg') ||
                                        item.name.toLowerCase().includes('kebab');
                      return (
                        <div 
                          key={item.id} 
                          className="flex-shrink-0 w-[200px] bg-zinc-950/60 border border-zinc-850/80 rounded-2xl p-3 flex flex-col justify-between hover:border-amber-500/30 transition-all snap-start glass relative group active:scale-95 duration-200"
                        >
                          <div className="space-y-2.5">
                            {item.image_url && (
                              <div className="w-full h-24 rounded-xl overflow-hidden relative bg-zinc-900 border border-zinc-900/60">
                                <img 
                                  src={item.image_url} 
                                  alt={item.name} 
                                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" 
                                />
                                <span className="absolute top-1.5 left-1.5 bg-zinc-950/80 text-amber-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-widest">
                                  Signature
                                </span>
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1">
                                <span className={`w-2.5 h-2.5 border flex items-center justify-center flex-shrink-0 rounded-[2px] ${isNonVeg ? 'border-red-500' : 'border-emerald-500'}`}>
                                  <span className={`w-1 h-1 rounded-full ${isNonVeg ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                                </span>
                                <h5 className="text-[11px] font-bold text-white line-clamp-1 leading-snug">{item.name}</h5>
                              </div>
                              <p className="text-[9px] text-zinc-500 line-clamp-1 mt-0.5 font-normal leading-relaxed">{item.description}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-900/80">
                            <span className="text-[11px] font-extrabold text-amber-500 glow-amber">
                              ₹{parseFloat(item.offer_price || item.price).toFixed(2)}
                            </span>
                            
                            {getItemQuantityInCart(item.id) > 0 ? (
                              <div className="flex items-center bg-zinc-950 rounded border border-zinc-850 px-1 py-0.5 gap-1.5">
                                <button 
                                  onClick={() => updateQuantity(item.id, -1)}
                                  className="p-0.5 text-zinc-400 hover:text-white"
                                >
                                  <Minus size={8} />
                                </button>
                                <span className="text-[10px] font-bold text-white w-3 text-center">
                                  {getItemQuantityInCart(item.id)}
                                </span>
                                <button 
                                  onClick={() => addToCart(item)}
                                  className="p-0.5 text-zinc-400 hover:text-white"
                                >
                                  <Plus size={8} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(item)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black text-[9px] font-black rounded transition-all flex items-center gap-0.5 shadow-sm shadow-amber-500/10"
                              >
                                <Plus size={9} /> Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Search bar */}
                <div className="px-5 py-2">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 text-zinc-500" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search mouth-watering dishes..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#111115] border border-zinc-800/60 rounded-xl py-3 pl-11 pr-10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all duration-200"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-3 text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800/40 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Categories Tab Scroll */}
                <div className="px-5 py-2 overflow-x-auto flex gap-2 no-scrollbar sticky top-[68px] bg-[#09090b]/90 backdrop-blur-md z-30 pb-3">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 transform active:scale-95 flex items-center gap-1.5 ${selectedCategory === 'all' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-extrabold scale-105' : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800/30 hover:bg-zinc-800/60'}`}
                  >
                    🍽️ All Menu
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 transform active:scale-95 flex items-center gap-1.5 ${selectedCategory === cat.id ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-extrabold scale-105' : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800/30 hover:bg-zinc-800/60'}`}
                    >
                      <span>{getCategoryEmoji(cat.name)}</span> {cat.name}
                    </button>
                  ))}
                </div>

                {/* Menu Items Grid */}
                <div className="px-5 space-y-3.5 flex-1">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      const isNonVeg = item.name.toLowerCase().includes('chicken') || 
                                        item.name.toLowerCase().includes('mutton') || 
                                        item.name.toLowerCase().includes('fish') ||
                                        item.name.toLowerCase().includes('egg') ||
                                        item.name.toLowerCase().includes('kebab') ||
                                        item.name.toLowerCase().includes('tandoori');
                      return (
                        <div 
                          key={item.id}
                          className="glass p-3 rounded-xl border border-zinc-850 flex gap-4 hover:border-amber-500/30 transition-all duration-300 relative group"
                        >
                          <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-950 border border-zinc-900 relative">
                            <img 
                              src={item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80'} 
                              alt={item.name} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {item.offer_price !== null && item.offer_price !== undefined && (
                              <span className="absolute top-1 left-1 bg-amber-500 text-black text-[8px] font-extrabold px-1 rounded uppercase tracking-wider shadow shadow-black/50">
                                Offer
                              </span>
                            )}
                          </div>

                          <div className="flex-1 flex flex-col justify-between py-0.5">
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    {/* Veg / Non-veg dot indicator */}
                                    <span className={`w-3.5 h-3.5 border flex items-center justify-center flex-shrink-0 rounded-[3px] ${isNonVeg ? 'border-red-500' : 'border-emerald-500'}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${isNonVeg ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                                    </span>
                                    <h4 className="text-[13px] font-bold text-white line-clamp-1 leading-snug">{item.name}</h4>
                                  </div>
                                </div>
                                {item.offer_price !== null && item.offer_price !== undefined ? (
                                  <div className="flex flex-col items-end">
                                    <span className="line-through text-zinc-500 text-[9px] font-normal leading-none">₹{parseFloat(item.price).toFixed(2)}</span>
                                    <span className="text-xs font-extrabold text-amber-500 mt-0.5">₹{parseFloat(item.offer_price).toFixed(2)}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs font-extrabold text-amber-500">₹{parseFloat(item.price).toFixed(2)}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-450 mt-1 line-clamp-2 leading-relaxed font-normal">
                                {item.description}
                              </p>
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-900/60">
                              <span className="text-[9px] text-zinc-500 flex items-center gap-1 font-medium">
                                <Clock size={10} className="text-amber-500/80" /> 15-20 mins
                              </span>

                              {getItemQuantityInCart(item.id) > 0 ? (
                                <div className="flex items-center bg-zinc-950 rounded-md border border-zinc-850 px-1 py-0.5 gap-2">
                                  <button 
                                    onClick={() => updateQuantity(item.id, -1)}
                                    className="p-1 text-zinc-400 hover:text-white"
                                  >
                                    <Minus size={10} />
                                  </button>
                                  <span className="text-[11px] font-bold text-white w-4 text-center">
                                    {getItemQuantityInCart(item.id)}
                                  </span>
                                  <button 
                                    onClick={() => addToCart(item)}
                                    className="p-1 text-zinc-400 hover:text-white"
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(item)}
                                  disabled={!item.is_available}
                                  className="bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-900 disabled:text-zinc-650 text-black text-[10px] font-extrabold px-3 py-1.5 rounded-md transition-all flex items-center gap-0.5 active:scale-95 shadow shadow-amber-500/10"
                                >
                                  <Plus size={10} /> Add
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-16 text-zinc-500 text-xs">
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
                    {/* Free Delivery Goal Tracker */}
                    {cartTotal < 500 ? (
                      <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                        <div className="flex justify-between text-[11px] font-bold text-amber-400">
                          <span>Add ₹{(500 - cartTotal).toFixed(2)} more for FREE Delivery!</span>
                          <span>₹{cartTotal.toFixed(0)}/₹500</span>
                        </div>
                        <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-amber-500 h-1.5 rounded-full transition-all duration-500" 
                            style={{ width: `${(cartTotal / 500) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-[11px] font-bold text-emerald-400">
                        <span>🎉 Congratulations! You've unlocked FREE Premium Delivery!</span>
                      </div>
                    )}

                    {/* Cart Items List */}
                    <div className="space-y-3">
                      {cart.map((item) => {
                        let activePrice = item.menuItem.offer_price !== null && item.menuItem.offer_price !== undefined
                          ? parseFloat(item.menuItem.offer_price)
                          : parseFloat(item.menuItem.price);
                          
                        if (item.portion === 'Half' && item.menuItem.price_half !== null && item.menuItem.price_half !== undefined) {
                          activePrice = parseFloat(item.menuItem.price_half);
                        } else if (item.portion === 'Full' && item.menuItem.price_full !== null && item.menuItem.price_full !== undefined) {
                          activePrice = parseFloat(item.menuItem.price_full);
                        }

                        const uniqueKey = `${item.menuItem.id}-${item.portion || 'none'}-${item.spice || 'none'}`;
                        
                        return (
                          <div key={uniqueKey} className="flex justify-between items-center bg-[#111115] p-3 rounded-lg border border-zinc-850">
                            <div>
                              <h5 className="text-xs font-bold text-white">
                                {item.menuItem.name}
                                {(item.portion || item.spice) && (
                                  <span className="text-[9px] text-zinc-400 font-medium block mt-0.5">
                                    {[item.portion ? `${item.portion} Portion` : null, item.spice ? `${item.spice} Spice` : null].filter(Boolean).join(' • ')}
                                  </span>
                                )}
                              </h5>
                              <p className="text-[10px] text-amber-500 font-semibold mt-0.5">
                                <span>₹{activePrice.toFixed(2)}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => updateQuantity(item.menuItem.id, -1, item.portion, item.spice)}
                                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="text-xs font-bold text-white w-4 text-center">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.menuItem.id, 1, item.portion, item.spice)}
                                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Premium Starter Recommendations */}
                    {recommendedStarters.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                            <TrendingUp size={12} className="text-amber-500" /> Complete Your Feast
                          </h4>
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">Popular Add-ons</span>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-5 px-5 scroll-smooth snap-x">
                          {recommendedStarters.map((item) => {
                            const price = item.offer_price !== null && item.offer_price !== undefined ? item.offer_price : item.price;
                            const hasOffer = item.offer_price !== null && item.offer_price !== undefined;
                            return (
                              <div key={item.id} className="flex-shrink-0 w-[180px] bg-zinc-950/60 border border-zinc-850/80 rounded-xl p-2.5 flex flex-col justify-between hover:border-amber-500/30 transition-all snap-start glass">
                                <div className="space-y-2">
                                  {item.image_url && (
                                    <div className="w-full h-20 rounded-lg overflow-hidden relative bg-zinc-900 border border-zinc-800/40">
                                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-300" />
                                      {hasOffer && (
                                        <span className="absolute top-1 left-1 bg-amber-500 text-black text-[8px] font-extrabold px-1 rounded uppercase">Offer</span>
                                      )}
                                    </div>
                                  )}
                                  <div>
                                    <h5 className="text-[11px] font-bold text-white line-clamp-1">{item.name}</h5>
                                    {item.description && (
                                      <p className="text-[9px] text-zinc-500 line-clamp-1 mt-0.5">{item.description}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-900/60">
                                  <div className="text-[10px] font-extrabold text-amber-500">
                                    ₹{parseFloat(price).toFixed(2)}
                                  </div>
                                  <button
                                    onClick={() => addToCart(item)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black text-[10px] font-extrabold rounded-lg transition-all flex items-center gap-0.5 shadow-sm shadow-amber-500/10"
                                  >
                                    <Plus size={10} /> Add
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Notes Input */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-semibold text-zinc-400">Cooking notes / instructions</label>
                      <textarea
                        placeholder="E.g. Make it extra spicy, no onions..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-[#111115] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500/50 h-16 resize-none"
                      />
                      {/* Quick Note Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {['Spicy 🌶️', 'No Onion 🧅', 'Less Oil 💧', 'No Cutlery 🍴', 'Serve Hot 🔥'].map((tag) => {
                          const isSelected = notes.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setNotes(prev => prev.replace(tag, '').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim());
                                } else {
                                  setNotes(prev => prev ? `${prev}, ${tag}` : tag);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all ${isSelected ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10' : 'bg-zinc-900 text-zinc-400 border border-zinc-800/40 hover:text-white'}`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Delivery Address Input */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-zinc-400">Delivery Address for this Order</label>
                      <textarea
                        placeholder="Flat No, Building Name, Street, Landmark..."
                        value={deliveryAddressInput}
                        onChange={(e) => setDeliveryAddressInput(e.target.value)}
                        className="w-full bg-[#111115] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-amber-500/50 h-16 resize-none"
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-semibold text-zinc-400 mb-1">Flat / House No</label>
                          <input
                            type="text"
                            value={tempFlatNo}
                            onChange={(e) => setTempFlatNo(e.target.value)}
                            className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-semibold text-zinc-400 mb-1">Pincode</label>
                          <input
                            type="text"
                            value={tempPincode}
                            onChange={(e) => setTempPincode(e.target.value)}
                            className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-zinc-400 mb-1">Street / Area</label>
                        <input
                          type="text"
                          value={tempStreetArea}
                          onChange={(e) => setTempStreetArea(e.target.value)}
                          className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-zinc-400 mb-1">Landmark (Optional)</label>
                        <input
                          type="text"
                          value={tempLandmark}
                          onChange={(e) => setTempLandmark(e.target.value)}
                          className="w-full bg-[#16161b] border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <button
                        onClick={handleUpdateAddressProfile}
                        disabled={!tempName.trim() || !tempFlatNo.trim() || !tempStreetArea.trim() || !tempPincode.trim()}
                        className="bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-650 text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
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
                  
                  {ordersList.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs bg-zinc-950 border border-zinc-850 rounded-2xl">
                      No orders placed yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ordersList
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

                            {/* Delivery Details */}
                            <div className="text-[10px] text-zinc-500 bg-zinc-950/45 p-2.5 rounded-lg border border-zinc-900/50 space-y-1 leading-relaxed mt-2">
                              {order.customer_name && (
                                <div>
                                  <strong>Receiver Name:</strong> <span className="text-zinc-300">{order.customer_name}</span>
                                </div>
                              )}
                              {order.customer_address && (
                                <div>
                                  <strong>Delivered To:</strong> <span className="text-zinc-300">{order.customer_address}</span>
                                </div>
                              )}
                            </div>
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
          <footer className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-[90%] max-w-sm glass-premium border border-zinc-800/60 py-3.5 px-6 rounded-2xl flex justify-around items-center z-45 shadow-2xl">
            <button
              onClick={() => setActiveFooterTab('home')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 active:scale-90 ${activeFooterTab === 'home' ? 'text-amber-500 scale-105' : 'text-zinc-550 hover:text-zinc-300'}`}
            >
              <Home size={18} className={activeFooterTab === 'home' ? 'drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]' : ''} />
              <span className="text-[9px] font-extrabold uppercase tracking-wider">Home</span>
            </button>

            <button
              onClick={() => setActiveFooterTab('cart')}
              className={`flex flex-col items-center gap-1 relative transition-all duration-300 active:scale-90 ${activeFooterTab === 'cart' ? 'text-amber-500 scale-105' : 'text-zinc-550 hover:text-zinc-300'}`}
            >
              <ShoppingBag size={18} className={activeFooterTab === 'cart' ? 'drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]' : ''} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-2.5 bg-amber-500 text-black text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-[#0d0d0e] shadow-md shadow-amber-500/20">
                  {cart.length}
                </span>
              )}
              <span className="text-[9px] font-extrabold uppercase tracking-wider">Cart</span>
            </button>

            <button
              onClick={() => setActiveFooterTab('profile')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 active:scale-90 ${activeFooterTab === 'profile' ? 'text-amber-500 scale-105' : 'text-zinc-550 hover:text-zinc-300'}`}
            >
              <User size={18} className={activeFooterTab === 'profile' ? 'drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]' : ''} />
              <span className="text-[9px] font-extrabold uppercase tracking-wider">Profile</span>
            </button>
          </footer>
        </div>
      )}

      {/* CUSTOMIZER SHEET MODAL */}
      {customizingItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0c0c0e]/95 border-t border-zinc-850 p-6 space-y-6 shadow-2xl rounded-t-3xl pb-8 relative z-50">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">{customizingItem.name}</h3>
                <p className="text-[10px] text-zinc-550 mt-1 leading-relaxed">{customizingItem.description}</p>
              </div>
              <button 
                onClick={() => setCustomizingItem(null)}
                className="p-1.5 rounded-full bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400"
              >
                <X size={12} />
              </button>
            </div>

            {/* Portion Selection */}
            {customizingItem.has_portions && (
              <div className="space-y-2">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">Select Portion</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPortion('Half')}
                    className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center flex flex-col justify-center items-center gap-1 ${selectedPortion === 'Half' ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-glow' : 'bg-zinc-950/80 border-zinc-850/60 text-zinc-400'}`}
                  >
                    <span className="text-[11px] font-extrabold">Half Portion</span>
                    <span className="text-[9px] font-normal opacity-85">₹{parseFloat(customizingItem.price_half || customizingItem.price).toFixed(2)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPortion('Full')}
                    className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center flex flex-col justify-center items-center gap-1 ${selectedPortion === 'Full' ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-glow' : 'bg-zinc-950/80 border-zinc-850/60 text-zinc-400'}`}
                  >
                    <span className="text-[11px] font-extrabold">Full Portion</span>
                    <span className="text-[9px] font-normal opacity-85">₹{parseFloat(customizingItem.price_full || customizingItem.price).toFixed(2)}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Spice Selection */}
            {(customizingItem.category_id === '1' || customizingItem.category_id === '2') && (
              <div className="space-y-2">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">Select Spice Level</span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['Mild', 'Medium', 'Spicy'] as const).map((spice) => (
                    <button
                      key={spice}
                      type="button"
                      onClick={() => setSelectedSpice(spice)}
                      className={`py-2 px-3 rounded-lg border text-[10px] font-extrabold transition-all text-center ${selectedSpice === spice ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-sm shadow-amber-500/5' : 'bg-zinc-950/80 border-zinc-850/60 text-zinc-400'}`}
                    >
                      {spice === 'Mild' ? '🌶️ Mild' : spice === 'Medium' ? '🌶️🌶️ Medium' : '🌶️🌶️🌶️ Spicy'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Add Action */}
            <button
              onClick={() => {
                addToCart(customizingItem, selectedPortion, selectedSpice);
                setCustomizingItem(null);
              }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-black rounded-xl py-3.5 text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-amber-500/10"
            >
              Add to Basket - ₹{parseFloat(selectedPortion === 'Half' ? (customizingItem.price_half || customizingItem.price) : (customizingItem.price_full || customizingItem.price)).toFixed(2)}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}
