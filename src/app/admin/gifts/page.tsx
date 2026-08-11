'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';
import { api } from '@/lib/api';

interface Gift {
  id: number;
  name: string;
  points_cost: number;
  icon: string;
  description: string;
}

const defaultIcons = ['🌸', '🍭', '❤️', '🌹', '☕', '🎂', '🎆', '🏎️', '💍', '👑', '💎', '🎁', '⭐', '🔥', '🎉', '🍺', '🍷', '🎵', '🌈', '☀️'];

export default function AdminGiftsPage() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [editing, setEditing] = useState<Gift | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', pointsCost: 10, icon: '🎁', description: '' });

  useEffect(() => {
    loadGifts();
  }, []);

  async function loadGifts() {
    try {
      const res = await api.gifts.list();
      setGifts(res.gifts);
    } catch {}
  }

  async function handleSubmit() {
    try {
      if (editing) {
        await api.admin.updateGift(editing.id, form);
      } else {
        await api.admin.createGift(form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', pointsCost: 10, icon: '🎁', description: '' });
      loadGifts();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除此礼物？')) return;
    try {
      await api.admin.deleteGift(id);
      loadGifts();
    } catch (e: any) {
      alert(`删除失败：${e.message}`);
    }
  }

  function startEdit(gift: Gift) {
    setEditing(gift);
    setForm({
      name: gift.name,
      pointsCost: gift.points_cost,
      icon: gift.icon,
      description: gift.description || ''
    });
    setShowForm(true);
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">礼物管理</h1>
        <button onClick={() => { setEditing(null); setForm({ name: '', pointsCost: 10, icon: '🎁', description: '' }); setShowForm(true); }} className="btn-primary">
          + 新礼物
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h3 className="font-semibold mb-4">{editing ? '编辑礼物' : '创建新礼物'}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2">礼物名称</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="如：鲜花" />
            </div>
            <div>
              <label className="block text-sm mb-2">积分价格</label>
              <input type="number" value={form.pointsCost} onChange={e => setForm({ ...form, pointsCost: parseInt(e.target.value) })} className="input-field" min="1" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-2">选择图标</label>
              <div className="grid grid-cols-10 gap-2 p-3 bg-slate-800 rounded-lg">
                {defaultIcons.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setForm({ ...form, icon })}
                    className={`text-2xl p-2 rounded transition-colors ${form.icon === icon ? 'bg-red-500' : 'hover:bg-slate-700'}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-2">描述</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" placeholder="礼物描述（可选）" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} className="btn-primary">{editing ? '保存' : '创建'}</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary">取消</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {gifts.map(gift => (
          <div key={gift.id} className="card p-4 text-center">
            <div className="text-4xl mb-2">{gift.icon}</div>
            <div className="font-semibold">{gift.name}</div>
            <div className="text-yellow-400 text-sm mb-2">{gift.points_cost} 积分</div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => startEdit(gift)} className="text-xs px-2 py-1 bg-blue-600 rounded">编辑</button>
              <button onClick={() => handleDelete(gift.id)} className="text-xs px-2 py-1 bg-red-600 rounded">删除</button>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}