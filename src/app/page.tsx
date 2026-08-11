'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

interface Room {
  id: number;
  title: string;
  status: string;
  viewer_count: number;
  username: string;
  nickname: string;
  user_id: number;
  cover_image?: string;
}

export default function HomePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadRooms();
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadRooms() {
    try {
      const res = await api.rooms.list({ status: 'live' });
      setRooms(res.rooms || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">热门直播</h1>
          <p className="text-slate-400">发现精彩内容，与主播实时互动</p>
        </div>
        {user && (
          <Link href="/create-room" className="btn-primary">
            + 创建直播间
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-400">加载中...</div>
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="text-6xl mb-4">📺</div>
          <p className="text-xl mb-2">暂无直播</p>
          <p className="text-sm">快来创建第一个直播间吧！</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {rooms.map(room => (
            <Link
              key={room.id}
              href={`/live/${room.id}`}
              className="card card-hover block group"
            >
              <div className="relative aspect-video bg-slate-800 flex items-center justify-center overflow-hidden">
                {room.cover_image ? (
                  <img src={room.cover_image} alt={room.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-6xl opacity-30">🎬</div>
                )}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="badge-live">
                    LIVE
                  </span>
                  <span className="bg-black/60 px-2 py-1 rounded text-xs">
                    👁 {room.viewer_count}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold truncate group-hover:text-red-400 transition-colors">
                  {room.title}
                </h3>
                <div className="flex items-center gap-2 mt-2 text-sm text-slate-400">
                  <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs">
                    {room.nickname?.[0] || '?'}
                  </span>
                  <span className="truncate">{room.nickname || room.username}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {user && (
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-4">我的直播间</h2>
          <MyRoomsList />
        </div>
      )}
    </div>
  );
}

function MyRoomsList() {
  const [myRooms, setMyRooms] = useState<Room[]>([]);

  useEffect(() => {
    loadMyRooms();
  }, []);

  async function loadMyRooms() {
    try {
      const res = await api.rooms.mine();
      setMyRooms(res.rooms || []);
    } catch {}
  }

  if (myRooms.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {myRooms.map(room => (
        <Link
          key={room.id}
          href={`/live/${room.id}`}
          className="card card-hover p-4 block"
        >
          <div className="flex items-center justify-between mb-2">
            {room.status === 'live' ? (
              <span className="badge-live">LIVE</span>
            ) : (
              <span className="text-slate-500 text-sm">未开播</span>
            )}
            <span className="text-xs text-slate-500">👁 {room.viewer_count}</span>
          </div>
          <h4 className="font-semibold truncate">{room.title}</h4>
          <p className="text-xs text-slate-500 mt-2">ID: {room.id}</p>
        </Link>
      ))}
    </div>
  );
}