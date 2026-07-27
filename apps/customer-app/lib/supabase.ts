import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Fallback Mock Client when keys are missing or invalid
export const isMockMode = !supabaseUrl || !supabaseAnonKey;

export const supabase = !isMockMode 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as any);

// Mock implementation of local storage-backed state to simulate Database & Realtime updates
export class MockDatabase {
  static getStorage<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  }

  static setStorage<T>(key: string, value: T) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
    // Trigger custom event for realtime subscription simulation
    window.dispatchEvent(new CustomEvent('mock-db-update', { detail: { key, value } }));
  }

  static getCategories() {
    return this.getStorage('mock_categories', [
      { id: '1', name: 'Starters' },
      { id: '2', name: 'Mains' },
      { id: '3', name: 'Drinks' },
      { id: '4', name: 'Desserts' }
    ]);
  }

  static getMenuItems() {
    return this.getStorage('mock_menu_items', [
      {
        id: 'm1',
        category_id: '1',
        name: 'Crispy Truffle Fries',
        description: 'Tossed in white truffle oil, grated parmesan, and fresh parsley, served with garlic aioli.',
        price: 8.50,
        image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
        is_available: true
      },
      {
        id: 'm2',
        category_id: '1',
        name: 'Avocado Bruschetta',
        description: 'Grilled sourdough topped with smashed avocado, cherry tomatoes, basil, and balsamic glaze.',
        price: 11.00,
        image_url: 'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?w=600&auto=format&fit=crop&q=80',
        is_available: true
      },
      {
        id: 'm3',
        category_id: '2',
        name: 'Pan-Seared Ribeye Steak',
        description: 'Prime ribeye basted with garlic herb butter, served with roasted asparagus and garlic mash.',
        price: 32.00,
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
        is_available: true
      },
      {
        id: 'm4',
        category_id: '2',
        name: 'Wild Mushroom Risotto',
        description: 'Creamy Arborio rice with sautéed exotic mushrooms, thyme, and aged pecorino cheese.',
        price: 24.00,
        image_url: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600&auto=format&fit=crop&q=80',
        is_available: true
      },
      {
        id: 'm5',
        category_id: '3',
        name: 'Classic Old Fashioned',
        description: 'Premium bourbon, Angostura bitters, sugar cube, stirred with a twist of orange peel.',
        price: 14.00,
        image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
        is_available: true
      },
      {
        id: 'm6',
        category_id: '4',
        name: 'Lava Chocolate Cake',
        description: 'Decadent warm chocolate cake with a molten center, served with vanilla bean gelato.',
        price: 9.50,
        image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
        is_available: true
      }
    ]);
  }

  static getOrders(): any[] {
    return this.getStorage<any[]>('mock_orders', []);
  }

  static saveOrder(order: any) {
    const orders = this.getOrders();
    const index = orders.findIndex((o: any) => o.id === order.id);
    if (index > -1) {
      orders[index] = order;
    } else {
      orders.push(order);
    }
    this.setStorage('mock_orders', orders);
  }

  static subscribeToOrder(orderId: string, callback: (order: any) => void) {
    const listener = (event: any) => {
      if (event.detail.key === 'mock_orders') {
        const orders = event.detail.value;
        const currentOrder = orders.find((o: any) => o.id === orderId);
        if (currentOrder) callback(currentOrder);
      }
    };
    window.addEventListener('mock-db-update', listener);
    return () => window.removeEventListener('mock-db-update', listener);
  }
}
