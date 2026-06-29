import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  TrendingUp,
  Award,
  Search,
  Filter,
  CheckCircle,
  Network,
  Save,
} from 'lucide-react';
import { useUser, type User, type UserRole } from '../contexts/UserContext';
import { updateUserManager } from '../lib/authApi';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };

export default function AmbassadorStaffPanel() {
  const { allUsers } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [managerDrafts, setManagerDrafts] = useState<Record<string, string>>({});
  const [managerSavingId, setManagerSavingId] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState('');

  useEffect(() => {
    setManagerDrafts(Object.fromEntries(allUsers.map((u) => [u.id, u.managerId ?? ''])));
  }, [allUsers]);

  const getRoleName = (role: UserRole) => {
    switch (role) {
      case 'new':
        return '全新大使';
      case 'certified':
        return '正式大使';
      case 'admin':
        return '管理员';
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'new':
        return '#FDD562';
      case 'certified':
        return '#5EC4B6';
      case 'admin':
        return '#C3E2C7';
    }
  };

  const stats = {
    total: allUsers.length,
    new: allUsers.filter((u) => u.role === 'new').length,
    certified: allUsers.filter((u) => u.role === 'certified').length,
    avgProgress:
      allUsers.length > 0
        ? Math.round(
            allUsers.reduce((sum, u) => {
              const completedStages = u.progress.basicTrainingStages.filter(
                (s) => s.completed,
              ).length;
              const totalStages = u.progress.basicTrainingStages.length;
              const basicProgress = (completedStages / totalStages) * 50;
              const advancedProgress =
                (u.progress.advancedCoursesCompleted / u.progress.totalAdvancedCourses) *
                50;
              return sum + basicProgress + advancedProgress;
            }, 0) / allUsers.length,
          )
        : 0,
  };

  const filteredUsers = allUsers.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const userNameById = useMemo(
    () => Object.fromEntries(allUsers.map((u) => [u.id, u.name])),
    [allUsers],
  );

  const getManagerId = (user: User) =>
    managerDrafts[user.id] !== undefined ? managerDrafts[user.id] : (user.managerId ?? '');

  const handleSaveManager = async (user: User) => {
    setManagerSavingId(user.id);
    setManagerMessage('');
    try {
      const updated = await updateUserManager(user.id, getManagerId(user) || null);
      setManagerDrafts((prev) => ({ ...prev, [user.id]: updated.managerId ?? '' }));
      setManagerMessage(`已保存「${user.name}」的直属上级`);
    } catch (err) {
      setManagerMessage(err instanceof Error ? err.message : '保存直属上级失败');
    } finally {
      setManagerSavingId(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={hintStyle}>总人数</p>
              <p className="text-2xl font-medium" style={labelStyle}>{stats.total}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
              <Users className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={hintStyle}>全新大使</p>
              <p className="text-2xl font-medium" style={labelStyle}>{stats.new}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(253, 213, 98, 0.1)' }}>
              <Users className="w-5 h-5" style={{ color: '#FDD562' }} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={hintStyle}>正式大使</p>
              <p className="text-2xl font-medium" style={labelStyle}>{stats.certified}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
              <Award className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={hintStyle}>平均进度</p>
              <p className="text-2xl font-medium" style={labelStyle}>{stats.avgProgress}%</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border mb-6" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={hintStyle} />
            <input
              type="text"
              placeholder="搜索大使姓名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none transition-all text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
            />
          </div>
          <div className="flex gap-2">
            <Filter className="w-5 h-5 my-auto" style={hintStyle} />
            {['all', 'new', 'certified'].map((role) => (
              <button
                key={role}
                onClick={() => setFilterRole(role as UserRole | 'all')}
                className="px-4 py-2 rounded-lg transition-all text-sm"
                style={{
                  backgroundColor: filterRole === role ? '#5EC4B6' : 'white',
                  color: filterRole === role ? 'white' : '#7A6E68',
                  border: `1px solid ${filterRole === role ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)'}`,
                }}
              >
                {role === 'all' ? '全部' : role === 'new' ? '全新大使' : '正式大使'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 mb-6" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-4 h-4" style={{ color: '#5EC4B6' }} />
          <h3 className="text-sm font-medium" style={labelStyle}>上下级信息管理</h3>
        </div>
        <p className="text-xs mb-4" style={hintStyle}>
          为员工设置直属上级。系统在给大使派单后，会自动同步分发给其直属上级。
        </p>
        {managerMessage && (
          <p
            className="text-xs mb-3 px-3 py-2 rounded"
            style={{
              color: managerMessage.includes('失败') ? '#E85D75' : '#2D8F82',
              backgroundColor: managerMessage.includes('失败')
                ? 'rgba(232,93,117,0.08)'
                : 'rgba(94, 196, 182, 0.1)',
            }}
          >
            {managerMessage}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead style={{ backgroundColor: '#F5F5F5' }}>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={hintStyle}>员工</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={hintStyle}>当前角色</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={hintStyle}>直属上级</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={hintStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => (
                <tr key={`manager-${user.id}`} className="border-t" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
                  <td className="px-4 py-3 text-sm" style={labelStyle}>{user.name}</td>
                  <td className="px-4 py-3 text-xs" style={hintStyle}>{getRoleName(user.role)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={getManagerId(user)}
                      onChange={(e) =>
                        setManagerDrafts((prev) => ({
                          ...prev,
                          [user.id]: e.target.value,
                        }))
                      }
                      className="w-full max-w-[240px] px-3 py-2 border rounded-lg text-xs bg-white"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
                    >
                      <option value="">无</option>
                      {allUsers
                        .filter((u) => u.id !== user.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}（{getRoleName(u.role)}）
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={managerSavingId === user.id}
                      onClick={() => void handleSaveManager(user)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border disabled:opacity-50"
                      style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {managerSavingId === user.id ? '保存中…' : '保存'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <table className="w-full">
          <thead style={{ backgroundColor: '#F5F5F5' }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>姓名</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>直属上级</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>基础培训</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>进阶课程</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                className="border-t transition-colors hover:bg-gray-50"
                style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
              >
                <td className="px-6 py-4">
                  <span className="text-sm font-medium" style={labelStyle}>{user.name}</span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: `${getRoleColor(user.role)}20`,
                      color: getRoleColor(user.role),
                    }}
                  >
                    {getRoleName(user.role)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs" style={hintStyle}>
                    {(getManagerId(user) && userNameById[getManagerId(user)]) || '—'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#F5F5F5', maxWidth: '80px' }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${(user.progress.basicTrainingStages.filter((s) => s.completed).length / user.progress.basicTrainingStages.length) * 100}%`,
                          backgroundColor: '#5EC4B6',
                        }}
                      />
                    </div>
                    <span className="text-xs" style={hintStyle}>
                      {user.progress.basicTrainingStages.filter((s) => s.completed).length}/{user.progress.basicTrainingStages.length}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs" style={hintStyle}>
                    {user.progress.advancedCoursesCompleted}/{user.progress.totalAdvancedCourses}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => setSelectedUser(user)}
                    className="text-xs px-3 py-1 rounded transition-all"
                    style={{
                      color: '#5EC4B6',
                      border: '1px solid #5EC4B6',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#5EC4B6';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#5EC4B6';
                    }}
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-3" style={hintStyle} />
            <p className="text-sm" style={hintStyle}>未找到匹配的大使</p>
          </div>
        )}
      </div>

      {selectedUser && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-white p-8 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-medium mb-2" style={labelStyle}>
                  {selectedUser.name}
                </h2>
                <span
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: `${getRoleColor(selectedUser.role)}20`,
                    color: getRoleColor(selectedUser.role),
                  }}
                >
                  {getRoleName(selectedUser.role)}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-base font-medium mb-3" style={labelStyle}>基础培训</h3>
                <div className="space-y-2">
                  {selectedUser.progress.basicTrainingStages.map((stage) => (
                    <div key={stage.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                      <div className="flex items-center flex-1">
                        {stage.completed ? (
                          <CheckCircle className="w-4 h-4 mr-2" style={{ color: '#5EC4B6' }} />
                        ) : (
                          <div className="w-4 h-4 mr-2 rounded-full border-2" style={{ borderColor: '#7A6E68' }} />
                        )}
                        <span className="text-sm" style={labelStyle}>{stage.name}</span>
                      </div>
                      <span className="text-xs ml-2" style={hintStyle}>{stage.duration}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-base font-medium mb-3" style={labelStyle}>进阶培训</h3>
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm" style={labelStyle}>课程完成度</span>
                    <span className="text-sm font-medium" style={{ color: '#5EC4B6' }}>
                      {selectedUser.progress.advancedCoursesCompleted}/{selectedUser.progress.totalAdvancedCourses}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'white' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(selectedUser.progress.advancedCoursesCompleted / selectedUser.progress.totalAdvancedCourses) * 100}%`,
                        backgroundColor: '#5EC4B6',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedUser(null)}
              className="w-full mt-8 px-6 py-2.5 rounded-lg text-white transition-all"
              style={{ backgroundColor: '#5EC4B6' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
