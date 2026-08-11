const API_BASE = '/api';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = {};
  
  const isFormData = options.body instanceof FormData;
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
  } catch {
    throw new Error('无法连接服务器：请检查网络是否正常，或服务器是否已停机');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // 拼接后端返回的详细原因；登录态失效给出明确指引
    if (res.status === 401) {
      throw new Error(data.error || '登录已过期，请重新登录');
    }
    const msg = data.error || `请求失败 (${res.status})`;
    throw new Error(data.detail ? `${msg}（${data.detail}）` : msg);
  }

  return res.json();
}

export const api = {
  auth: {
    register: (data: { username: string; password: string; nickname?: string }) =>
      apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { username: string; password: string }) =>
      apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    getMe: () => apiFetch('/auth/me'),
    updateProfile: (data: { nickname?: string; avatar?: string }) =>
      apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(data) })
  },
  rooms: {
    list: (params?: { status?: string }) => {
      const qs = params?.status ? `?status=${params.status}` : '';
      return apiFetch(`/rooms${qs}`);
    },
    get: (id: number) => apiFetch(`/rooms/${id}`),
    create: (data: { title: string; description?: string }) =>
      apiFetch('/rooms', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: number) => apiFetch(`/rooms/${id}/start`, { method: 'POST' }),
    end: (id: number) => apiFetch(`/rooms/${id}/end`, { method: 'POST' }),
    delete: (id: number) => apiFetch(`/rooms/${id}`, { method: 'DELETE' }),
    mine: () => apiFetch('/rooms/mine/list'),
    getStreamKey: (id: number) => apiFetch(`/rooms/${id}/stream-key`)
  },
  gifts: {
    list: () => apiFetch('/gifts'),
    send: (data: { roomId: number; receiverId: number; giftId: number }) =>
      apiFetch('/gifts/send', { method: 'POST', body: JSON.stringify(data) }),
    records: (type?: string) => {
      const qs = type ? `?type=${type}` : '';
      return apiFetch(`/gifts/records${qs}`);
    }
  },
  finance: {
    getRechargeQR: () => apiFetch('/finance/recharge-qr'),
    createRecharge: (formData: FormData) =>
      apiFetch('/finance/recharge', { method: 'POST', body: formData }),
    createWithdrawal: (formData: FormData) =>
      apiFetch('/finance/withdraw', { method: 'POST', body: formData }),
    myWithdrawals: () => apiFetch('/finance/my-withdrawals'),
    myTransactions: (type?: string) => {
      const qs = type ? `?type=${type}` : '';
      return apiFetch(`/finance/my-transactions${qs}`);
    }
  },
  admin: {
    getStats: () => apiFetch('/admin/stats'),
    getUsers: (params?: { page?: number; pageSize?: number; search?: string; role?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return apiFetch(`/admin/users?${qs}`);
    },
    freezeUser: (id: number, frozen: boolean) =>
      apiFetch(`/admin/users/${id}/freeze`, { method: 'PUT', body: JSON.stringify({ frozen }) }),
    setUserRole: (id: number, role: string) =>
      apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    adjustPoints: (id: number, points: number) =>
      apiFetch(`/admin/users/${id}/points`, { method: 'PUT', body: JSON.stringify({ points }) }),
    getTransactions: (params?: { page?: number; pageSize?: number; type?: string; status?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return apiFetch(`/admin/transactions?${qs}`);
    },
    updateTransactionStatus: (id: number, status: string, adminNote?: string) =>
      apiFetch(`/admin/transactions/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, adminNote })
      }),
    rejectTransaction: (id: number, adminNote?: string) =>
      apiFetch(`/admin/transactions/${id}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ adminNote })
      }),
    getWithdrawals: (params?: { page?: number; pageSize?: number; status?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return apiFetch(`/admin/withdrawals?${qs}`);
    },
    approveWithdrawal: (id: number) =>
      apiFetch(`/admin/withdrawals/${id}/approve`, { method: 'PUT' }),
    rejectWithdrawal: (id: number, adminNote?: string) =>
      apiFetch(`/admin/withdrawals/${id}/reject`, { method: 'PUT', body: JSON.stringify({ adminNote }) }),
    getQRCodes: (type?: string) => {
      const qs = type ? `?type=${type}` : '';
      return apiFetch(`/admin/qr-codes${qs}`);
    },
    uploadQRCode: (formData: FormData) =>
      apiFetch('/admin/qr-codes', { method: 'POST', body: formData }),
    deleteQRCode: (id: number) =>
      apiFetch(`/admin/qr-codes/${id}`, { method: 'DELETE' }),
    createGift: (data: { name: string; pointsCost: number; icon: string; description?: string }) =>
      apiFetch('/admin/gifts', { method: 'POST', body: JSON.stringify(data) }),
    updateGift: (id: number, data: any) =>
      apiFetch(`/admin/gifts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteGift: (id: number) =>
      apiFetch(`/admin/gifts/${id}`, { method: 'DELETE' }),
    getGiftRecords: (params?: { page?: number; pageSize?: number; roomId?: number }) => {
      const qs = new URLSearchParams(params as any).toString();
      return apiFetch(`/admin/gift-records?${qs}`);
    },
    getRooms: (params?: { page?: number; pageSize?: number; status?: string; search?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return apiFetch(`/admin/rooms?${qs}`);
    },
    deleteRoom: (id: number) =>
      apiFetch(`/admin/rooms/${id}`, { method: 'DELETE' }),
    cleanupRooms: (days: number) =>
      apiFetch('/admin/rooms/cleanup', { method: 'POST', body: JSON.stringify({ days }) })
  }
};