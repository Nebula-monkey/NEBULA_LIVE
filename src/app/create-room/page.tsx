'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function CreateRoomPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('请输入直播标题');
      return;
    }

    setLoading(true);
    try {
      const res = await api.rooms.create({ title: title.trim(), description });
      router.push(`/live/${res.room.id}`);
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">创建直播间</h1>
        <p className="text-slate-400">设置你的直播间信息，开启精彩直播</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-8 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">直播标题 <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input-field"
            placeholder="输入吸引人的直播标题"
            maxLength={50}
          />
          <p className="text-xs text-slate-500 mt-1">{title.length}/50</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">直播介绍</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="input-field resize-none"
            rows={4}
            placeholder="介绍一下你的直播内容吧"
            maxLength={200}
          />
          <p className="text-xs text-slate-500 mt-1">{description.length}/200</p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-400">
          <p className="font-medium text-slate-300 mb-2">📌 温馨提示</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>每个用户最多可创建 5 个直播间</li>
            <li>创建后可在直播间页面点击"开始直播"开播</li>
            <li>支持摄像头、麦克风和屏幕共享</li>
          </ul>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? '创建中...' : '创建直播间'}
        </button>
      </form>
    </div>
  );
}