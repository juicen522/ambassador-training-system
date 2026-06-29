import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { clearStoredUsername, clearToken } from '../lib/api';
import { fetchAllUsers, fetchCurrentUser, quickLogin } from '../lib/authApi';

export type UserRole = 'new' | 'certified' | 'admin';

export interface BasicTrainingStage {
  id: number;
  name: string;
  duration: string;
  completed: boolean;
}

export interface UserProgress {
  basicTrainingStages: BasicTrainingStage[];
  advancedCoursesCompleted: number;
  totalAdvancedCourses: number;
}

export interface User {
  id: string;
  username?: string;
  name: string;
  role: UserRole;
  managerId?: string | null;
  managerName?: string | null;
  progress: UserProgress;
}

interface UserContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  allUsers: User[];
  loading: boolean;
  switchingAccount: boolean;
  switchAccount: (username: string) => Promise<void>;
  reloadAllUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const reloadAllUsers = async () => {
    const users = await fetchAllUsers();
    setAllUsers(users);
  };

  const switchAccount = async (username: string) => {
    setSwitchingAccount(true);
    try {
      const user = await quickLogin(username);
      setCurrentUser(user);
      if (user.role === 'admin') {
        const users = await fetchAllUsers();
        setAllUsers(users);
      } else {
        setAllUsers([]);
      }
      window.location.href = '/dashboard';
    } finally {
      setSwitchingAccount(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const user = await fetchCurrentUser();
        setCurrentUser(user);
        if (user.role === 'admin') {
          const users = await fetchAllUsers();
          setAllUsers(users);
        }
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : '无法获取用户信息';
        clearToken();
        clearStoredUsername();
        setBootError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAFA' }}>
        <p className="text-sm" style={{ color: '#7A6E68' }}>加载用户信息…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ backgroundColor: '#FAFAFA' }}
      >
        <p className="text-sm" style={{ color: '#7A6E68' }}>
          {bootError || '登录状态已失效'}
        </p>
        <p className="text-xs" style={{ color: '#7A6E68' }}>
          请确认地址为 <strong>http://localhost:5181</strong> 且后端已启动（npm run dev）
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm text-white"
          style={{ backgroundColor: '#5EC4B6' }}
          onClick={() => window.location.reload()}
        >
          返回登录
        </button>
      </div>
    );
  }

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        allUsers,
        loading,
        switchingAccount,
        switchAccount,
        reloadAllUsers,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
