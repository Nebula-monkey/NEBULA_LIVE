'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function RechargePage() {
  const { user, refreshUser } = useAuth();
  const [qrCode, setQrCode] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [message, setMessage] = useState('');
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    loadQRCode();
  }, []);

  async function loadQRCode() {
    try {
      const res = await api.finance.getRechargeQR();
      setQrCode(res.qr);
    } catch (err: any) {
      setQrError(err.message || '加载收款码失败');
    }
  }

  async function handleSubmit() {
    setMessage('');
    if (!amount || parseFloat(amount) <= 0) {
      setMessage('请输入有效金额');
      return;
    }
    const points = Math.floor(parseFloat(amount) * 10);
    if (!previewUrl) {
      setMessage('请上传支付凭证');
      return;
    }
    if (!confirm(`确认充值 ${amount} 元 = ${points} 积分？`)) return;

    try {
      const fd = new FormData();
      fd.append('amount', String(parseFloat(amount)));
      if (paymentProof) fd.append('proofImage', paymentProof);
      await api.finance.createRecharge(fd);
      setMessage('充值申请已提交，请等待管理员确认');
      setAmount('');
      setPaymentProof(null);
      setPreviewUrl('');
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPaymentProof(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">积分充值</h1>
        <p className="text-slate-400">1元 = 10积分，充值后可用于打赏主播</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">微信收款码</h2>
          {qrCode ? (
            <div className="flex flex-col items-center">
              <img
                src={qrCode.image_url}
                alt="微信收款码"
                className="w-64 h-64 object-contain rounded-lg"
              />
              <p className="mt-4 text-sm text-slate-400 text-center">
                请使用微信扫描上方二维码支付<br />
                支付完成后提交充值申请
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <div className="text-4xl mb-2">⏳</div>
              {qrError ? (
                <>
                  <p className="text-red-400">收款码加载失败</p>
                  <p className="text-xs mt-1">{qrError}</p>
                </>
              ) : (
                <>
                  <p>管理员尚未上传收款码</p>
                  <p className="text-xs mt-1">请稍后再来</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-4">提交充值申请</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">充值金额（元）</label>
              <div className="flex gap-2 mb-2">
                {[10, 50, 100, 500].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmount(String(amt))}
                    className={`px-3 py-1 rounded text-sm ${amount === String(amt) ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                  >
                    ¥{amt}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input-field"
                placeholder="输入充值金额"
              />
              {amount && (
                <p className="text-sm text-yellow-400 mt-2">
                  获得积分: {Math.floor(parseFloat(amount || '0') * 10)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm mb-2">支付凭证（必选）</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="input-field"
              />
              {previewUrl && (
                <img src={previewUrl} alt="支付凭证" className="mt-2 w-48 rounded-lg" />
              )}
            </div>

            {message && (
              <div className={`px-4 py-3 rounded-lg text-sm ${
                message.includes('已提交') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {message}
              </div>
            )}

            <button onClick={handleSubmit} className="btn-primary w-full">
              提交充值申请
            </button>

            <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">📌 充值说明</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>支付后需提交申请，管理员手动确认</li>
                <li>审核通过后积分将自动到账</li>
                <li>如有问题请联系管理员</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {user && (
        <div className="mt-6 card p-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">当前积分</span>
            <span className="text-2xl font-bold text-yellow-400">{user.points}</span>
          </div>
        </div>
      )}
    </div>
  );
}