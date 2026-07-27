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
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'categories'>('orders');

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
  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const newCat = {
      id: 'cat_' + Math.random().toString(36).substr(2, 9),
      name: newCategoryName
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    MockDatabase.saveCategories(updated);
    setNewCategoryName('');
  };

  const handleDeleteCategory = (id: string) => {
    const updated = categories.filter(c => c.id !== id);
    setCategories(updated);
    MockDatabase.saveCategories(updated);
  };

  // Actions: Menu Items CRUD
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.name || !itemForm.price || !itemForm.category_id) return;

    let updatedList = [...menuItems];
    const priceNum = parseFloat(itemForm.price);

    if (isEditingItem) {
      updatedList = updatedList.map(item => 
        item.id === itemForm.id ? { ...item, ...itemForm, price: priceNum } : item
      );
    } else {
      const newItem = {
        ...itemForm,
        id: 'item_' + Math.random().toString(36).substr(2, 9),
        price: priceNum
      };
      updatedList.push(newItem);
    }

    setMenuItems(updatedList);
    MockDatabase.saveMenuItems(updatedList);
    resetItemForm();
  };

  const handleEditItem = (item: any) => {
    setItemForm({
      id: item.id,
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      category_id: item.category_id,
      image_url: item.image_url || '',
      is_available: item.is_available
    });
    setIsEditingItem(true);
  };

  const handleDeleteItem = (id: string) => {
    const updated = menuItems.filter(item => item.id !== id);
    setMenuItems(updated);
    MockDatabase.saveMenuItems(updated);
  };

  const toggleAvailability = (item: any) => {
    const updated = menuItems.map(i => 
      i.id === item.id ? { ...i, is_available: !i.is_available } : i
    );
    setMenuItems(updated);
    MockDatabase.saveMenuItems(updated);
  };

  const resetItemForm = () => {
    setItemForm({
      id: '',
      name: '',
      description: '',
      price: '',
      category_id: categories[0]?.id || '',
      image_url: '',
      is_available: true
    });
    setIsEditingItem(false);
  };

  // Actions: Orders Acceptance & Fulfillment State Transitions
  const handleUpdateOrderStatus = (orderId: string, nextStatus: string) => {
    const updatedOrders = orders.map(o => 
      o.id === orderId ? { ...o, status: nextStatus } : o
    );
    setOrders(updatedOrders);
    MockDatabase.saveOrder(updatedOrders.find(o => o.id === orderId));
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
                    <div key={order.id} className="glass p-5 rounded-2xl border border-red-500/20 space-y-4 animate-pulse">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-white">Phone: {order.customer_phone}</h4>
                          <span className="text-[10px] text-zinc-500">{new Date(order.created_at).toLocaleTimeString()}</span>
                        </div>
                        <span className="text-sm font-extrabold text-amber-500">₹{parseFloat(order.total_amount).toFixed(2)}</span>
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
                          <h4 className="font-bold text-sm text-white">ID: {order.id}</h4>
                          <div className="flex gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${order.status === 'ACCEPTED' ? 'bg-zinc-800 text-zinc-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                              {order.status === 'ACCEPTED' ? 'Awaiting Payment' : 'Paid & Approved'}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-extrabold text-white">₹{parseFloat(order.total_amount).toFixed(2)}</span>
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
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            Start Cooking
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
                        <span className="font-bold text-zinc-300">ID: {order.id}</span>
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

                <div className="grid grid-cols-2 gap-4">
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
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Image URL</label>
                  <input
                    type="text"
                    placeholder="https://images.unsplash.com/..."
                    value={itemForm.image_url}
                    onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                    className="w-full bg-[#121215] border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
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
                        <td className="py-3 font-bold text-amber-500">₹{item.price.toFixed(2)}</td>
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

      </main>
    </div>
  );
}
