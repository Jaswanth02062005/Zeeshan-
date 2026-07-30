'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Coffee, 
  Layers, 
  ShoppingBag, 
  DollarSign, 
  Upload, 
  Power,
  RefreshCw,
  Clock,
  Volume2,
  VolumeX,
  Play,
  Loader2
} from 'lucide-react';
import { isMockMode, MockDatabase, supabase } from '../lib/supabase';

export default function AdminDashboard() {
  const router = useRouter();
  
  // Authentication & Navigation
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'categories' | 'all-orders' | 'users'>('orders');
  const [selectedLogDate, setSelectedLogDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Categories & Menu Items State
  const [categories, setCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  
  // Live Orders State
  const [orders, setOrders] = useState<any[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Forms / Modals
  const [newCategoryName, setNewCategoryName] = useState('');
  const [itemForm, setItemForm] = useState({
    id: '',
    name: '',
    description: '',
    price: '',
    offer_price: '',
    category_id: '',
    image_url: '',
    is_available: true
  });
  const [isEditingItem, setIsEditingItem] = useState(false);

  // Audio elements for incoming orders
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auth verify
  useEffect(() => {
    const adminToken = localStorage.getItem('admin_token');
    if (!adminToken && isMockMode) {
      router.push('/admin/login');
    } else {
      setAuthenticated(true);
    }

    // Load initial structures
    setCategories(MockDatabase.getCategories());
    setMenuItems(MockDatabase.getMenuItems());
    setOrders(MockDatabase.getOrders());

    if (!isMockMode) {
      fetchLiveDb();
    }
  }, []);

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

  const fetchLiveDb = async () => {
    try {
      const { data: cats } = await supabase.from('categories').select('*');
      if (cats) setCategories(cats);

      const { data: items } = await supabase.from('menu_items').select('*');
      if (items) setMenuItems(items);

      const { data: ords } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (ords) setOrders(ords);
    } catch (err) {
      console.error(err);
    }
  };

  // Realtime subscription setup
  useEffect(() => {
    if (!authenticated) return;

    // Trigger ringtone if there are new PENDING_ACCEPTANCE orders
    const pendingOrdersCount = orders.filter(o => o.status === 'PENDING_ACCEPTANCE').length;
    if (pendingOrdersCount > 0 && soundEnabled) {
      playAlertSound();
    }

    if (isMockMode) {
      const unsubscribe = MockDatabase.subscribeToOrders((updatedOrders) => {
        setOrders(updatedOrders);
        const hasNewPending = updatedOrders.some(
          (o: any) => o.status === 'PENDING_ACCEPTANCE' && 
          !orders.some((old: any) => old.id === o.id && old.status === 'PENDING_ACCEPTANCE')
        );
        if (hasNewPending && soundEnabled) {
          playAlertSound();
        }
      });
      return () => unsubscribe();
    } else {
      const channel = supabase
        .channel('admin-orders-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload: any) => {
            fetchLiveDb();
            if (payload.new && payload.new.status === 'PENDING_ACCEPTANCE' && soundEnabled) {
              playAlertSound();
            }
          }
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [authenticated, orders.length, soundEnabled]);

  // Alert Ringtone Generator (Web Audio API)
  const playAlertSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Generate a pleasant digital ping pattern
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio play blocked or unsupported by browser client policies.');
    }
  };

  // Actions: Categories
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    if (isMockMode) {
      const newCat = {
        id: 'cat_' + Math.random().toString(36).substr(2, 9),
        name: newCategoryName
      };
      const updated = [...categories, newCat];
      setCategories(updated);
      MockDatabase.saveCategories(updated);
      setNewCategoryName('');
    } else {
      try {
        const { data, error } = await supabase
          .from('categories')
          .insert([{ name: newCategoryName }])
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setCategories(prev => [...prev, data]);
          setNewCategoryName('');
        }
      } catch (err: any) {
        alert('Error adding category: ' + err.message);
      }
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (isMockMode) {
      const updated = categories.filter(c => c.id !== id);
      setCategories(updated);
      MockDatabase.saveCategories(updated);
    } else {
      try {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', id);
        if (error) throw error;
        setCategories(prev => prev.filter(c => c.id !== id));
      } catch (err: any) {
        alert('Error deleting category: ' + err.message);
      }
    }
  };

  // Actions: Menu Items CRUD
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name || !itemForm.price || !itemForm.category_id) return;
    const priceNum = parseFloat(itemForm.price);
    const offerPriceNum = itemForm.offer_price ? parseFloat(itemForm.offer_price) : null;

    if (isMockMode) {
      let updatedList = [...menuItems];
      if (isEditingItem) {
        updatedList = updatedList.map(item => 
          item.id === itemForm.id ? { ...item, ...itemForm, price: priceNum, offer_price: offerPriceNum } : item
        );
      } else {
        const newItem = {
          ...itemForm,
          id: 'item_' + Math.random().toString(36).substr(2, 9),
          price: priceNum,
          offer_price: offerPriceNum
        };
        updatedList.push(newItem);
      }
      setMenuItems(updatedList);
      MockDatabase.saveMenuItems(updatedList);
      resetItemForm();
    } else {
      try {
        if (isEditingItem) {
          const { error } = await supabase
            .from('menu_items')
            .update({
              name: itemForm.name,
              description: itemForm.description,
              price: priceNum,
              offer_price: offerPriceNum,
              category_id: itemForm.category_id,
              image_url: itemForm.image_url,
              is_available: itemForm.is_available
            })
            .eq('id', itemForm.id);
          if (error) throw error;
          setMenuItems(prev => prev.map(item => 
            item.id === itemForm.id ? { ...item, ...itemForm, price: priceNum, offer_price: offerPriceNum } : item
          ));
        } else {
          const { data, error } = await supabase
            .from('menu_items')
            .insert([{
              name: itemForm.name,
              description: itemForm.description,
              price: priceNum,
              offer_price: offerPriceNum,
              category_id: itemForm.category_id,
              image_url: itemForm.image_url,
              is_available: itemForm.is_available
            }])
            .select()
            .single();
          if (error) throw error;
          if (data) setMenuItems(prev => [...prev, data]);
        }
        resetItemForm();
      } catch (err: any) {
        alert('Error saving menu item: ' + err.message);
      }
    }
  };

  const handleEditItem = (item: any) => {
    setItemForm({
      id: item.id,
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      offer_price: item.offer_price !== null && item.offer_price !== undefined ? item.offer_price.toString() : '',
      category_id: item.category_id,
      image_url: item.image_url || '',
      is_available: item.is_available
    });
    setIsEditingItem(true);
  };

  const handleDeleteItem = async (id: string) => {
    if (isMockMode) {
      const updated = menuItems.filter(item => item.id !== id);
      setMenuItems(updated);
      MockDatabase.saveMenuItems(updated);
    } else {
      try {
        const { error } = await supabase
          .from('menu_items')
          .delete()
          .eq('id', id);
        if (error) throw error;
        setMenuItems(prev => prev.filter(item => item.id !== id));
      } catch (err: any) {
        alert('Error deleting menu item: ' + err.message);
      }
    }
  };

  const toggleAvailability = async (item: any) => {
    const nextAvailability = !item.is_available;
    if (isMockMode) {
      const updated = menuItems.map(i => 
        i.id === item.id ? { ...i, is_available: nextAvailability } : i
      );
      setMenuItems(updated);
      MockDatabase.saveMenuItems(updated);
    } else {
      try {
        const { error } = await supabase
          .from('menu_items')
          .update({ is_available: nextAvailability })
          .eq('id', item.id);
        if (error) throw error;
        setMenuItems(prev => prev.map(i => 
          i.id === item.id ? { ...i, is_available: nextAvailability } : i
        ));
      } catch (err: any) {
        alert('Error updating item availability: ' + err.message);
      }
    }
  };

  const resetItemForm = () => {
    setItemForm({
      id: '',
      name: '',
      description: '',
      price: '',
      offer_price: '',
      category_id: categories[0]?.id || '',
      image_url: '',
      is_available: true
    });
    setIsEditingItem(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image size should be less than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setItemForm(prev => ({ ...prev, image_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // Actions: Orders Acceptance & Fulfillment State Transitions
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: string) => {
    if (isMockMode) {
      const updatedOrders = orders.map(o => 
        o.id === orderId ? { ...o, status: nextStatus } : o
      );
      setOrders(updatedOrders);
      MockDatabase.saveOrder(updatedOrders.find(o => o.id === orderId));
    } else {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: nextStatus })
          .eq('id', orderId);
        if (error) throw error;
        setOrders(prev => prev.map(o => 
          o.id === orderId ? { ...o, status: nextStatus } : o
        ));
      } catch (err: any) {
        alert('Error updating order status: ' + err.message);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    router.push('/admin/login');
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="animate-spin text-amber-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      {/* HEADER & TOP NAVBAR */}
      <header className="border-b border-zinc-800 bg-[#0d0d10] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center font-extrabold text-black text-lg">
            Z
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">ZEESHANS ADMIN</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
              Restaurant Control Deck
            </p>
          </div>
        </div>

        {/* Audio control + Logout */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 text-xs font-semibold ${soundEnabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
            title="Toggle Live Audio Alerts"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white transition-all text-xs flex items-center gap-1.5"
          >
            <Power size={14} /> Log Out
          </button>
        </div>
      </header>

      {/* DASHBOARD TAB NAVIGATION BAR */}
      <div className="px-8 border-b border-zinc-800 bg-[#0c0c0f] flex gap-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`py-4 text-xs font-bold uppercase tracking-wider relative transition-colors ${activeTab === 'orders' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Incoming Orders
          {orders.some(o => o.status === 'PENDING_ACCEPTANCE') && (
            <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-[9px] rounded-full animate-pulse">
              {orders.filter(o => o.status === 'PENDING_ACCEPTANCE').length} NEW
            </span>
          )}
          {activeTab === 'orders' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />}
        </button>

        <button
          onClick={() => setActiveTab('menu')}
          className={`py-4 text-xs font-bold uppercase tracking-wider relative transition-colors ${activeTab === 'menu' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Menu Management
          {activeTab === 'menu' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />}
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`py-4 text-xs font-bold uppercase tracking-wider relative transition-colors ${activeTab === 'categories' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Categories
          {activeTab === 'categories' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />}
        </button>

        <button
          onClick={() => setActiveTab('all-orders')}
          className={`py-4 text-xs font-bold uppercase tracking-wider relative transition-colors ${activeTab === 'all-orders' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Orders
          {activeTab === 'all-orders' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`py-4 text-xs font-bold uppercase tracking-wider relative transition-colors ${activeTab === 'users' ? 'text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Users & Carts
          {activeTab === 'users' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />}
        </button>
      </div>

      {/* WORKSPACE CONTENT */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* ORDERS PANEL VIEW */}
        {activeTab === 'orders' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* COLUMN 1: NEW PENDING ORDERS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  Incoming Requests
                </h3>
                <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-bold">
                  {orders.filter(o => o.status === 'PENDING_ACCEPTANCE').length} Action Needed
                </span>
              </div>

              <div className="space-y-4">
                {orders.filter(o => o.status === 'PENDING_ACCEPTANCE').length > 0 ? (
                  orders.filter(o => o.status === 'PENDING_ACCEPTANCE').map((order) => (
                    <div key={order.id} className="glass p-5 rounded-2xl border border-red-500/35 space-y-4 transition-all duration-300 hover:border-red-500/60 shadow-lg shadow-red-500/5 relative overflow-hidden">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                            </span>
                            <h4 className="font-extrabold text-sm text-white">{order.customer_name || 'Guest User'}</h4>
                          </div>
                          <span className="text-[11px] font-semibold text-amber-500">{order.customer_phone}</span>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{new Date(order.created_at).toLocaleTimeString()}</p>
                        </div>
                        <span className="text-sm font-extrabold text-amber-500">₹{parseFloat(order.total_amount).toFixed(2)}</span>
                      </div>

                      <div className="text-[11px] text-zinc-450 border-l-2 border-red-500/45 pl-2.5 leading-relaxed">
                        <strong>Address:</strong> {order.customer_address || 'No address provided'}
                      </div>

                      {/* Items */}
                      <div className="space-y-1 text-xs text-zinc-400">
                        {order.items.map((i: any, index: number) => (
                          <div key={index} className="flex justify-between">
                            <span>{i.menuItem.name} <strong className="text-zinc-200">x{i.quantity}</strong></span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'ACCEPTED')}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                        >
                          <Check size={14} /> Accept Order
                        </button>
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'REJECTED')}
                          className="px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold py-2 rounded-lg transition-colors border border-red-500/20"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-zinc-600 text-xs glass rounded-2xl border border-zinc-800/30">
                    No incoming requests at the moment.
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 2: ACTIVE PREPARING ORDERS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-spin"></span>
                  Kitchen Queue
                </h3>
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-bold">
                  {orders.filter(o => ['ACCEPTED', 'PAID', 'PREPARING'].includes(o.status)).length} Active
                </span>
              </div>

              <div className="space-y-4">
                {orders.filter(o => ['ACCEPTED', 'PAID', 'PREPARING'].includes(o.status)).length > 0 ? (
                  orders.filter(o => ['ACCEPTED', 'PAID', 'PREPARING'].includes(o.status)).map((order) => (
                    <div key={order.id} className="glass p-5 rounded-2xl border border-zinc-800 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-extrabold text-sm text-white">{order.customer_name || 'Guest User'}</h4>
                          <span className="text-[11px] font-semibold text-zinc-400">{order.customer_phone}</span>
                          <div className="flex gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${order.payment_method === 'COD' ? 'bg-zinc-800 text-amber-500' : (order.status === 'ACCEPTED' ? 'bg-zinc-800 text-zinc-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')}`}>
                              {order.payment_method === 'COD' ? 'COD (Pay on Delivery)' : (order.status === 'ACCEPTED' ? 'Awaiting Payment' : 'Paid & Approved')}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-extrabold text-white">₹{parseFloat(order.total_amount).toFixed(2)}</span>
                      </div>

                      <div className="text-[11px] text-zinc-400 border-l border-zinc-800 pl-2 leading-relaxed">
                        <strong>Address:</strong> {order.customer_address || 'No address provided'}
                      </div>

                      <div className="space-y-1 text-xs text-zinc-400">
                        {order.items.map((i: any, index: number) => (
                          <div key={index} className="flex justify-between">
                            <span>{i.menuItem.name} <strong className="text-zinc-200">x{i.quantity}</strong></span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-zinc-850">
                        {order.status !== 'PREPARING' ? (
                          <button
                            onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')}
                            disabled={order.payment_method === 'ONLINE' && order.status === 'ACCEPTED'}
                            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            {order.payment_method === 'ONLINE' && order.status === 'ACCEPTED' ? 'Awaiting Online Payment' : 'Start Cooking'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateOrderStatus(order.id, 'READY_FOR_PICKUP')}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            Mark Ready
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-zinc-600 text-xs glass rounded-2xl border border-zinc-800/30">
                    No orders in preparation queue.
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 3: COMPLETED / RECENT LOGS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                  Completed & Closed
                </h3>
              </div>

              <div className="space-y-4">
                {orders.filter(o => ['READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(o.status)).length > 0 ? (
                  orders.filter(o => ['READY_FOR_PICKUP', 'DELIVERING', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(o.status)).map((order) => (
                    <div key={order.id} className="glass p-4 rounded-2xl border border-zinc-800/50 space-y-3 opacity-60">
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <h4 className="font-extrabold text-sm text-zinc-800">{order.customer_name || 'Guest User'}</h4>
                          <span className="text-[10px] text-zinc-500">{order.customer_phone}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${['COMPLETED', 'READY_FOR_PICKUP'].includes(order.status) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {order.status}
                        </span>
                      </div>

                      {order.status === 'READY_FOR_PICKUP' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')}
                          className="w-full bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold py-1.5 rounded transition-colors"
                        >
                          Complete Fulfillment
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-zinc-600 text-xs glass rounded-2xl border border-zinc-800/30">
                    No archived logs today.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MENU MANAGEMENT VIEW */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Editor Card */}
            <div className="glass p-6 rounded-2xl border border-zinc-800 h-fit space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">
                {isEditingItem ? 'Edit Culinary Masterpiece' : 'Add Food Creation'}
              </h3>

              <form onSubmit={handleSaveItem} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Item Name</label>
                  <input
                    type="text"
                    placeholder="E.g., Smoked Duck Breast"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Description</label>
                  <textarea
                    placeholder="Details about ingredients, preparation style..."
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    className="w-full bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 h-16 resize-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="450"
                      value={itemForm.price}
                      onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                      className="w-full bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Offer Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Optional"
                      value={itemForm.offer_price}
                      onChange={(e) => setItemForm({ ...itemForm, offer_price: e.target.value })}
                      className="w-full bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Category</label>
                    <select
                      value={itemForm.category_id}
                      onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                      className="w-full bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                      required
                    >
                      <option value="">Select Category</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-2">Item Image</label>
                  
                  {itemForm.image_url ? (
                    <div className="relative group rounded-xl overflow-hidden border border-zinc-800 bg-[#121215] h-32 flex items-center justify-center">
                      <img 
                        src={itemForm.image_url} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label 
                          htmlFor="item-image-upload" 
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
                        >
                          Change
                        </label>
                        <button
                          type="button"
                          onClick={() => setItemForm({ ...itemForm, image_url: '' })}
                          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[10px] font-bold rounded-lg transition-colors border border-red-500/30"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label 
                      htmlFor="item-image-upload" 
                      className="border-2 border-dashed border-zinc-850 hover:border-amber-500/50 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-[#121215]"
                    >
                      <Upload className="text-zinc-500" size={20} />
                      <span className="text-[10px] font-semibold text-zinc-400">Click to upload image</span>
                      <span className="text-[8px] text-zinc-600">Max size 2MB (PNG, JPG, WebP)</span>
                    </label>
                  )}
                  
                  <input
                    type="file"
                    id="item-image-upload"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    {isEditingItem ? 'Save Updates' : 'Add Item'}
                  </button>
                  {isEditingItem && (
                    <button
                      type="button"
                      onClick={resetItemForm}
                      className="px-3 bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-bold py-2.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Menu Items Table */}
            <div className="lg:col-span-2 glass p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Menu Directory ({menuItems.length} items)
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px]">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Price</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850">
                    {menuItems.map(item => (
                      <tr key={item.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 font-semibold text-white">{item.name}</td>
                        <td className="py-3 text-zinc-400">
                          {categories.find(c => c.id === item.category_id)?.name || 'Unknown'}
                        </td>
                        <td className="py-3 font-bold text-amber-500">
                          {item.offer_price !== null && item.offer_price !== undefined ? (
                            <div className="flex items-center gap-1.5">
                              <span className="line-through text-zinc-500 font-normal">₹{item.price.toFixed(2)}</span>
                              <span>₹{item.offer_price.toFixed(2)}</span>
                            </div>
                          ) : (
                            <span>₹{item.price.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => toggleAvailability(item)}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold ${item.is_available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
                          >
                            {item.is_available ? 'Available' : 'Unavailable'}
                          </button>
                        </td>
                        <td className="py-3 text-right space-x-2">
                          <button
                            onClick={() => handleEditItem(item)}
                            className="p-1 hover:text-amber-500 text-zinc-500 transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 hover:text-red-500 text-zinc-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* CATEGORIES MANAGEMENT VIEW */}
        {activeTab === 'categories' && (
          <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass p-6 rounded-2xl border border-zinc-800 h-fit space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">
                Create Category
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="E.g., Starters"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
                <button
                  onClick={handleAddCategory}
                  className="bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            <div className="glass p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Existing Categories ({categories.length})
              </h3>
              <div className="divide-y divide-zinc-850">
                {categories.map(cat => (
                  <div key={cat.id} className="flex justify-between items-center py-2.5">
                    <span className="text-xs font-bold text-white">{cat.name}</span>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1 text-zinc-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ALL ORDERS VIEW WITH DYNAMIC DATE AUDITING */}
        {activeTab === 'all-orders' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header with Date picker */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
              <div>
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                  Daily Order Log
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Select a calendar date to audit past orders and earnings.</p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-zinc-500">Filter Date:</label>
                <input
                  type="date"
                  value={selectedLogDate}
                  onChange={(e) => setSelectedLogDate(e.target.value)}
                  className="bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Filtered logs */}
            <div className="space-y-4">
              {(() => {
                const filtered = orders.filter((o) => {
                  if (!o.created_at) return false;
                  const orderDateString = o.created_at.split('T')[0];
                  return orderDateString === selectedLogDate;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-20 text-zinc-500 text-xs bg-white border border-zinc-200 rounded-2xl">
                      No orders registered on {new Date(selectedLogDate).toLocaleDateString(undefined, { dateStyle: 'long' })}.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filtered.map((order) => (
                      <div key={order.id} className="glass p-5 rounded-2xl border border-zinc-200/50 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-extrabold text-sm text-white">{order.customer_name || 'Guest User'}</h4>
                            <span className="text-[11px] font-semibold text-zinc-500">{order.customer_phone}</span>
                            <p className="text-[9px] text-zinc-400 mt-1 font-semibold">ID: {order.id}</p>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-amber-500 block">₹{parseFloat(order.total_amount).toFixed(2)}</span>
                            <span className={`inline-block px-2 py-0.5 mt-1 rounded text-[8px] font-bold uppercase tracking-wider ${['COMPLETED', 'READY_FOR_PICKUP'].includes(order.status) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : ['REJECTED', 'CANCELLED'].includes(order.status) ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                              {order.status}
                            </span>
                          </div>
                        </div>

                        {/* Customer Address Details */}
                        <div className="text-[11px] text-zinc-400 border-l border-zinc-200 pl-2 leading-relaxed">
                          <strong>Address:</strong> {order.customer_address || 'No address provided'}
                        </div>

                        {/* Items */}
                        <div className="space-y-1.5 text-xs text-zinc-400 border-t border-zinc-200/40 pt-3">
                          {order.items.map((i: any, index: number) => (
                            <div key={index} className="flex justify-between">
                              <span>{i.menuItem.name} <strong className="text-zinc-200">x{i.quantity}</strong></span>
                              <span>₹{(parseFloat(i.menuItem.price) * i.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* USERS AND ACTIVE CARTS VIEW */}
        {activeTab === 'users' && (
          <div className="space-y-8 max-w-6xl mx-auto text-left">
            {/* Live active users column */}
            <div className="space-y-4">
              <div className="border-b border-zinc-800 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  Active Users & Live Carts
                </h3>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold">
                  {Object.keys(MockDatabase.getStorage<Record<string, any>>('mock_user_activity', {})).length} Online
                </span>
              </div>

              {(() => {
                const activeActivity = MockDatabase.getStorage<Record<string, { name: string; last_active: string; cart: any[]; current_tab: string }>>('mock_user_activity', {});
                const activePhones = Object.keys(activeActivity);

                if (activePhones.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-600 text-xs glass rounded-2xl border border-zinc-800/30">
                      No active users on the application right now.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activePhones.map((phone) => {
                      const session = activeActivity[phone];
                      const timeDiff = Math.round((Date.now() - new Date(session.last_active).getTime()) / 1000);
                      const cartTotal = session.cart.reduce((sum, item) => sum + (parseFloat(item.menuItem.price) * item.quantity), 0);

                      return (
                        <div key={phone} className="glass p-5 rounded-2xl border border-zinc-800 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-extrabold text-sm text-white">{session.name || 'Guest User'}</h4>
                              <span className="text-[10px] font-semibold text-zinc-500">{phone}</span>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-bold capitalize">
                              Tab: {session.current_tab}
                            </span>
                          </div>

                          <div className="text-[9px] text-zinc-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Last Active: {timeDiff <= 5 ? 'Just now' : `${timeDiff}s ago`}
                          </div>

                          <div className="border-t border-zinc-855 pt-3 space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-400">
                              <span>Cart Items ({session.cart.length})</span>
                              <span>Total: ₹{cartTotal.toFixed(2)}</span>
                            </div>

                            {session.cart.length > 0 ? (
                              <div className="bg-[#121215] p-2.5 rounded-xl border border-zinc-900 space-y-1 text-[10px] text-zinc-500">
                                {session.cart.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between">
                                    <span>{item.menuItem.name} <strong>x{item.quantity}</strong></span>
                                    <span>₹{(parseFloat(item.menuItem.price) * item.quantity).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-zinc-600 italic">Basket is empty</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Registered users directory */}
            <div className="space-y-4 pt-4">
              <div className="border-b border-zinc-800 pb-2">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-left">
                  Registered Users Registry
                </h3>
              </div>

              {(() => {
                const profiles = MockDatabase.getStorage<Record<string, { name: string; address: string }>>('mock_user_profiles', {});
                const phones = Object.keys(profiles);

                if (phones.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-600 text-xs glass rounded-2xl border border-zinc-800/30">
                      No users registered in the database yet.
                    </div>
                  );
                }

                return (
                  <div className="bg-[#121215]/40 rounded-2xl border border-zinc-800 overflow-hidden text-left">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950/20 font-semibold">
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">Phone Number</th>
                          <th className="p-4">Default Delivery Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850">
                        {phones.map((phone) => (
                          <tr key={phone} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 font-bold text-white">{profiles[phone].name || 'Guest User'}</td>
                            <td className="p-4 text-amber-500 font-semibold">{phone}</td>
                            <td className="p-4 text-zinc-400 truncate max-w-xs">{profiles[phone].address || 'No address saved'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
