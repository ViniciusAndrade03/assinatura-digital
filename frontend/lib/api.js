/**
 * Cliente HTTP da API.
 * - JWT enviado no cabeçalho Authorization (guardado em sessionStorage: some ao fechar a aba)
 * - Token CSRF enviado no cabeçalho X-CSRF-Token em toda requisição que altera dados
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

const KEY_TOKEN = 'ad.token';
const KEY_CSRF = 'ad.csrf';
const KEY_USER = 'ad.user';

function store() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const session = {
  get token() { return store()?.getItem(KEY_TOKEN) || null; },
  get csrf() { return store()?.getItem(KEY_CSRF) || null; },
  get user() {
    try { return JSON.parse(store()?.getItem(KEY_USER) || 'null'); } catch { return null; }
  },
  save({ token, csrfToken, user }) {
    const s = store();
    if (!s) return;
    if (token) s.setItem(KEY_TOKEN, token);
    if (csrfToken) s.setItem(KEY_CSRF, csrfToken);
    if (user) s.setItem(KEY_USER, JSON.stringify(user));
  },
  clear() {
    const s = store();
    [KEY_TOKEN, KEY_CSRF, KEY_USER].forEach((k) => s?.removeItem(k));
  },
};

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Erro ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function fetchCsrf() {
  const headers = session.token ? { Authorization: `Bearer ${session.token}` } : {};
  const res = await fetch(`${API_URL}/auth/csrf-token`, { headers, credentials: 'omit' });
  const data = await res.json();
  session.save({ csrfToken: data.csrfToken });
  return data.csrfToken;
}

export async function api(path, { method = 'GET', body, form, raw = false, retry = true } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const mutating = method !== 'GET';
  if (mutating) headers['X-CSRF-Token'] = session.csrf || (await fetchCsrf());
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_URL + path, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    credentials: 'omit',
  });

  // Token CSRF expirado → renova uma vez e repete
  if (res.status === 403 && mutating && retry) {
    const data = await res.clone().json().catch(() => ({}));
    if (/CSRF/.test(data.error || '')) {
      await fetchCsrf();
      return api(path, { method, body, form, raw, retry: false });
    }
  }
  if (res.status === 401 && session.token) {
    session.clear();
    if (typeof window !== 'undefined') window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/login/?expirada=1`;
  }
  if (raw && res.ok) return res;
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function login(email, password) {
  session.clear();
  await fetchCsrf();
  const data = await api('/auth/login', { method: 'POST', body: { email, password } });
  session.save(data);
  return data.user;
}

export function logout() {
  session.clear();
}
