'use client';

import { AuthProvider } from '@/lib/AuthContext';
import Navbar from './Navbar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="bg-slate-900 border-t border-slate-800 py-6 text-center text-slate-500 text-sm">
        <p>© 2026 直播平台 - 实时互动直播 · 仅供娱乐</p>
      </footer>
    </AuthProvider>
  );
}