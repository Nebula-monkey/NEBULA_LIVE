'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';
import { api } from '@/lib/api';

interface Transaction {
  id: number;
  user_id: number;
  username: string;
  nickname: string;
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
  withdrawal: '提现完成',
  withdrawal_pending: '提现申请',
  withdrawal_reject: '提现退回'
};

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    loadTransactions();
  }, [page, typeFilter, statusFilter]);

  async function loadTransactions() {
    try {
      const res = await api.admin.getTransactions({ page, pageSize: 20, type: typeFilter, status: statusFilter });
      setTransactions(res.transactions);
      setTotal(res.total);
    } catch {}
  }

  async function updateStatus() {
    if (!selectedTx) return;
    try {
      await api.admin.updateTransactionStatus(selectedTx.id, selectedTx.status === 'pending' ? 'completed' : 'pending', note);
      setSelectedTx(null);
      setNote('');
      loadTransactions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function rejectTx() {
    if (!selectedTx) return;
    if (!confirm(`确认驳回该申请？驳回后状态将变为已驳回，${selectedTx.type === 'recharge' ? '不会给用户增加积分' : ''}`)) return;
    try {
      await api.admin.rejectTransaction(selectedTx.id, note);
      setSelectedTx(null);
      setNote('');
      loadTransactions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const types = ['', 'recharge', 'gift_spend', 'gift_earning', 'withdrawal', 'withdrawal_pending', 'withdrawal_reject'];
  const statuses = ['', 'pending', 'completed', 'rejected'];

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">交易记录</h1>

      <div className="flex gap-4 mb-4">
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="input-field max-w-xs">
          {types.map(t => <option key={t} value={t}>{t ? typeLabels[t] || t : '全部类型'}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field max-w-xs">
          {statuses.map(s => <option key={s} value={s}>{s ? (s === 'pending' ? '处理中' : s === 'completed' ? '已完成' : '已拒绝') : '全部状态'}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">用户</th>
              <th className="text-left p-3">类型</th>
              <th className="text-left p-3">金额</th>
              <th className="text-left p-3">积分变动</th>
              <th className="text-left p-3">状态</th>
              <th className="text-left p-3">备注</th>
              <th className="text-left p-3">时间</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} className="border-b border-slate-800/50">
                <td className="p-3">{tx.id}</td>
                <td className="p-3">{tx.nickname || tx.username}</td>
                <td className="p-3">{typeLabels[tx.type] || tx.type}</td>
                <td className="p-3">¥{tx.amount}</td>
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
                <td className="p-3 text-slate-400 max-w-[100px] truncate">
                  {tx.admin_note?.startsWith('/uploads/') ? (
                    <a href={tx.admin_note} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">查看凭证</a>
                  ) : (tx.admin_note || '-')}
                </td>
                <td className="p-3 text-slate-400">{new Date(tx.created_at).toLocaleString('zh-CN')}</td>
                <td className="p-3">
                  {tx.status === 'pending' && (
                    <button onClick={() => { setSelectedTx(tx); setNote(''); }} className="text-xs px-2 py-1 bg-blue-600 rounded">
                      处理
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-400">共 {total} 条记录</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary !py-1 !px-3 text-sm">上一页</button>
            <span className="px-3 py-1">{page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn-secondary !py-1 !px-3 text-sm">下一页</button>
          </div>
        </div>
      )}

      {selectedTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedTx(null)}>
          <div className="card p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">处理交易 #{selectedTx.id}</h3>
            <div className="text-sm space-y-2 mb-4">
              <p>用户: {selectedTx.nickname || selectedTx.username}</p>
              <p>类型: {typeLabels[selectedTx.type] || selectedTx.type}</p>
              <p>金额: ¥{selectedTx.amount}</p>
              <p>积分: {selectedTx.points}</p>
              {selectedTx.admin_note?.startsWith('/uploads/') && (
                <div>
                  <p className="mb-1">支付凭证:</p>
                  <img src={selectedTx.admin_note} alt="支付凭证" className="max-w-full max-h-64 rounded" />
                </div>
              )}
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              className="input-field mb-4"
              rows={2}
              placeholder="处理备注 / 驳回原因（驳回时将展示给用户）"
            />
            <div className="flex gap-2">
              <button onClick={() => updateStatus()} className="btn-primary flex-1">标记为完成</button>
              <button onClick={() => rejectTx()} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white">驳回</button>
              <button onClick={() => setSelectedTx(null)} className="btn-secondary">取消</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}