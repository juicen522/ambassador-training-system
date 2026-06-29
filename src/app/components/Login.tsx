import { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { quickLogin } from '../lib/authApi';
import { SWITCHABLE_ACCOUNTS } from '../lib/switchableAccounts';

interface LoginProps {
  onLogin: (user?: { role: string }) => void;
}

const loginEntries = SWITCHABLE_ACCOUNTS.map((a) => ({
  name: a.name,
  subtitle: a.roleLabel,
  username: a.username,
}));

export default function Login({ onLogin }: LoginProps) {
  const { publicSettings } = useSettings();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleQuickLogin = async (username: string) => {
    setSubmitting(username);
    setError('');
    try {
      await quickLogin(username);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请确认后端已启动');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="bg-white p-12 rounded-lg shadow-sm border w-full max-w-md relative overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}>
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: '#FDD562', transform: 'translate(50%, -50%)' }}
        />

        <div className="text-center mb-10 relative">
          <h1 className="text-3xl font-medium mb-2" style={{ color: '#382C25' }}>
            {publicSettings.system.siteName}
          </h1>
          <p className="text-sm" style={{ color: '#7A6E68' }}>
            {publicSettings.system.organizationName
              ? `${publicSettings.system.organizationName} · 选择身份进入`
              : '选择身份进入'}
          </p>
        </div>

        {error && (
          <p className="text-sm mb-4 px-3 py-2 rounded-lg text-center" style={{ color: '#E85D75', backgroundColor: 'rgba(232,93,117,0.08)' }}>
            {error}
          </p>
        )}

        <div className="space-y-3 relative">
          <p className="text-xs font-medium mb-1" style={{ color: '#B45309' }}>
            流程模拟测试账号
          </p>
          {loginEntries.map((user) => {
            const busy = submitting === user.username;
            return (
              <button
                key={user.username}
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => handleQuickLogin(user.username)}
                className="w-full px-5 py-4 rounded-lg border transition-all text-left disabled:opacity-60"
                style={{
                  borderColor: 'rgba(251, 191, 36, 0.5)',
                  backgroundColor: 'rgba(251, 191, 36, 0.08)',
                  color: '#382C25',
                }}
                onMouseEnter={(e) => {
                  if (submitting) return;
                  e.currentTarget.style.borderColor = '#5EC4B6';
                  e.currentTarget.style.backgroundColor = 'rgba(94, 196, 182, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.5)';
                  e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.08)';
                }}
              >
                <span className="block font-medium">{user.name}</span>
                <span className="block text-sm mt-0.5" style={{ color: '#7A6E68' }}>
                  {busy ? '进入中…' : user.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-center mt-8" style={{ color: '#7A6E68' }}>
          开发模式：点击身份即可登录，无需输入密码
        </p>
      </div>
    </div>
  );
}
