'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import { isMockMode, supabase } from '../../../lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (isMockMode) {
      // Mock Login credentials for testing
      setTimeout(() => {
        if (email === 'admin@zeeshans.com' && password === 'admin123') {
          localStorage.setItem('admin_token', 'mock_admin_authenticated');
          router.push('/');
        } else {
          setErrorMsg('Invalid email or password. Hint: admin@zeeshans.com / admin123');
        }
        setLoading(false);
      }, 1000);
    } else {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push('/');
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-amber-500 items-center justify-center font-bold text-black text-xl shadow-lg shadow-amber-500/20">
            Z
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Admin Portal</h2>
          <p className="text-sm text-zinc-500">Sign in to manage menus, categories, and live orders.</p>
        </div>

        <div className="glass p-8 rounded-2xl border border-zinc-800 space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-zinc-500" size={16} />
                <input
                  type="email"
                  placeholder="admin@zeeshans.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#121215] border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-zinc-500" size={16} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#121215] border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 transition-colors"
                  required
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-xs text-red-400">
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Sign In'}
            </button>
          </form>
          
          <div className="text-center">
            <span className="text-[10px] text-zinc-600 bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-850">
              Demo Credentials: admin@zeeshans.com / admin123
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
