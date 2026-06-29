import { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { login, quickLogin } from '../lib/authApi';
import { SWITCHABLE_ACCOUNTS } from '../lib/switchableAccounts';

interface LoginProps {
  onLogin: (user?: { role: string }) => void;
}

const loginEntries = SWITCHABLE_ACCOUNTS.map((a) => ({
  name: a.name,
  subtitle: a.roleLabel,
  username: a.username,
}));

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
const inputStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#382C25',
  backgroundColor: 'white',
};

export default function Login({ onLogin }: LoginProps) {
  const { publicSettings } = useSettings();
  const showQuickLogin = publicSettings.features.showQuickLogin;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState<string | null>(null);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(username.trim(), password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (quickUsername: string) => {
    setQuickSubmitting(quickUsername);
    setError('');
    try {
      await quickLogin(quickUsername);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请确认后端已启动');
    } finally {
      setQuickSubmitting(null);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#FAFAFA' }}
    >
      <div
        className="bg-white p-10 sm:p-12 rounded-lg shadow-sm border w-full max-w-md relative overflow-hidden"
        style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
      >
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: '#FDD562', transform: 'translate(50%, -50%)' }}
        />

        <div className="text-center mb-8 relative">
          <h1 className="text-3xl font-medium mb-2" style={labelStyle}>
            {publicSettings.system.siteName}
          </h1>
          <p className="text-sm" style={hintStyle}>
            {publicSettings.system.organizationName
              ? `${publicSettings.system.organizationName} · 请登录`
              : '请使用账号密码登录'}
          </p>
        </div>

        {error && (
          <p
            className="text-sm mb-4 px-3 py-2 rounded-lg text-center"
            style={{ color: '#E85D75', backgroundColor: 'rgba(232,93,117,0.08)' }}
          >
            {error}
          </p>
        )}

        <form onSubmit={handlePasswordLogin} className="space-y-4 relative">
          <div>
            <label className="text-xs mb-1 block" style={hintStyle}>
              用户名
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg outline-none text-sm transition-all"
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#5EC4B6';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.15)';
              }}
              required
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={hintStyle}>
              密码
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg outline-none text-sm transition-all"
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#5EC4B6';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.15)';
              }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#5EC4B6' }}
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>

        {showQuickLogin && (
          <div className="mt-8 pt-6 border-t relative" style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: '#B45309' }}>
              开发快捷登录（无需密码）
            </p>
            <div className="space-y-2">
              {loginEntries.map((user) => {
                const busy = quickSubmitting === user.username;
                return (
                  <button
                    key={user.username}
                    type="button"
                    disabled={Boolean(quickSubmitting) || submitting}
                    onClick={() => void handleQuickLogin(user.username)}
                    className="w-full px-4 py-3 rounded-lg border transition-all text-left disabled:opacity-60"
                    style={{
                      borderColor: 'rgba(251, 191, 36, 0.5)',
                      backgroundColor: 'rgba(251, 191, 36, 0.08)',
                      color: '#382C25',
                    }}
                  >
                    <span className="block font-medium text-sm">{user.name}</span>
                    <span className="block text-xs mt-0.5" style={hintStyle}>
                      {busy ? '进入中…' : user.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
