import { apiFetch, setStoredUsername, setToken } from './api';
import type { User } from '../contexts/UserContext';

export async function quickLogin(username: string) {
  const data = await apiFetch('/auth/quick-login', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
  setToken(data.token);
  setStoredUsername(username);
  return data.user as User;
}

export async function login(username: string, password: string) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  setStoredUsername(username);
  return data.user as User;
}

export async function fetchCurrentUser() {
  const data = await apiFetch('/auth/me');
  return data.user as User;
}

export async function fetchAllUsers() {
  const data = await apiFetch('/users');
  return data.users as User[];
}

export async function createUser(input: {
  username: string;
  password: string;
  name: string;
  role: User['role'];
  managerId?: string | null;
}) {
  const data = await apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.user as User;
}

export async function updateUserManager(userId: string, managerId?: string | null) {
  const data = await apiFetch(`/users/${userId}/manager`, {
    method: 'PATCH',
    body: JSON.stringify({ managerId: managerId ?? null }),
  });
  return data.user as User;
}
