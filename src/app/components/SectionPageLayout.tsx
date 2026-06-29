import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SectionTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  badgeWarning?: boolean;
}

/** 与培训管理（AdminPanel）一致的区块页：标题 + 页内标签 + 内容 */
export default function SectionPageLayout({
  title,
  description,
  titleIcon: TitleIcon,
  tabs,
  activeTabId,
  onTabChange,
  children,
  maxWidthClass = 'max-w-7xl',
}: {
  title: string;
  description: string;
  titleIcon?: LucideIcon;
  tabs: SectionTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className={`p-8 ${maxWidthClass} mx-auto`}>
      <div className="mb-8">
        <h1
          className="text-2xl font-medium mb-1 flex items-center gap-2"
          style={{ color: '#382C25' }}
        >
          {TitleIcon && <TitleIcon className="w-7 h-7" style={{ color: '#5EC4B6' }} />}
          {title}
        </h1>
        <p className="text-sm" style={{ color: '#7A6E68' }}>
          {description}
        </p>
      </div>

      {tabs.length > 1 && (
        <div
          className="flex flex-wrap gap-2 mb-8 border-b"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className="flex items-center gap-2 px-4 py-3 transition-all text-sm font-medium"
                style={{
                  color: isActive ? '#5EC4B6' : '#7A6E68',
                  borderBottom: isActive
                    ? '2px solid #5EC4B6'
                    : '2px solid transparent',
                }}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className="text-xs min-w-[1.25rem] h-5 px-1.5 rounded-full flex items-center justify-center font-medium"
                    style={
                      tab.badgeWarning
                        ? {
                            backgroundColor: 'rgba(251, 191, 36, 0.25)',
                            color: '#B45309',
                          }
                        : {
                            backgroundColor: 'rgba(94, 196, 182, 0.2)',
                            color: '#5EC4B6',
                          }
                    }
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}
