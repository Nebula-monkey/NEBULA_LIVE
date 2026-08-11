'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

interface Transaction {
  id: number;
  type: string;
  amount: number;
  points: number;
  status: string;
  admin_note: string;
  created_at: number;
}

const typeLabels: Record<string, string> = {
  recharge: '充值',
  gift_spend: '送礼消费',
  gift_earning: '礼物收入',
  withdrawal: '提现',
  withdrawal_pending: '提现申请',
  withdrawal_reject: '提现退回'
};

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [nickname, setNickname] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'records' | 'withdraw'>('info');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      setNickname(user.nickname || '');
      loadTransactions();
    }
  }, [user]);

  async function loadTransactions() {
    try {
      const res = await api.finance.myTransactions();
      setTransactions(res.transactions || []);
    } catch {}
  }

  async function updateProfile() {
    try {
      await api.auth.updateProfile({ nickname });
      await refreshUser();
      setEditing(false);
      setMessage('资料已更新');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="mb-4">请先登录</p>
        <Link href="/login" className="btn-primary">去登录</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-2xl font-bold">
          {user.nickname?.[0] || user.username[0]}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user.nickname || user.username}</h1>
          <p className="text-slate-400">@{user.username}</p>
        </div>
        <div className="ml-auto">
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-4 py-2 text-center">
            <div className="text-2xl font-bold text-yellow-400">{user.points}</div>
            <div className="text-xs text-slate-400">积分</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 ${activeTab === 'info' ? 'border-b-2 border-red-500 text-white' : 'text-slate-400'}`}
        >
          个人信息
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2 ${activeTab === 'records' ? 'border-b-2 border-red-500 text-white' : 'text-slate-400'}`}
        >
          积分记录
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`px-4 py-2 ${activeTab === 'withdraw' ? 'border-b-2 border-red-500 text-white' : 'text-slate-400'}`}
        >
          提现
        </button>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.includes('已更新') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {message}
        </div>
      )}

      {activeTab === 'info' && (
        <div className="card p-6">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={updateProfile} className="btn-primary">保存</button>
                <button onClick={() => setEditing(false)} className="btn-secondary">取消</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-slate-800">
                <span className="text-slate-400">用户名</span>
                <span>{user.username}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-800">
                <span className="text-slate-400">昵称</span>
                <span>{user.nickname || '未设置'}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-800">
                <span className="text-slate-400">角色</span>
                <span>{user.role === 'admin' ? '管理员' : '普通用户'}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-400">积分余额</span>
                <span className="text-yellow-400 font-bold">{user.points}</span>
              </div>
              <button onClick={() => setEditing(true)} className="btn-primary">
                编辑资料
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="font-semibold">积分记录</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left p-3">类型</th>
                  <th className="text-left p-3">积分变动</th>
                  <th className="text-left p-3">状态</th>
                  <th className="text-left p-3">备注</th>
                  <th className="text-left p-3">时间</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={5} className="text-center p-8 text-slate-500">暂无记录</td></tr>
                ) : transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-slate-800/50">
                    <td className="p-3">{typeLabels[tx.type] || tx.type}</td>
                    <td className={`p-3 ${tx.points >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.points > 0 ? '+' : ''}{tx.points}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        tx.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {tx.status === 'completed' ? '已完成' : tx.status === 'pending' ? '处理中' : '已驳回'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{tx.admin_note || '-'}</td>
                    <td className="p-3 text-slate-400">{new Date(tx.created_at).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <WithdrawPanel />
      )}
    </div>
  );
}

// 固定提现金额档位（元）
const WITHDRAW_AMOUNTS = [15, 30, 100, 200, 500, 1000];

function WithdrawPanel() {
  const { user } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState('');
  const [message, setMessage] = useState('');
  const [myWithdrawals, setMyWithdrawals] = useState<any[]>([]);

  useEffect(() => {
    loadWithdrawals();
  }, []);

  async function loadWithdrawals() {
    try {
      const res = await api.finance.myWithdrawals();
      setMyWithdrawals(res.withdrawals || []);
    } catch {}
  }

  async function handleSubmit() {
    setMessage('');
    if (!selectedAmount) {
      setMessage('请选择提现金额');
      return;
    }
    const needPoints = selectedAmount * 10;
    if (!user || user.points < needPoints) {
      setMessage(`积分不足：提现 ${selectedAmount} 元需要 ${needPoints} 积分，您当前只有 ${user?.points || 0} 积分`);
      return;
    }
    if (!qrFile) {
      setMessage('请上传您的收款码图片，否则无法打款');
      return;
    }

    const formData = new FormData();
    formData.append('cashAmount', String(selectedAmount));
    formData.append('qrCode', qrFile);

    try {
      await api.finance.createWithdrawal(formData);
      setMessage('提现申请已提交');
      setSelectedAmount(null);
      setQrFile(null);
      setQrPreview('');
      loadWithdrawals();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setQrFile(file);
      setQrPreview(URL.createObjectURL(file));
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="font-semibold mb-4">申请提现</h3>
        <p className="text-sm text-slate-400 mb-4">
          当前积分: <span className="text-yellow-400 font-bold">{user?.points || 0}</span> · 
          汇率: 10 积分 = 1 元
        </p>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.includes('已提交') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2">选择提现金额（10 积分 = 1 元）</label>
            <div className="grid grid-cols-3 gap-2">
              {WITHDRAW_AMOUNTS.map(amt => {
                const needPoints = amt * 10;
                const enough = (user?.points || 0) >= needPoints;
                return (
                  <button
                    key={amt}
                    onClick={() => setSelectedAmount(amt)}
                    className={`px-3 py-3 rounded-lg border text-center transition-colors ${
                      selectedAmount === amt
                        ? 'bg-red-500 border-red-400 text-white'
                        : enough
                          ? 'bg-slate-800 border-slate-700 hover:border-red-400'
                          : 'bg-slate-800/40 border-slate-700 text-slate-500'
                    }`}
                  >
                    <div className="font-bold">¥{amt}</div>
                    <div className={`text-xs ${selectedAmount === amt ? 'text-white/80' : 'text-slate-400'}`}>{needPoints} 积分</div>
                  </button>
                );
              })}
            </div>
            {selectedAmount && (user?.points || 0) < selectedAmount * 10 && (
              <p className="text-xs text-red-400 mt-2">
                积分不足：需 {selectedAmount * 10} 积分，当前 {user?.points || 0} 积分
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm mb-2">我的收款码（必选，用于打款）</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="input-field"
            />
            {qrPreview && (
              <img src={qrPreview} alt="收款码预览" className="mt-2 w-48 rounded-lg" />
            )}
          </div>
          <button onClick={handleSubmit} className="btn-primary w-full">
            提交提现申请
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="font-semibold">我的提现记录</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left p-3">积分</th>
                <th className="text-left p-3">金额</th>
                <th className="text-left p-3">状态</th>
                <th className="text-left p-3">备注</th>
                <th className="text-left p-3">时间</th>
              </tr>
            </thead>
            <tbody>
              {myWithdrawals.length === 0 ? (
                <tr><td colSpan={5} className="text-center p-8 text-slate-500">暂无提现记录</td></tr>
              ) : myWithdrawals.map(w => (
                <tr key={w.id} className="border-b border-slate-800/50">
                  <td className="p-3">{w.points}</td>
                  <td className="p-3">¥{w.cash_amount}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      w.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      w.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {w.status === 'completed' ? '已处理' : w.status === 'pending' ? '处理中' : '已驳回'}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">{w.admin_note || '-'}</td>
                  <td className="p-3 text-slate-400">{new Date(w.created_at).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}