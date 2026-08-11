'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex items-center justify-center py-20">加载中...</div>;
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  const navItems = [
    { href: '/admin', label: '数据概览', icon: '📊' },
    { href: '/admin/users', label: '用户管理', icon: '👥' },
    { href: '/admin/withdrawals', label: '提现审核', icon: '💰' },
    { href: '/admin/qrcodes', label: '收款码管理', icon: '📱' },
    { href: '/admin/gifts', label: '礼物管理', icon: '🎁' },
    { href: '/admin/transactions', label: '交易记录', icon: '📋' },
    { href: '/admin/rooms', label: '直播间管理', icon: '📺' },
  ];

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <aside className="w-56 bg-slate-900 border-r border-slate-800 p-4">
        <h2 className="text-lg font-bold mb-6 text-center">管理员后台</h2>
        <nav className="space-y-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-slate-800 ${
                typeof window !== 'undefined' && window.location.pathname === item.href
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}