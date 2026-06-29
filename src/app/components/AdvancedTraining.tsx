import { useState } from 'react';
import { GraduationCap, Lock, CheckCircle, PlayCircle } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

interface Course {
  id: number;
  title: string;
  description: string;
  duration: string;
  completed: boolean;
  locked: boolean;
}

export default function AdvancedTraining() {
  const { currentUser } = useUser();
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // 只有正式大使和管理员可以访问进阶培训
  const canAccess = currentUser.role === 'certified' || currentUser.role === 'admin';

  const courses: Course[] = [
    {
      id: 1,
      title: '起源故事分享',
      description: '蔡家和杨家的故事',
      duration: '2小时',
      completed: currentUser.progress.advancedCoursesCompleted >= 1,
      locked: false,
    },
    {
      id: 2,
      title: '讲解技巧提升',
      description: '大使讲解技巧与专业表达能力提升',
      duration: '1.5小时',
      completed: currentUser.progress.advancedCoursesCompleted >= 2,
      locked: false,
    },
    {
      id: 3,
      title: '礼仪服务课程',
      description: '大使知识服务课程与仪表形态训练',
      duration: '3小时',
      completed: currentUser.progress.advancedCoursesCompleted >= 3,
      locked: false,
    },
    {
      id: 4,
      title: '伴手礼的故事',
      description: '伴手礼相关的故事素材与收授',
      duration: '2.5小时',
      completed: currentUser.progress.advancedCoursesCompleted >= 4,
      locked: currentUser.progress.advancedCoursesCompleted < 3,
    },
    {
      id: 5,
      title: '跨部门分享',
      description: '跨部门交流与业务深度理解提升',
      duration: '2小时',
      completed: currentUser.progress.advancedCoursesCompleted >= 5,
      locked: currentUser.progress.advancedCoursesCompleted < 3,
    },
    {
      id: 6,
      title: '团队协作与领导力',
      description: '培养团队协作能力和领导力素质',
      duration: '2小时',
      completed: currentUser.progress.advancedCoursesCompleted >= 6,
      locked: currentUser.progress.advancedCoursesCompleted < 5,
    },
  ];

  if (!canAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto mt-16">
        <div className="bg-white p-12 rounded-lg border text-center" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
            style={{ backgroundColor: 'rgba(253, 213, 98, 0.1)' }}
          >
            <Lock className="w-10 h-10" style={{ color: '#FDD562' }} />
          </div>
          <h2 className="text-2xl font-medium mb-3" style={{ color: '#382C25' }}>
            进阶培训已锁定
          </h2>
          <p className="text-sm mb-8" style={{ color: '#7A6E68' }}>
            请先完成基础培训和最终考核，通过后即可解锁进阶培训内容
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* Progress Overview */}
      <div className="bg-white p-6 rounded-lg border mb-8" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <GraduationCap className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} />
            <h2 className="text-base font-medium" style={{ color: '#382C25' }}>
              学习进度
            </h2>
          </div>
          <span className="text-sm" style={{ color: '#7A6E68' }}>
            {Math.round((currentUser.progress.advancedCoursesCompleted / currentUser.progress.totalAdvancedCourses) * 100)}% 已完成
          </span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#F5F5F5' }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${(currentUser.progress.advancedCoursesCompleted / currentUser.progress.totalAdvancedCourses) * 100}%`,
              backgroundColor: '#5EC4B6'
            }}
          />
        </div>
      </div>

      {/* Course Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <div
            key={course.id}
            className={`bg-white p-6 rounded-lg border transition-all ${course.locked ? 'opacity-60' : 'cursor-pointer'}`}
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
            onClick={() => !course.locked && setSelectedCourse(course)}
            onMouseEnter={(e) => {
              if (!course.locked) {
                e.currentTarget.style.borderColor = '#5EC4B6';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!course.locked) {
                e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="p-2.5 rounded-lg"
                style={{
                  backgroundColor: course.completed
                    ? 'rgba(94, 196, 182, 0.1)'
                    : course.locked
                    ? 'rgba(122, 110, 104, 0.1)'
                    : 'rgba(253, 213, 98, 0.1)'
                }}
              >
                {course.completed ? (
                  <CheckCircle className="w-5 h-5" style={{ color: '#5EC4B6' }} />
                ) : course.locked ? (
                  <Lock className="w-5 h-5" style={{ color: '#7A6E68' }} />
                ) : (
                  <PlayCircle className="w-5 h-5" style={{ color: '#FDD562' }} />
                )}
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#F5F5F5', color: '#7A6E68' }}>
                {course.duration}
              </span>
            </div>

            <h3 className="text-base font-medium mb-2" style={{ color: '#382C25' }}>
              {course.title}
            </h3>
            <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
              {course.description}
            </p>

            {course.completed && (
              <div className="flex items-center text-xs" style={{ color: '#5EC4B6' }}>
                <CheckCircle className="w-3 h-3 mr-1" />
                已完成
              </div>
            )}
            {course.locked && (
              <div className="flex items-center text-xs" style={{ color: '#7A6E68' }}>
                <Lock className="w-3 h-3 mr-1" />
                需先完成前置课程
              </div>
            )}
            {!course.completed && !course.locked && (
              <div className="flex items-center text-xs" style={{ color: '#FDD562' }}>
                <PlayCircle className="w-3 h-3 mr-1" />
                点击开始学习
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Course Detail Modal */}
      {selectedCourse && !selectedCourse.locked && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCourse(null)}
        >
          <div
            className="bg-white p-8 rounded-lg max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-medium mb-4" style={{ color: '#382C25' }}>
              {selectedCourse.title}
            </h2>
            <p className="text-sm mb-6" style={{ color: '#7A6E68' }}>
              {selectedCourse.description}
            </p>
            <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}>
              <p className="text-sm" style={{ color: '#7A6E68' }}>
                课程时长: {selectedCourse.duration}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedCourse(null)}
                className="flex-1 px-6 py-2.5 rounded-lg transition-all border"
                style={{
                  borderColor: 'rgba(56, 44, 37, 0.15)',
                  color: '#7A6E68'
                }}
              >
                关闭
              </button>
              <button
                className="flex-1 px-6 py-2.5 rounded-lg text-white transition-all"
                style={{ backgroundColor: '#5EC4B6' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4DB0A3'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5EC4B6'}
              >
                {selectedCourse.completed ? '重新学习' : '开始学习'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
