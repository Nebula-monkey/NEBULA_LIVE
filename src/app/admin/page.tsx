'use client';

import { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '@/lib/api';

interface Stats {
  totalUsers: number;
  totalRooms: number;
  liveRooms: number;
  totalGifts: number;
  totalPoints: number;
  pendingWithdrawals: number;
  pendingRecharges: number;
  todayRecharges: number;
  todayGifts: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const res = await api.admin.getStats();
      setStats(res);
    } catch {}
  }

  const statCards = [
    { label: '注册用户', value: stats?.totalUsers || 0, icon: '👥', color: 'from-blue-500 to-blue-600' },
    { label: '直播间总数', value: stats?.totalRooms || 0, icon: '📺', color: 'from-purple-500 to-purple-600' },
    { label: '正在直播', value: stats?.liveRooms || 0, icon: '🔴', color: 'from-red-500 to-red-600' },
    { label: '礼物总数', value: stats?.totalGifts || 0, icon: '🎁', color: 'from-pink-500 to-pink-600' },
    { label: '充值总额', value: stats?.totalPoints ? `${Math.floor(stats.totalPoints / 10)}元` : '0元', icon: '💰', color: 'from-green-500 to-green-600' },
    { label: '今日充值', value: stats?.todayRecharges ? `${Math.floor(stats.todayRecharges / 10)}元` : '0元', icon: '📈', color: 'from-yellow-500 to-yellow-600' },
    { label: '待处理提现', value: stats?.pendingWithdrawals || 0, icon: '⏳', color: 'from-orange-500 to-orange-600' },
    { label: '待确认充值', value: stats?.pendingRecharges || 0, icon: '💳', color: 'from-cyan-500 to-cyan-600' },
  ];

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">数据概览</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map(card => (
          <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-xl p-4`}>
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm opacity-80">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-semibold mb-4">快捷操作</h3>
          <div className="grid grid-cols-2 gap-3">
            <a href="/admin/withdrawals" className="flex flex-col items-center p-4 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <span className="text-2xl mb-1">💰</span>
              <span className="text-sm">处理提现</span>
            </a>
            <a href="/admin/qrcodes" className="flex flex-col items-center p-4 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <span className="text-2xl mb-1">📱</span>
              <span className="text-sm">收款码管理</span>
            </a>
            <a href="/admin/users" className="flex flex-col items-center p-4 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <span className="text-2xl mb-1">👥</span>
              <span className="text-sm">用户管理</span>
            </a>
            <a href="/admin/gifts" className="flex flex-col items-center p-4 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <span className="text-2xl mb-1">🎁</span>
              <span className="text-sm">礼物管理</span>
            </a>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4">平台说明</h3>
          <div className="space-y-2 text-sm text-slate-400">
            <p>• 充值汇率：1元 = 10积分</p>
            <p>• 主播收益：收到礼物获得 60% 积分（即 0.6 倍）</p>
            <p>• 每个用户最多创建 5 个直播间</p>
            <p>• 提现流程：用户提交申请 → 管理员扫码转账 → 批准到账</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}