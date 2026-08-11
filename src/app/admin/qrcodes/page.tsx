'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';
import { api } from '@/lib/api';

interface QRCode {
  id: number;
  type: string;
  image_url: string;
  description: string;
  is_active: number;
  created_at: number;
}

export default function AdminQRCodesPage() {
  const [qrcodes, setQrcodes] = useState<QRCode[]>([]);
  const [type, setType] = useState('recharge');
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    loadQRCodes();
  }, [type]);

  async function loadQRCodes() {
    try {
      const res = await api.admin.getQRCodes(type);
      setQrcodes(res.qrs || []);
    } catch {}
  }

  async function handleUpload() {
    if (!fileInput?.files?.[0]) {
      alert('请选择图片');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', fileInput.files[0]);
      formData.append('type', type);
      formData.append('description', description);

      await api.admin.uploadQRCode(formData);
      setDescription('');
      setPreview('');
      if (fileInput) fileInput.value = '';
      loadQRCodes();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteQR(id: number) {
    if (!confirm('确认删除此二维码？')) return;
    try {
      await api.admin.deleteQRCode(id);
      loadQRCodes();
    } catch (e: any) {
      alert(`删除失败：${e.message}`);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setFileInput(e.target);
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-6">收款码管理</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setType('recharge'); }}
          className={`px-4 py-2 rounded-lg text-sm ${type === 'recharge' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          充值收款码
        </button>
        <button
          onClick={() => { setType('withdrawal'); }}
          className={`px-4 py-2 rounded-lg text-sm ${type === 'withdrawal' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          提现收款码
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-semibold mb-4">上传新收款码</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">选择图片</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="input-field"
              />
              {preview && (
                <img src={preview} alt="预览" className="mt-2 w-48 rounded-lg" />
              )}
            </div>
            <div>
              <label className="block text-sm mb-2">描述（可选）</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="input-field"
                placeholder="如：微信收款码1号"
              />
            </div>
            <button onClick={handleUpload} className="btn-primary w-full" disabled={uploading}>
              {uploading ? '上传中...' : '上传收款码'}
            </button>
            <p className="text-xs text-slate-500">上传新的收款码会自动将旧的设为不激活</p>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4">历史收款码</h3>
          <div className="space-y-3">
            {qrcodes.length === 0 ? (
              <p className="text-slate-500 text-sm">暂无记录</p>
            ) : qrcodes.map(qr => (
              <div key={qr.id} className="flex items-center gap-4 p-3 bg-slate-800 rounded-lg">
                <img
                  src={qr.image_url.startsWith('http') ? qr.image_url : `http://localhost:3001${qr.image_url}`}
                  alt="QR"
                  className="w-16 h-16 object-contain rounded bg-white"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{qr.description || '无描述'}</span>
                    {qr.is_active ? (
                      <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">当前使用</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-slate-600 text-slate-400 rounded">已失效</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{new Date(qr.created_at).toLocaleString('zh-CN')}</p>
                </div>
                <button
                  onClick={() => deleteQR(qr.id)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}