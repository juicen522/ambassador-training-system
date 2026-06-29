import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users,
  TrendingUp,
  Award,
  Search,
  Filter,
  CheckCircle,
  BookOpen,
  GraduationCap,
  Plus,
  Edit,
  Trash2,
  Lock,
  LockOpen,
  GripVertical,
  Network,
  Save,
  ClipboardList,
} from 'lucide-react';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import SectionPageLayout from './SectionPageLayout';
import { useUser, User, UserRole } from '../contexts/UserContext';
import { updateUserManager } from '../lib/authApi';
import { useMaterials } from '../contexts/MaterialsContext';
import MaterialFormDialog from './MaterialFormDialog';
import AdminQuizPanel from './AdminQuizPanel';
import { formatFileSize } from '../lib/materialsDb';
import type { Material } from '../types/material';
type AdminTab = 'users' | 'materials' | 'quizzes' | 'training';

export default function AdminPanel() {
  const { currentUser, allUsers } = useUser();
  const nav = useNavigationCopy();
  const {
    materials,
    loading: materialsLoading,
    refresh: refreshMaterials,
    addMaterial,
    addMaterialsFromFiles,
    editMaterial,
    toggleMaterialHidden,
    reorderMaterials,
    removeMaterial,
  } = useMaterials();
  const [activeTab, setActiveTab] = useState<AdminTab>('materials');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [togglingHiddenId, setTogglingHiddenId] = useState<string | null>(null);
  const [orderedMaterials, setOrderedMaterials] = useState<Material[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [managerDrafts, setManagerDrafts] = useState<Record<string, string>>({});
  const [managerSavingId, setManagerSavingId] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState('');
  const draggingIdRef = useRef<string | null>(null);
  const orderedMaterialsRef = useRef<Material[]>([]);
  const isDraggingRef = useRef(false);
  const lastHoverIdRef = useRef<string | null>(null);
  const orderBeforeDragRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setOrderedMaterials(materials);
    }
  }, [materials]);

  useEffect(() => {
    orderedMaterialsRef.current = orderedMaterials;
  }, [orderedMaterials]);

  useEffect(() => {
    setManagerDrafts(
      Object.fromEntries(allUsers.map((u) => [u.id, u.managerId ?? ''])),
    );
  }, [allUsers]);

  const moveMaterialInList = (fromId: string, toId: string) => {
    setOrderedMaterials((prev) => {
      const fromIdx = prev.findIndex((m) => m.id === fromId);
      const toIdx = prev.findIndex((m) => m.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  const handleDragEnd = async () => {
    const draggedId = draggingIdRef.current;
    draggingIdRef.current = null;
    lastHoverIdRef.current = null;
    isDraggingRef.current = false;
    setDraggingId(null);
    if (!draggedId) return;

    const newIds = orderedMaterialsRef.current.map((m) => m.id);
    const unchanged =
      newIds.length === orderBeforeDragRef.current.length &&
      newIds.every((id, i) => id === orderBeforeDragRef.current[i]);
    if (unchanged) return;

    setSavingOrder(true);
    try {
      await reorderMaterials(newIds);
    } catch (err) {
      setOrderedMaterials(materials);
      window.alert(err instanceof Error ? err.message : '保存排序失败');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleToggleHidden = async (item: Material) => {
    if (togglingHiddenId) return;
    setTogglingHiddenId(item.id);
    try {
      await toggleMaterialHidden(item.id, !item.hidden);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '切换失败');
    } finally {
      setTogglingHiddenId(null);
    }
  };

  // 只有管理员可以访问
  if (currentUser.role !== 'admin') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-white p-12 rounded-lg border text-center" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <h2 className="text-2xl font-medium mb-3" style={{ color: '#382C25' }}>
            无访问权限
          </h2>
          <p className="text-sm" style={{ color: '#7A6E68' }}>
            此页面仅限管理员访问
          </p>
        </div>
      </div>
    );
  }

  const getRoleName = (role: UserRole) => {
    switch (role) {
      case 'new': return '全新大使';
      case 'certified': return '正式大使';
      case 'admin': return '管理员';
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'new': return '#FDD562';
      case 'certified': return '#5EC4B6';
      case 'admin': return '#C3E2C7';
    }
  };

  // 统计数据
  const stats = {
    total: allUsers.length,
    new: allUsers.filter(u => u.role === 'new').length,
    certified: allUsers.filter(u => u.role === 'certified').length,
    avgProgress: Math.round(
      allUsers.reduce((sum, u) => {
        const completedStages = u.progress.basicTrainingStages.filter(s => s.completed).length;
        const totalStages = u.progress.basicTrainingStages.length;
        const basicProgress = (completedStages / totalStages) * 50;
        const advancedProgress = (u.progress.advancedCoursesCompleted / u.progress.totalAdvancedCourses) * 50;
        return sum + basicProgress + advancedProgress;
      }, 0) / allUsers.length
    ),
  };

  // 过滤用户
  const filteredUsers = allUsers.filter(user => {
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
      await updateUserManager(user.id, getManagerId(user) || null);
      setManagerMessage(`已保存「${user.name}」的直属上级`);
    } catch (err) {
      setManagerMessage(err instanceof Error ? err.message : '保存直属上级失败');
    } finally {
      setManagerSavingId(null);
    }
  };

  const adminTabs = [
    { id: 'materials' as const, label: nav.admin.tabs.materials, icon: BookOpen },
    { id: 'quizzes' as const, label: '题库管理', icon: ClipboardList },
    { id: 'training' as const, label: nav.admin.tabs.training, icon: GraduationCap },
  ];

  return (
    <SectionPageLayout
      title={nav.admin.pageTitle}
      description={nav.admin.pageDescription}
      titleIcon={Users}
      tabs={adminTabs}
      activeTabId={activeTab}
      onTabChange={(id) => setActiveTab(id as AdminTab)}
    >
      {activeTab === 'users' && (<div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={{ color: '#7A6E68' }}>总人数</p>
              <p className="text-2xl font-medium" style={{ color: '#382C25' }}>{stats.total}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
              <Users className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={{ color: '#7A6E68' }}>全新大使</p>
              <p className="text-2xl font-medium" style={{ color: '#382C25' }}>{stats.new}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(253, 213, 98, 0.1)' }}>
              <Users className="w-5 h-5" style={{ color: '#FDD562' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={{ color: '#7A6E68' }}>正式大使</p>
              <p className="text-2xl font-medium" style={{ color: '#382C25' }}>{stats.certified}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
              <Award className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs mb-2" style={{ color: '#7A6E68' }}>平均进度</p>
              <p className="text-2xl font-medium" style={{ color: '#382C25' }}>{stats.avgProgress}%</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-lg border mb-6" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#7A6E68' }} />
            <input
              type="text"
              placeholder="搜索大使姓名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none transition-all text-sm"
              style={{
                borderColor: 'rgba(56, 44, 37, 0.15)',
                color: '#382C25',
              }}
              onFocus={(e) => e.target.style.borderColor = '#5EC4B6'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(56, 44, 37, 0.15)'}
            />
          </div>

          <div className="flex gap-2">
            <Filter className="w-5 h-5 my-auto" style={{ color: '#7A6E68' }} />
            {['all', 'new', 'certified'].map((role) => (
              <button
                key={role}
                onClick={() => setFilterRole(role as UserRole | 'all')}
                className="px-4 py-2 rounded-lg transition-all text-sm"
                style={{
                  backgroundColor: filterRole === role ? '#5EC4B6' : 'white',
                  color: filterRole === role ? 'white' : '#7A6E68',
                  border: `1px solid ${filterRole === role ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)'}`
                }}
              >
                {role === 'all' ? '全部' : role === 'new' ? '全新大使' : '正式大使'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* User List */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <table className="w-full">
          <thead style={{ backgroundColor: '#F5F5F5' }}>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>姓名</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>直属上级</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>基础培训</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>进阶课程</th>
              <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, index) => (
              <tr
                key={user.id}
                className="border-t transition-colors hover:bg-gray-50"
                style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
              >
                <td className="px-6 py-4">
                  <span className="text-sm font-medium" style={{ color: '#382C25' }}>{user.name}</span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: `${getRoleColor(user.role)}20`,
                      color: getRoleColor(user.role)
                    }}
                  >
                    {getRoleName(user.role)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs" style={{ color: '#7A6E68' }}>
                    {(getManagerId(user) && userNameById[getManagerId(user)]) || '—'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#F5F5F5', maxWidth: '80px' }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${(user.progress.basicTrainingStages.filter(s => s.completed).length / user.progress.basicTrainingStages.length) * 100}%`,
                          backgroundColor: '#5EC4B6'
                        }}
                      />
                    </div>
                    <span className="text-xs" style={{ color: '#7A6E68' }}>
                      {user.progress.basicTrainingStages.filter(s => s.completed).length}/{user.progress.basicTrainingStages.length}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs" style={{ color: '#7A6E68' }}>
                    {user.progress.advancedCoursesCompleted}/{user.progress.totalAdvancedCourses}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => setSelectedUser(user)}
                    className="text-xs px-3 py-1 rounded transition-all"
                    style={{
                      color: '#5EC4B6',
                      border: '1px solid #5EC4B6'
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
            <Users className="w-12 h-12 mx-auto mb-3" style={{ color: '#7A6E68' }} />
            <p className="text-sm" style={{ color: '#7A6E68' }}>未找到匹配的大使</p>
          </div>
        )}
      </div>

      <div
        className="bg-white rounded-lg border p-5 mb-6"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-4 h-4" style={{ color: '#5EC4B6' }} />
          <h3 className="text-sm font-medium" style={{ color: '#382C25' }}>
            上下级信息管理
          </h3>
        </div>
        <p className="text-xs mb-4" style={{ color: '#7A6E68' }}>
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
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>
                  员工
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>
                  当前角色
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>
                  直属上级
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => (
                <tr
                  key={`manager-${user.id}`}
                  className="border-t"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                >
                  <td className="px-4 py-3 text-sm" style={{ color: '#382C25' }}>
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#7A6E68' }}>
                    {getRoleName(user.role)}
                  </td>
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
                      style={{
                        borderColor: 'rgba(56, 44, 37, 0.15)',
                        color: '#382C25',
                      }}
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
                      style={{
                        borderColor: '#5EC4B6',
                        color: '#5EC4B6',
                      }}
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

      {/* User Detail Modal */}
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
                <h2 className="text-xl font-medium mb-2" style={{ color: '#382C25' }}>
                  {selectedUser.name}
                </h2>
                <span
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: `${getRoleColor(selectedUser.role)}20`,
                    color: getRoleColor(selectedUser.role)
                  }}
                >
                  {getRoleName(selectedUser.role)}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              {/* 基础培训 */}
              <div>
                <h3 className="text-base font-medium mb-3" style={{ color: '#382C25' }}>
                  基础培训
                </h3>
                <div className="space-y-2">
                  {selectedUser.progress.basicTrainingStages.map((stage) => (
                    <div key={stage.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                      <div className="flex items-center flex-1">
                        {stage.completed ? (
                          <CheckCircle className="w-4 h-4 mr-2" style={{ color: '#5EC4B6' }} />
                        ) : (
                          <div className="w-4 h-4 mr-2 rounded-full border-2" style={{ borderColor: '#7A6E68' }} />
                        )}
                        <span className="text-sm" style={{ color: '#382C25' }}>{stage.name}</span>
                      </div>
                      <span className="text-xs ml-2" style={{ color: '#7A6E68' }}>{stage.duration}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 进阶培训 */}
              <div>
                <h3 className="text-base font-medium mb-3" style={{ color: '#382C25' }}>
                  进阶培训
                </h3>
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm" style={{ color: '#382C25' }}>课程完成度</span>
                    <span className="text-sm font-medium" style={{ color: '#5EC4B6' }}>
                      {selectedUser.progress.advancedCoursesCompleted}/{selectedUser.progress.totalAdvancedCourses}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'white' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(selectedUser.progress.advancedCoursesCompleted / selectedUser.progress.totalAdvancedCourses) * 100}%`,
                        backgroundColor: '#5EC4B6'
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
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4DB0A3'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5EC4B6'}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      </div>
      )}

      {/* Materials Management Tab */}
      {activeTab === 'materials' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-medium" style={{ color: '#382C25' }}>
                知识库资料管理
              </h2>
              <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
                拖动左侧手柄调整顺序，前台知识库与 AI 将按相同顺序展示；可切换公开/隐藏
                {savingOrder ? ' · 正在保存排序…' : ''}
              </p>
            </div>
            <button
              onClick={() => {
                setEditingMaterial(null);
                setMaterialDialogOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm"
              style={{ backgroundColor: '#5EC4B6', color: 'white' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4DB0A3'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5EC4B6'}
            >
              <Plus className="w-4 h-4" />
              添加资料
            </button>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
            {materialsLoading ? (
              <p className="text-sm text-center py-12" style={{ color: '#7A6E68' }}>加载中…</p>
            ) : (
              <table className="w-full">
                <thead style={{ backgroundColor: '#F5F5F5' }}>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium w-10" style={{ color: '#7A6E68' }} />
                    <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>标题</th>
                    <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>分类</th>
                    <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>类型</th>
                    <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>文件</th>
                    <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>浏览</th>
                    <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: '#7A6E68' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedMaterials.map((item) => (
                    <tr
                      key={item.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const fromId = draggingIdRef.current;
                        if (!fromId || fromId === item.id || lastHoverIdRef.current === item.id) {
                          return;
                        }
                        lastHoverIdRef.current = item.id;
                        moveMaterialInList(fromId, item.id);
                      }}
                      onDrop={(e) => e.preventDefault()}
                      className="border-t"
                      style={{
                        borderColor: 'rgba(56, 44, 37, 0.06)',
                        opacity: draggingId === item.id ? 0.55 : 1,
                      }}
                    >
                      <td className="px-3 py-4 text-center" style={{ color: '#7A6E68' }}>
                        <span
                          data-drag-handle
                          draggable={!savingOrder}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            isDraggingRef.current = true;
                            orderBeforeDragRef.current = orderedMaterialsRef.current.map((m) => m.id);
                            draggingIdRef.current = item.id;
                            lastHoverIdRef.current = null;
                            setDraggingId(item.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', item.id);
                          }}
                          onDragEnd={handleDragEnd}
                          className="inline-flex cursor-grab active:cursor-grabbing touch-none select-none"
                          title="拖动排序"
                        >
                          <GripVertical className="w-4 h-4" />
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#382C25' }}>
                        <span className="inline-flex items-center gap-2">
                          {item.hidden && (
                            <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: '#5EC4B6' }} />
                          )}
                          {item.title}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#7A6E68' }}>{item.category}</td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#7A6E68' }}>{item.type}</td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#7A6E68' }}>
                        {item.files.length > 0 ? (
                          <span title={item.files.map((f) => f.fileName).join('\n')}>
                            {item.files.length === 1
                              ? `${item.files[0].fileName} (${formatFileSize(item.files[0].fileSize)})`
                              : `${item.files.length} 个文件`}
                          </span>
                        ) : (
                          <span style={{ color: '#E85D75' }}>未上传</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#7A6E68' }}>{item.views}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={togglingHiddenId === item.id}
                            className="p-1.5 rounded transition-all disabled:opacity-50"
                            style={{ color: item.hidden ? '#5EC4B6' : '#7A6E68' }}
                            title={item.hidden ? '已锁定隐藏，点击公开' : '当前公开，点击锁定隐藏（仅 AI）'}
                            onClick={() => handleToggleHidden(item)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#F5F5F5';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            {item.hidden ? (
                              <Lock className="w-4 h-4" />
                            ) : (
                              <LockOpen className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded transition-all"
                            style={{ color: '#5EC4B6' }}
                            title="编辑"
                            onClick={() => {
                              setEditingMaterial(item);
                              setMaterialDialogOpen(true);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded transition-all"
                            style={{ color: '#E85D75' }}
                            title="删除"
                            onClick={async () => {
                              if (window.confirm(`确定删除「${item.title}」？`)) {
                                await removeMaterial(item.id);
                              }
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!materialsLoading && materials.length === 0 && (
              <p className="text-sm text-center py-12" style={{ color: '#7A6E68' }}>
                暂无资料，点击「添加资料」从本机上传
              </p>
            )}
          </div>

          <MaterialFormDialog
            open={materialDialogOpen}
            material={editingMaterial}
            onClose={() => {
              setMaterialDialogOpen(false);
              setEditingMaterial(null);
            }}
            onSubmit={async (input, files, options) => {
              if (editingMaterial) {
                await editMaterial(editingMaterial.id, input, {
                  addFiles: files,
                  removeFileIds: options?.removeFileIds,
                });
              } else if (options?.batchAsSeparate && files.length > 1) {
                await addMaterialsFromFiles(files, {
                  category: input.category,
                  description: input.description,
                });
              } else {
                await addMaterial(input, files);
              }
            }}
          />
        </div>
      )}

      {activeTab === 'quizzes' && (
        <div>
          <AdminQuizPanel />
        </div>
      )}

      {/* Training Content Management Tab */}
      {activeTab === 'training' && (
        <div>
          <div className="mb-6">
            <h2 className="text-lg font-medium mb-4" style={{ color: '#382C25' }}>
              培训内容管理
            </h2>
          </div>

          {/* Basic Training */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
                基础培训阶段
              </h3>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm"
                style={{ backgroundColor: '#5EC4B6', color: 'white' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4DB0A3'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5EC4B6'}
              >
                <Plus className="w-4 h-4" />
                添加阶段
              </button>
            </div>
            <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
              <div className="space-y-2">
                {['大使见面会+讲解演示', '十如故事+讲解重点', '知识答题', '讲解演练', '讲解考核'].map((stage, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                    <span className="text-sm" style={{ color: '#382C25' }}>{stage}</span>
                    <div className="flex gap-2">
                      <button className="p-1.5 rounded transition-all" style={{ color: '#5EC4B6' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded transition-all" style={{ color: '#E85D75' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced Training */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
                进阶培训课程
              </h3>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm"
                style={{ backgroundColor: '#5EC4B6', color: 'white' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4DB0A3'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5EC4B6'}
              >
                <Plus className="w-4 h-4" />
                添加课程
              </button>
            </div>
            <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
              <div className="space-y-2">
                {['起源故事分享', '讲解技巧提升', '礼仪服务课程', '伴手礼的故事', '跨部门分享', '团队协作与领导力'].map((course, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
                    <span className="text-sm" style={{ color: '#382C25' }}>{course}</span>
                    <div className="flex gap-2">
                      <button className="p-1.5 rounded transition-all" style={{ color: '#5EC4B6' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded transition-all" style={{ color: '#E85D75' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </SectionPageLayout>
  );
}
