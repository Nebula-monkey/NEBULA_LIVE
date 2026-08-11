'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';
import { api } from '@/lib/api';

interface User {
  id: number;
  username: string;
  nickname: string;
  role: string;
  points: number;
  frozen: number;
  avatar: string;
  created_at: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editPoints, setEditPoints] = useState('');

  useEffect(() => {
    loadUsers();
  }, [page, roleFilter]);

  async function loadUsers() {
    try {
      const res = await api.admin.getUsers({ page, pageSize: 20, search, role: roleFilter });
      setUsers(res.users);
      setTotal(res.total);
    } catch {}
  }

  async function freezeUser(id: number, frozen: boolean) {
    try {
      await api.admin.freezeUser(id, frozen);
      loadUsers();
    } catch (e: any) {
      alert(`操作失败：${e.message}`);
    }
  }

  async function changeRole(id: number, role: string) {
    try {
      await api.admin.setUserRole(id, role);
      loadUsers();
    } catch (e: any) {
      alert(`操作失败：${e.message}`);
    }
  }

  async function adjustPoints() {
    if (!selectedUser || !editPoints) return;
    try {
      await api.admin.adjustPoints(selectedUser.id, parseInt(editPoints));
      setSelectedUser(null);
      setEditPoints('');
      loadUsers();
    } catch (e: any) {
      alert(`调整积分失败：${e.message}`);
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">用户管理</h1>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadUsers()}
          className="input-field max-w-xs"
          placeholder="搜索用户名或昵称"
        />
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="input-field max-w-xs"
        >
          <option value="">全部角色</option>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
        <button onClick={loadUsers} className="btn-secondary">搜索</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">用户名</th>
              <th className="text-left p-3">昵称</th>
              <th className="text-left p-3">角色</th>
              <th className="text-left p-3">积分</th>
              <th className="text-left p-3">状态</th>
              <th className="text-left p-3">注册时间</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-800/50">
                <td className="p-3">{user.id}</td>
                <td className="p-3">{user.username}</td>
                <td className="p-3">{user.nickname || '-'}</td>
                <td className="p-3">
                  <select
                    value={user.role}
                    onChange={e => changeRole(user.id, e.target.value)}
                    className="bg-slate-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </td>
                <td className="p-3 text-yellow-400">{user.points}</td>
                <td className="p-3">
                  {user.frozen ? (
                    <span className="text-red-400">已冻结</span>
                  ) : (
                    <span className="text-green-400">正常</span>
                  )}
                </td>
                <td className="p-3 text-slate-400">{new Date(user.created_at).toLocaleDateString('zh-CN')}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => freezeUser(user.id, !user.frozen)}
                      className={`px-2 py-1 rounded text-xs ${user.frozen ? 'bg-green-600' : 'bg-red-600'}`}
                    >
                      {user.frozen ? '解冻' : '冻结'}
                    </button>
                    <button
                      onClick={() => { setSelectedUser(user); setEditPoints(''); }}
                      className="px-2 py-1 rounded text-xs bg-blue-600"
                    >
                      调整积分
                    </button>
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

      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedUser(null)}>
          <div className="card p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">调整积分 - {selectedUser.nickname || selectedUser.username}</h3>
            <p className="text-sm text-slate-400 mb-4">当前积分: {selectedUser.points}</p>
            <input
              type="number"
              value={editPoints}
              onChange={e => setEditPoints(e.target.value)}
              className="input-field mb-4"
              placeholder="输入积分变动值（正为增加，负为减少）"
            />
            <div className="flex gap-2">
              <button onClick={adjustPoints} className="btn-primary flex-1">确认</button>
              <button onClick={() => setSelectedUser(null)} className="btn-secondary">取消</button>
            </div>
            <p className="text-xs text-slate-500 mt-2">例如：输入 100 增加100积分，输入 -50 减少50积分</p>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}