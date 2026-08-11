'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Room {
  id: number;
  user_id: number;
  title: string;
  status: string;
  viewer_count: number;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
  host_nickname: string;
  host_username: string;
}

const statusMap: Record<string, { label: string; cls: string }> = {
  live: { label: '直播中', cls: 'text-red-400' },
  ended: { label: '已结束', cls: 'text-slate-400' },
  created: { label: '未开播', cls: 'text-yellow-400' },
};

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cleanupDays, setCleanupDays] = useState(7);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRooms();
  }, [page, statusFilter]);

  async function loadRooms() {
    try {
      const res = await api.admin.getRooms({ page, pageSize: 20, search, status: statusFilter });
      setRooms(res.rooms);
      setTotal(res.total);
    } catch {}
  }

  async function deleteRoom(id: number) {
    if (!confirm('确定删除这个直播间吗？删除后无法恢复。')) return;
    try {
      await api.admin.deleteRoom(id);
      setMessage('直播间已删除');
      loadRooms();
    } catch (e: any) {
      setMessage(e.message || '删除失败');
    }
    setTimeout(() => setMessage(''), 3000);
  }

  async function cleanup() {
    if (!confirm(`确定清理 ${cleanupDays} 天前所有已结束的直播间吗？此操作无法恢复。`)) return;
    try {
      const res = await api.admin.cleanupRooms(cleanupDays);
      setMessage(res.message);
      loadRooms();
    } catch (e: any) {
      setMessage(e.message || '清理失败');
    }
    setTimeout(() => setMessage(''), 3000);
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">直播间管理</h1>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-blue-600/20 text-blue-300 text-sm">{message}</div>
      )}

      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadRooms()}
          className="input-field max-w-xs"
          placeholder="搜索标题或主播昵称"
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-field max-w-xs"
        >
          <option value="">全部状态</option>
          <option value="live">直播中</option>
          <option value="ended">已结束</option>
          <option value="created">未开播</option>
        </select>
        <button onClick={loadRooms} className="btn-secondary">搜索</button>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-slate-400">一键清理</span>
          <select
            value={cleanupDays}
            onChange={e => setCleanupDays(parseInt(e.target.value))}
            className="bg-slate-800 rounded px-2 py-1 text-sm"
          >
            <option value={1}>1 天前</option>
            <option value={3}>3 天前</option>
            <option value={7}>7 天前</option>
            <option value={30}>30 天前</option>
          </select>
          <span className="text-sm text-slate-400">结束的直播间</span>
          <button onClick={cleanup} className="px-3 py-1 rounded text-sm bg-red-600 hover:bg-red-700">
            清理
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">标题</th>
              <th className="text-left p-3">主播</th>
              <th className="text-left p-3">状态</th>
              <th className="text-left p-3">观众数</th>
              <th className="text-left p-3">创建时间</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">暂无直播间记录</td>
              </tr>
            )}
            {rooms.map(room => (
              <tr key={room.id} className="border-b border-slate-800/50">
                <td className="p-3">{room.id}</td>
                <td className="p-3">{room.title || '-'}</td>
                <td className="p-3">{room.host_nickname || room.host_username}</td>
                <td className="p-3">
                  <span className={statusMap[room.status]?.cls || 'text-slate-400'}>
                    {room.status === 'live' && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1" />}
                    {statusMap[room.status]?.label || room.status}
                  </span>
                </td>
                <td className="p-3">{room.viewer_count}</td>
                <td className="p-3 text-slate-400">{new Date(room.created_at).toLocaleString('zh-CN')}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/live/${room.id}`}
                      className="px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700"
                    >
                      {room.status === 'live' ? '进入观看' : '查看'}
                    </Link>
                    {room.status !== 'live' && (
                      <button
                        onClick={() => deleteRoom(room.id)}
                        className="px-2 py-1 rounded text-xs bg-red-600 hover:bg-red-700"
                      >
                        删除
                      </button>
                    )}
                  </div>
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
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary !py-1 !px-3 text-sm"
            >
              上一页
            </button>
            <span className="px-3 py-1">{page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 20 >= total}
              className="btn-secondary !py-1 !px-3 text-sm"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
