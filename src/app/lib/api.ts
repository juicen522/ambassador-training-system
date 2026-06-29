const TOKEN_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setStoredUsername(username: string) {
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearStoredUsername() {
  localStorage.removeItem(USERNAME_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  let data: { error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (
      res.status === 404 &&
      (path.includes('/auth/quick-login') ||
        path.includes('/assignments/mine') ||
        path.includes('/activities') ||
        path.includes('/quizzes/admin/reports') ||
        path.includes('return-to-creator') ||
        text.includes('Cannot GET') ||
        text.includes('Cannot POST') ||
        text.includes('Cannot PUT') ||
        text.includes('Cannot PATCH'))
    ) {
      throw new Error('后端版本过旧，请重启终端里的 npm run dev 后再试');
    }
    if (res.status === 413) {
      throw new Error('文件过大，单个文件不能超过 100MB');
    }
    if (res.status === 403) {
      throw new Error('需要管理员权限');
    }
  }

  if (!res.ok) {
    const fallback =
      res.status === 401
        ? '未登录或登录已过期'
        : res.status === 403
          ? '需要管理员权限'
          : res.status === 413
            ? '文件过大'
            : res.status === 404 &&
                (path.includes('/hidden') ||
                  path.includes('/assignments/mine') ||
                  path.includes('/activities') ||
                  path.includes('/quizzes/admin/reports') ||
                  path.includes('return-to-creator'))
              ? '后端版本过旧，请重启终端里的 npm run dev 后再试'
              : `请求失败（${res.status}）`;
    throw new Error(data.error || fallback);
  }
  return data;
}
