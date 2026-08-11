'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Device, types as mediasoupTypes } from 'mediasoup-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { getSocket } from '@/lib/socket';
import Link from 'next/link';

interface Room {
  id: number;
  title: string;
  description: string;
  status: string;
  viewer_count: number;
  user_id: number;
  username: string;
  nickname: string;
  stream_key: string;
}

interface ChatMessage {
  id: number;
  username: string;
  content: string;
  created_at: number;
}

interface Gift {
  id: number;
  name: string;
  points_cost: number;
  icon: string;
  description?: string;
}

interface TransportOptions {
  id: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
}

// 各礼物主题的飘条配色（图标 → 边框颜色）
const GIFT_BAR_THEMES: Record<string, string> = {
  '🌸': 'border-pink-400/50',
  '🍭': 'border-purple-400/50',
  '❤️': 'border-red-400/50',
  '🌹': 'border-rose-400/50',
  '☕': 'border-amber-600/50',
  '🎂': 'border-orange-300/50',
  '🎆': 'border-blue-400/50',
  '🏎️': 'border-cyan-400/50',
  '💍': 'border-yellow-300/60',
  '👑': 'border-yellow-300/60',
};

export default function LiveRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, refreshUser, updatePoints, loading: authLoading } = useAuth();
  const roomId = Number(params.id);

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [floatGifts, setFloatGifts] = useState<{ id: number; icon: string; name: string; sender: string; points: number }[]>([]);
  const [centerEffect, setCenterEffect] = useState<{ id: number; icon: string; tier: 'mid' | 'luxury' } | null>(null);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const [viewerMuted, setViewerMuted] = useState(true);
  const [videoBlocked, setVideoBlocked] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatError, setChatError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const socketRef = useRef<any>(null);

  // Mediasoup 相关
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const producersRef = useRef<Map<string, mediasoupTypes.Producer>>(new Map());
  const consumersRef = useRef<Map<string, mediasoupTypes.Consumer>>(new Map());
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const isHostRef = useRef(false);
  const roomIdRef = useRef(roomId);
  const viewerJoinedRef = useRef(false);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    // 等待登录态恢复后再判断主播/观众身份，避免刷新页面时主播被误判为观众
    if (authLoading) return;
    loadRoom();
    loadGifts();

    const socket = getSocket();
    socketRef.current = socket;

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages(prev => [...prev.slice(-49), msg]);
    });

    socket.on('viewer:update', ({ count }: { count: number }) => {
      setRoom(prev => prev ? { ...prev, viewer_count: count } : prev);
    });

    socket.on('gift:sent', (data: any) => {
      const pts = data.points || 0;
      const entryId = Date.now() + Math.random();
      setFloatGifts(prev => [...prev, { id: entryId, icon: data.giftIcon, name: data.giftName, sender: data.senderNickname, points: pts }]);
      setTimeout(() => {
        setFloatGifts(prev => prev.filter(g => g.id !== entryId));
      }, pts >= 5200 ? 3500 : 2400);

      // 中档以上礼物（≥520 积分）额外触发画面中央大图标特效
      if (pts >= 500) {
        const effectId = Date.now() + Math.random();
        const tier = pts >= 5200 ? 'luxury' : 'mid';
        setCenterEffect({ id: effectId, icon: data.giftIcon, tier });
        setTimeout(() => {
          setCenterEffect(prev => (prev?.id === effectId ? null : prev));
        }, tier === 'luxury' ? 3500 : 2500);
      }
    });

    socket.on('room:ended', () => {
      setIsLive(false);
      stopStream();
    });

    socket.on('host:left', () => {
      if (!isHostRef.current) {
        setIsLive(false);
        cleanupViewerMedia();
      }
    });

    // 观众先进房间、主播后开播的场景：主播上线后重新发起拉流
    socket.on('host:online', () => {
      if (!isHostRef.current && !viewerJoinedRef.current) {
        setIsLive(true);
        joinAsViewer();
      }
    });

    // 主播新推流（开播 / 切换屏幕共享）时，观众发起消费
    socket.on('producer:new', ({ producerId, kind }: { producerId: string; kind: string }) => {
      if (!isHostRef.current && !consumersRef.current.has(producerId)) {
        consumeProducer({ producerId, kind });
      }
    });

    socket.on('producer:closed', ({ producerId }: { producerId: string }) => {
      const consumer = consumersRef.current.get(producerId);
      if (consumer) {
        consumer.close();
        consumersRef.current.delete(producerId);
        const stream = remoteStreamRef.current;
        if (stream) {
          try {
            stream.removeTrack(consumer.track);
          } catch {}
          refreshVideoPlayback();
        }
      }
    });

    socket.on('producer:paused', ({ producerId }: { producerId: string }) => {
      consumersRef.current.get(producerId)?.pause();
    });

    socket.on('producer:resumed', ({ producerId }: { producerId: string }) => {
      consumersRef.current.get(producerId)?.resume();
    });

    return () => {
      socket.off('chat:message');
      socket.off('viewer:update');
      socket.off('gift:sent');
      socket.off('room:ended');
      socket.off('host:left');
      socket.off('host:online');
      socket.off('producer:new');
      socket.off('producer:closed');
      socket.off('producer:paused');
      socket.off('producer:resumed');

      if (!isHostRef.current && viewerJoinedRef.current) {
        socket.emit('room:leave', { roomId: roomIdRef.current });
      }

      stopStream();
      cleanupViewerMedia();
    };
  }, [roomId, authLoading]);

  async function loadRoom() {
    try {
      const res = await api.rooms.get(roomId);
      setRoom(res.room);
      const hostFlag = user?.id === res.room.user_id;
      setIsHost(hostFlag);
      const liveFlag = res.room.status === 'live';
      setIsLive(liveFlag);

      if (liveFlag && !hostFlag) {
        joinAsViewer();
      }
    } catch (err: any) {
      setError(err.message || '房间不存在');
    } finally {
      setLoading(false);
    }
  }

  async function loadGifts() {
    try {
      const res = await api.gifts.list();
      setGifts(res.gifts || []);
    } catch {}
  }

  // ==================== 观众端：Mediasoup 拉流 ====================

  // 切换轨道后重新绑定并尝试播放；若被浏览器的自动播放策略拦截，
  // 显示“点击播放”按钮，避免静默黑屏
  function refreshVideoPlayback() {
    const v = videoRef.current;
    const stream = remoteStreamRef.current;
    if (!v || !stream) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream;
    }
    v.play().then(() => setVideoBlocked(false)).catch(() => setVideoBlocked(true));
  }

  async function joinAsViewer() {
    const socket = socketRef.current;
    if (!socket || viewerJoinedRef.current) return;

    socket.emit('viewer:join-room', {
      roomId,
      userId: user?.id,
      username: user?.nickname
    }, async (res: any) => {
      if (res?.error) {
        // 主播未上线时不提示错误，等 host:online 事件后重试
        if (res.error !== '主播未在线' && res.error !== '主播未就绪') {
          setError(res.error);
        }
        return;
      }

      viewerJoinedRef.current = true;

      try {
        const device = new Device();
        await device.load({ routerRtpCapabilities: res.routerRtpCapabilities });
        deviceRef.current = device;

        const recvTransport = device.createRecvTransport(res.viewerTransport as TransportOptions);
        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          socket.emit('transport:connect', {
            transportId: recvTransport.id,
            dtlsParameters
          }, (r: any) => {
            if (r?.error) errback(new Error(r.error));
            else callback();
          });
        });
        recvTransportRef.current = recvTransport;

        // 消费主播已有的所有 Producer
        for (const p of res.producers || []) {
          await consumeProducer(p);
        }
      } catch (err: any) {
        console.error('Viewer join error:', err);
        setError('无法建立视频连接: ' + (err.message || err));
      }
    });
  }

  async function consumeProducer({ producerId, kind }: { producerId: string; kind: string }) {
    const socket = socketRef.current;
    const device = deviceRef.current;
    const recvTransport = recvTransportRef.current;
    if (!socket || !device || !recvTransport) return;

    socket.emit('viewer:consume', {
      producerId,
      rtpCapabilities: device.rtpCapabilities
    }, async (res: any) => {
      if (res?.error) {
        console.error('Consume error:', res.error);
        return;
      }

      try {
        const consumer = await recvTransport.consume({
          id: res.consumer.id,
          producerId: res.consumer.producerId,
          kind: res.consumer.kind,
          rtpParameters: res.consumer.rtpParameters
        });

        consumersRef.current.set(producerId, consumer);

        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(consumer.track);
        refreshVideoPlayback();

        // 恢复消费（mediasoup 的 video consumer 默认暂停，需要 keyframe 同步后恢复）
        await consumer.resume();
        socket.emit('viewer:resume-consumer', { consumerId: consumer.id });
      } catch (err: any) {
        console.error('Recv transport consume error:', err);
        setError(`拉流失败（${kind}）：${err?.message || err}，请刷新页面重试`);
      }
    });
  }

  function cleanupViewerMedia() {
    consumersRef.current.forEach(c => {
      try { c.close(); } catch {}
    });
    consumersRef.current.clear();
    recvTransportRef.current?.close();
    recvTransportRef.current = null;
    deviceRef.current = null;
    remoteStreamRef.current = null;
    viewerJoinedRef.current = false;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // ==================== 主播端：Mediasoup 推流 ====================

  async function startStream() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('浏览器禁止在当前页面使用摄像头：http 公网地址不属于安全环境。请在浏览器 flags 中将本站加入白名单（edge://flags/#unsafely-treat-insecure-origin-as-secure），或为平台配置 HTTPS 域名后重试。');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true
      });
      streamRef.current = stream;
      cameraStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setHasLocalStream(true);
      setMicOn(true);
      setCamOn(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      await produceToServer(stream);

      await api.rooms.start(roomId);
      setIsLive(true);
    } catch (err: any) {
      // 把浏览器拒绝采集的英文错误名翻译成具体原因
      const mediaErrors: Record<string, string> = {
        NotAllowedError: '摄像头/麦克风权限被拒绝：请点击浏览器地址栏左侧的锁形图标，允许摄像头和麦克风权限后重试',
        NotFoundError: '未检测到摄像头/麦克风设备：请确认设备已连接且未被其他程序占用',
        NotReadableError: '摄像头/麦克风被其他程序占用：请关闭占用设备的应用后重试'
      };
      setError(mediaErrors[err?.name] || err.message || '无法访问摄像头/麦克风');
    }
  }

  async function produceToServer(stream: MediaStream) {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket 未连接');

    const res: any = await new Promise(resolve => {
      socket.emit('room:host-join', {
        roomId,
        userId: user?.id,
        username: user?.nickname,
        streamKey: room?.stream_key
      }, resolve);
    });

    if (res?.error) {
      throw new Error(res.error);
    }

    const device = new Device();
    await device.load({ routerRtpCapabilities: res.routerRtpCapabilities });
    deviceRef.current = device;

    const sendTransport = device.createSendTransport(res.hostTransport as TransportOptions);

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      socket.emit('transport:connect', {
        transportId: sendTransport.id,
        dtlsParameters
      }, (r: any) => {
        if (r?.error) errback(new Error(r.error));
        else callback();
      });
    });

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      socket.emit('host:produce', { kind, rtpParameters, appData }, (r: any) => {
        if (r?.error) errback(new Error(r.error));
        else callback({ id: r.producerId });
      });
    });

    sendTransportRef.current = sendTransport;

    // 逐个轨道推流（视频轨道限制码率上限，保证画质）
    for (const track of stream.getTracks()) {
      const producer = await sendTransport.produce(
        track.kind === 'video'
          ? { track, encodings: [{ maxBitrate: 2000000 }] }
          : { track }
      );
      producersRef.current.set(producer.kind, producer);
    }
  }

  async function replaceVideoTrack(track: MediaStreamTrack) {
    const sendTransport = sendTransportRef.current;
    const socket = socketRef.current;
    if (!sendTransport || !socket) return;

    const oldProducer = producersRef.current.get('video');
    if (oldProducer) {
      socket.emit('host:close-producer', { producerId: oldProducer.id });
      oldProducer.close();
      producersRef.current.delete('video');
    }

    const producer = await sendTransport.produce({ track, encodings: [{ maxBitrate: 2000000 }] });
    producersRef.current.set('video', producer);
  }

  // 主播开关麦克风/摄像头：通过暂停/恢复 Producer 实现，观众端会同步暂停/恢复消费
  function toggleMic() {
    const p = producersRef.current.get('audio');
    if (!p) return;
    if (p.paused) {
      p.resume();
      setMicOn(true);
    } else {
      p.pause();
      setMicOn(false);
    }
  }

  function toggleCam() {
    const p = producersRef.current.get('video');
    if (!p) return;
    if (p.paused) {
      p.resume();
      setCamOn(true);
    } else {
      p.pause();
      setCamOn(false);
    }
  }

  async function enableScreenShare() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setError('浏览器禁止在当前页面进行屏幕共享：http 公网地址不属于安全环境。请将本站加入浏览器 flags 白名单或配置 HTTPS 域名。');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false
      });

      const screenTrack = stream.getVideoTracks()[0];
      // 主画面切为屏幕共享；小窗强制保持摄像头画面
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      if (localVideoRef.current && cameraStreamRef.current) {
        localVideoRef.current.srcObject = cameraStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }

      await replaceVideoTrack(screenTrack);

      // 用户主动停止共享时切回摄像头
      screenTrack.onended = () => {
        switchBackToCamera();
      };
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setError(err.message || '屏幕共享失败');
      }
    }
  }

  async function switchBackToCamera() {
    try {
      let camStream = cameraStreamRef.current;
      const camVideoTrack = camStream?.getVideoTracks()[0];

      // 摄像头流不可用时重新采集（音频优先沿用原来的麦克风轨道）
      if (!camStream || !camVideoTrack || camVideoTrack.readyState === 'ended') {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
        });
        const oldAudio = cameraStreamRef.current?.getAudioTracks() || streamRef.current?.getAudioTracks() || [];
        camStream = new MediaStream([...fresh.getVideoTracks(), ...oldAudio]);
        cameraStreamRef.current = camStream;
      }

      cameraTrackRef.current = camStream.getVideoTracks()[0];
      streamRef.current = camStream;
      if (videoRef.current) {
        videoRef.current.srcObject = camStream;
        videoRef.current.play().catch(() => {});
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = camStream;
        localVideoRef.current.play().catch(() => {});
      }

      await replaceVideoTrack(camStream.getVideoTracks()[0]);
    } catch (err: any) {
      console.error('Switch back to camera error:', err);
      setError(`切回摄像头失败：${err?.message || err}，请重新开播`);
    }
  }

  function stopStream() {
    producersRef.current.forEach(p => {
      try { p.close(); } catch {}
    });
    producersRef.current.clear();
    sendTransportRef.current?.close();
    sendTransportRef.current = null;
    deviceRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (cameraStreamRef.current && cameraStreamRef.current !== streamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
    }
    cameraStreamRef.current = null;
    if (cameraTrackRef.current) {
      try { cameraTrackRef.current.stop(); } catch {}
      cameraTrackRef.current = null;
    }
    setHasLocalStream(false);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (videoRef.current && isHostRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function endStream() {
    try {
      await api.rooms.end(roomId);
      setIsLive(false);

      const socket = socketRef.current;
      if (socket) {
        socket.emit('host:leave', { roomId });
      }

      stopStream();
    } catch (err: any) {
      setError(err.message || '结束直播失败：请检查网络连接后重试');
    }
  }

  function unmuteVideo() {
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      v.play().catch(() => {});
    }
    setViewerMuted(false);
  }

  async function sendGift(gift: Gift) {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const res = await api.gifts.send({
        roomId,
        receiverId: room?.user_id || 0,
        giftId: gift.id
      });
      if (res.senderPoints !== undefined && res.senderPoints !== null) {
        updatePoints(res.senderPoints);
      } else {
        refreshUser();
      }
      setShowGiftPanel(false);
    } catch (err: any) {
      setError(err.message || '礼物发送失败：请检查积分是否充足、网络是否正常');
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || !socketRef.current) return;
    setChatError('');
    socketRef.current.emit('chat:message', {
      roomId,
      content: chatInput.trim()
    }, (res: any) => {
      if (res?.error) setChatError(res.error);
    });
    setChatInput('');
  }

  // 本地预览元素在状态更新后才挂载，需要补一次 srcObject 绑定；
  // 小窗优先显示摄像头画面，屏幕共享时小窗不被屏幕画面占据
  useEffect(() => {
    if (isHost && hasLocalStream && localVideoRef.current) {
      const preview = cameraStreamRef.current || streamRef.current;
      if (preview && localVideoRef.current.srcObject !== preview) {
        localVideoRef.current.srcObject = preview;
      }
    }
  });

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-slate-400">加载中...</div></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-red-400">{error}</div>
        <Link href="/" className="btn-secondary">返回首页</Link>
      </div>
    );
  }

  if (!room) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isHost ? true : viewerMuted}
              className="w-full h-full object-contain"
            />
            {!isLive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
                <div className="text-6xl mb-4">📺</div>
                <p className="text-slate-400 mb-4">主播尚未开播</p>
                {isHost && (
                  <button onClick={startStream} className="btn-primary">
                    开始直播
                  </button>
                )}
              </div>
            )}
            {isLive && isHost && hasLocalStream && (
              <video
                ref={el => {
                  localVideoRef.current = el;
                  // 元素挂载/重建时强制绑定摄像头画面，避免小窗被主画面流覆盖
                  if (el) {
                    const preview = cameraStreamRef.current || streamRef.current;
                    if (preview && el.srcObject !== preview) {
                      el.srcObject = preview;
                      el.play().catch(() => {});
                    }
                  }
                }}
                autoPlay
                muted
                playsInline
                className="absolute bottom-4 right-4 w-32 h-44 object-cover rounded-lg border-2 border-white/30"
              />
            )}

            {/* 浏览器自动播放策略拦截未静音视频，观众需要点一下开启声音 */}
            {isLive && !isHost && viewerMuted && (
              <button
                onClick={unmuteVideo}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm"
              >
                🔊 点击开启声音
              </button>
            )}

            {/* 主播切换屏幕共享等操作后视频被暂停时，提示观众点击继续播放 */}
            {isLive && !isHost && videoBlocked && (
              <button
                onClick={() => {
                  videoRef.current?.play().then(() => setVideoBlocked(false)).catch(() => {});
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 text-white px-6 py-3 rounded-full"
              >
                ▶ 点击播放画面
              </button>
            )}

            {/* 礼物飘条特效（左下角堆叠，不遮挡画面主体；按礼物主题配色，高档礼物金色流光） */}
            <div className="absolute left-3 bottom-16 flex flex-col-reverse gap-2 pointer-events-none">
              {floatGifts.map(g => {
                const luxury = g.points >= 5200;
                const theme = GIFT_BAR_THEMES[g.icon] || 'border-yellow-400/30';
                return (
                  <div
                    key={g.id}
                    className={`${luxury ? 'gift-bar-luxury' : 'gift-pop'} flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full pl-2 pr-4 py-1.5 border shadow-lg ${theme}`}
                  >
                    <span className="text-2xl">{g.icon}</span>
                    <span className="text-sm text-white whitespace-nowrap">
                      {g.sender} <span className="text-yellow-300">送出 {g.name}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 中档以上礼物：画面中央大图标特效 */}
            {centerEffect && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className={`${centerEffect.tier === 'luxury' ? 'gift-luxury' : 'gift-center-zoom'} text-8xl md:text-9xl`}>
                  {centerEffect.icon}
                </span>
              </div>
            )}

            <div className="absolute top-4 left-4 flex items-center gap-2">
              {isLive && <span className="badge-live">LIVE</span>}
              <span className="bg-black/60 px-3 py-1 rounded text-sm">
                👁 {room.viewer_count}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{room.title}</h1>
              <p className="text-slate-400 text-sm">{room.nickname}</p>
            </div>
            {isHost && isLive && (
              <div className="flex flex-wrap gap-2">
                <button onClick={toggleMic} className="btn-secondary text-sm">
                  {micOn ? '🎤 关麦' : '🎤 开麦'}
                </button>
                <button onClick={toggleCam} className="btn-secondary text-sm">
                  {camOn ? '📷 关摄像头' : '📷 开摄像头'}
                </button>
                <button onClick={enableScreenShare} className="btn-secondary text-sm">
                  🖥️ 屏幕共享
                </button>
                <button onClick={endStream} className="btn-primary text-sm">
                  结束直播
                </button>
              </div>
            )}
          </div>

          {room.description && (
            <p className="text-slate-400 text-sm mt-2">{room.description}</p>
          )}
        </div>

        <div className="w-full lg:w-80 flex flex-col gap-4">
          <div className="card p-4 flex-1 flex flex-col" style={{ maxHeight: '500px' }}>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              💬 聊天
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[160px] max-h-64">
              {messages.map(msg => (
                <div key={msg.id} className="text-sm">
                  {msg.username === '系统' ? (
                    <span className="text-yellow-300">🎁 {msg.content}</span>
                  ) : (
                    <>
                      <span className="text-red-400 font-medium">{msg.username}:</span>{' '}
                      <span className="text-slate-300">{msg.content}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                enterKeyHint="send"
                className="input-field text-sm"
                placeholder="说点什么..."
              />
              <button onClick={sendChatMessage} className="btn-primary !px-4 text-sm shrink-0">
                发送
              </button>
            </div>
            {chatError && (
              <div className="text-red-400 text-xs mt-2">{chatError}</div>
            )}
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">🎁 送礼物</h3>
              <span className="text-sm text-slate-400">
                {user?.points || 0} 积分
              </span>
            </div>
            <button
              onClick={() => setShowGiftPanel(!showGiftPanel)}
              className="w-full btn-secondary text-sm"
            >
              {showGiftPanel ? '收起' : '选择礼物'}
            </button>
            {showGiftPanel && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {gifts.map(gift => (
                  <button
                    key={gift.id}
                    onClick={() => sendGift(gift)}
                    className="flex flex-col items-center p-2 rounded hover:bg-slate-700 transition-colors"
                  >
                    <span className="text-2xl">{gift.icon}</span>
                    <span className="text-xs text-slate-400">{gift.name}</span>
                    <span className="text-xs text-yellow-400">{gift.points_cost}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
