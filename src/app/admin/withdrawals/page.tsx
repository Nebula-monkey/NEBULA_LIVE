'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';
import { api } from '@/lib/api';

interface Withdrawal {
  id: number;
  user_id: number;
  username: string;
  nickname: string;
  points: number;
  cash_amount: number;
  qr_code: string;
  status: string;
  admin_note: string;
  created_at: number;
}

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rejectNote, setRejectNote] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  useEffect(() => {
    loadWithdrawals();
  }, [page, statusFilter]);

  async function loadWithdrawals() {
    try {
      const res = await api.admin.getWithdrawals({ page, pageSize: 20, status: statusFilter });
      setWithdrawals(res.withdrawals);
      setTotal(res.total);
    } catch {}
  }

  async function approve(id: number) {
    if (!confirm('确认批准该提现申请？积分将扣除，视为已通过转账。')) return;
    try {
      await api.admin.approveWithdrawal(id);
      loadWithdrawals();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function reject(id: number) {
    try {
      await api.admin.rejectWithdrawal(id, rejectNote);
      setRejectingId(null);
      setRejectNote('');
      loadWithdrawals();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">提现审核</h1>

      <div className="flex gap-2 mb-4">
        {['pending', 'completed', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => { setStatusFilter(status); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm ${statusFilter === status ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            {status === 'pending' ? '待处理' : status === 'completed' ? '已完成' : '已拒绝'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {withdrawals.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无提现记录</div>
        ) : withdrawals.map(w => (
          <div key={w.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-4">
                {w.qr_code && (
                  <img
                    src={w.qr_code}
                    alt="收款码"
                    className="w-24 h-24 object-contain rounded-lg bg-white"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">{w.nickname || w.username}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      w.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      w.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {w.status === 'completed' ? '已处理' : w.status === 'pending' ? '待处理' : '已驳回'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 space-y-1">
                    <p>申请积分: <span className="text-yellow-400">{w.points}</span></p>
                    <p>到账金额: ¥{w.cash_amount}</p>
                    <p>申请时间: {new Date(w.created_at).toLocaleString('zh-CN')}</p>
                    {w.admin_note && <p className="text-slate-500">备注: {w.admin_note}</p>}
                  </div>
                </div>
              </div>

              {w.status === 'pending' && (
                <div className="flex flex-col gap-2">
                  <button onClick={() => approve(w.id)} className="btn-primary text-sm">
                    批准（已转账）
                  </button>
                  <button onClick={() => setRejectingId(w.id)} className="px-4 py-2 bg-red-600 rounded-lg text-sm">
                    拒绝
                  </button>
                </div>
              )}
            </div>

            {rejectingId === w.id && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <textarea
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  className="input-field mb-2"
                  rows={2}
                  placeholder="拒绝原因（将展示给用户）"
                />
                <div className="flex gap-2">
                  <button onClick={() => reject(w.id)} className="btn-primary text-sm">
                    确认拒绝
                  </button>
                  <button onClick={() => { setRejectingId(null); setRejectNote(''); }} className="btn-secondary text-sm">
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-400">共 {total} 条记录</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary !py-1 !px-3 text-sm">
              上一页
            </button>
            <span className="px-3 py-1">{page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn-secondary !py-1 !px-3 text-sm">
              下一页
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}