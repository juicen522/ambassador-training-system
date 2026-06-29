import { useState } from 'react';
import { ClipboardList, GraduationCap } from 'lucide-react';
import AmbassadorQuizReportsPanel from './AmbassadorQuizReportsPanel';

type ReportSection = 'weekly-reports' | 'knowledge-reports';

const SECTION_TABS: Array<{
  id: ReportSection;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { id: 'weekly-reports', label: '周测报告', icon: ClipboardList },
  { id: 'knowledge-reports', label: '培训测试报告', icon: GraduationCap },
];

export default function AmbassadorStaffManagement() {
  const [section, setSection] = useState<ReportSection>('weekly-reports');

  return (
    <div>
      <div
        className="flex flex-wrap gap-2 mb-6 p-1 rounded-lg border bg-white"
        style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
      >
        {SECTION_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all"
              style={{
                backgroundColor: active ? '#5EC4B6' : 'transparent',
                color: active ? 'white' : '#7A6E68',
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === 'weekly-reports' && <AmbassadorQuizReportsPanel type="weekly" />}
      {section === 'knowledge-reports' && <AmbassadorQuizReportsPanel type="knowledge" />}
    </div>
  );
}
