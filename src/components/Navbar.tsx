'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-xl font-bold shrink-0">
            <span className="text-xl sm:text-2xl">🎥</span>
            <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
              直播平台
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Link href="/" className="text-xs sm:text-base text-slate-300 hover:text-white transition-colors whitespace-nowrap">
              首页
            </Link>
            <Link href="/recharge" className="text-xs sm:text-base text-slate-300 hover:text-white transition-colors whitespace-nowrap">
              充值
            </Link>

            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-3">
                {user.role === 'admin' && (
                  <Link href="/admin" className="hidden sm:inline text-yellow-400 hover:text-yellow-300 transition-colors whitespace-nowrap">
                    管理后台
                  </Link>
                )}
                <Link href="/profile" className="flex items-center gap-1 sm:gap-2 text-slate-300 hover:text-white transition-colors">
                  <span className="bg-red-500 px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold whitespace-nowrap">
                    {user.points} 积分
                  </span>
                  <span className="hidden sm:inline">{user.nickname}</span>
                </Link>
                <button onClick={logout} className="btn-secondary !py-1 !px-2 sm:!px-3 text-xs sm:text-sm">
                  退出
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link href="/login" className="text-xs sm:text-base text-slate-300 hover:text-white transition-colors whitespace-nowrap">
                  登录
                </Link>
                <Link href="/register" className="btn-primary !py-1 !px-3 sm:!px-4 text-xs sm:text-sm">
                  注册
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}