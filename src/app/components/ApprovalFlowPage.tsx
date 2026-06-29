import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  ClipboardCheck,
  FileEdit,
  Send,
  UserCog,
  MessageSquareMore,
  CircleCheck,
  GitBranch,
  Users,
} from 'lucide-react';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import AmbassadorStaffPanel from './AmbassadorStaffPanel';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };

type FlowStep = {
  id: string;
  title: string;
  actor: string;
  status: string;
  icon: typeof FileEdit;
  summary: string;
  actions: string[];
  outcome: string;
};

const FLOW_STEPS: FlowStep[] = [
  {
    id: 'draft',
    title: '发起需求（填写表单）',
    actor: '需求部门 / 发起人',
    status: 'draft',
    icon: FileEdit,
    summary: '在「发起大使需求」里填写参观信息，系统自动计算计划时长与预估费用。',
    actions: [
      '填写开始/结束时间、参观团体、语言、人数、路线与备注',
      '保存草稿或直接提交',
      '若曾被退回，可按退回说明修改后重提',
    ],
    outcome: '提交后进入待管理员处理（pending）',
  },
  {
    id: 'pending',
    title: '管理员审批与派单',
    actor: '管理员',
    status: 'pending',
    icon: UserCog,
    summary: '管理员在「大使服务 → 需求处理」审核需求完整性，并指定服务大使。',
    actions: [
      '确认需求信息是否完整、时间是否合理',
      '指派一位或多位大使，更新状态为已接受（accepted）',
      '若信息不完整，可退回给发起人补充',
    ],
    outcome: '派单后大使在「我的讲解任务」中可见',
  },
  {
    id: 'accepted',
    title: '大使执行服务',
    actor: '正式大使',
    status: 'accepted',
    icon: Send,
    summary: '大使按照派单执行讲解，服务结束后需确认实际起止时间。',
    actions: [
      '查看任务详情与讲解安排',
      '在任务页填写实际开始/结束时间（时长自动计算）',
      '确认无误后提交实际参观时长',
    ],
    outcome: '提交后需求自动流转为已完成（completed）',
  },
  {
    id: 'completed',
    title: '反馈归档与积分统计',
    actor: '系统 / 管理员',
    status: 'completed',
    icon: CircleCheck,
    summary: '系统记录大使反馈并统计时长积分；节假日场次支持管理员人工核算。',
    actions: [
      '记录实际时长提交时间与提交人',
      '自动计算积分或标记为待人工核算',
      '在报表与排行中沉淀服务数据',
    ],
    outcome: '审批流闭环完成，可用于复盘与后续统计',
  },
];

type FlowNode = {
  id: string;
  title: string;
  subtitle?: string;
  tone?: 'normal' | 'success' | 'warning';
};

const FLOW_NODES: FlowNode[] = [
  { id: 'start', title: '流程发起节点', subtitle: '发起人提交需求', tone: 'success' },
  { id: 'approve', title: 'HR L&D 审批', subtitle: '管理员审核与派单', tone: 'warning' },
  { id: 'execute', title: '大使完成服务反馈', subtitle: '填写实际时间与反馈', tone: 'warning' },
  { id: 'confirm', title: '需求发起人确认', subtitle: '确认服务完成', tone: 'normal' },
  { id: 'end', title: '流程结束', subtitle: '归档并统计积分', tone: 'success' },
];

function nodeStyle(tone: FlowNode['tone']) {
  if (tone === 'success') {
    return {
      borderColor: 'rgba(94, 196, 182, 0.35)',
      backgroundColor: 'rgba(94, 196, 182, 0.10)',
      titleColor: '#2D8F82',
    };
  }
  if (tone === 'warning') {
    return {
      borderColor: 'rgba(251, 191, 36, 0.35)',
      backgroundColor: 'rgba(251, 191, 36, 0.12)',
      titleColor: '#B45309',
    };
  }
  return {
    borderColor: 'rgba(56, 44, 37, 0.15)',
    backgroundColor: 'rgba(56, 44, 37, 0.04)',
    titleColor: '#382C25',
  };
}

type ApprovalPanel = 'flow' | 'staff';

function parseApprovalPanel(value: string | null): ApprovalPanel {
  return value === 'staff' ? 'staff' : 'flow';
}

export default function ApprovalFlowPage({ embedded = false }: { embedded?: boolean }) {
  const nav = useNavigationCopy();
  const [searchParams, setSearchParams] = useSearchParams();
  const [panel, setPanel] = useState<ApprovalPanel>(() =>
    embedded ? parseApprovalPanel(searchParams.get('panel')) : 'flow',
  );

  useEffect(() => {
    if (!embedded) return;
    setPanel(parseApprovalPanel(searchParams.get('panel')));
  }, [embedded, searchParams]);

  const switchPanel = (next: ApprovalPanel) => {
    setPanel(next);
    if (embedded) {
      setSearchParams({ tab: 'approval', panel: next }, { replace: true });
    }
  };

  const flowContent = (
      <>
        {!embedded && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: 'rgba(94, 196, 182, 0.12)' }}
              >
                <ClipboardCheck className="w-5 h-5" style={{ color: '#5EC4B6' }} />
              </div>
              <h1 className="text-xl font-medium" style={labelStyle}>
                {nav.approvalFlow.pageTitle}
              </h1>
            </div>
            <p className="text-sm mb-6" style={hintStyle}>
              {nav.approvalFlow.pageDescription}
            </p>
          </>
        )}
        {embedded && nav.approvalFlow.pageDescription && (
          <p className="text-sm mb-6" style={hintStyle}>
            {nav.approvalFlow.pageDescription}
          </p>
        )}

        <div className="mb-6 rounded-lg px-4 py-3" style={{ backgroundColor: '#FAFAFA' }}>
          <p className="text-sm" style={hintStyle}>
            当前流程范围：<span style={labelStyle}>发起大使需求表单 → 管理员派单审批 → 大使提交实际反馈 → 系统统计归档</span>
          </p>
        </div>

        <section
          className="rounded-lg border p-5 mb-6"
          style={{ borderColor: 'rgba(56, 44, 37, 0.08)', backgroundColor: '#FCFCFC' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-4 h-4" style={{ color: '#5EC4B6' }} />
            <h2 className="text-sm font-medium" style={labelStyle}>
              审批流节点图
            </h2>
          </div>
          <div className="max-w-xl mx-auto">
            {FLOW_NODES.map((node, idx) => {
              const style = nodeStyle(node.tone);
              return (
                <div key={node.id} className="flex flex-col items-center">
                  <div
                    className="w-full rounded-lg border px-4 py-3 text-center"
                    style={{
                      borderColor: style.borderColor,
                      backgroundColor: style.backgroundColor,
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: style.titleColor }}>
                      {node.title}
                    </p>
                    {node.subtitle && (
                      <p className="text-xs mt-1" style={hintStyle}>
                        {node.subtitle}
                      </p>
                    )}
                  </div>
                  {idx < FLOW_NODES.length - 1 && (
                    <div className="h-8 flex items-center justify-center">
                      <div className="w-px h-5" style={{ backgroundColor: 'rgba(56, 44, 37, 0.2)' }} />
                      <span className="text-xs ml-2" style={{ color: '#7A6E68' }}>
                        ↓
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-4 h-4" style={{ color: '#5EC4B6' }} />
            <h2 className="text-sm font-medium" style={labelStyle}>
              审批节点流程表
            </h2>
          </div>
          <div
            className="rounded-lg border overflow-x-auto"
            style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
          >
          <table className="w-full min-w-[860px] text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#FAFAFA', color: '#382C25' }}>
                <th className="text-left px-4 py-3 font-medium">节点</th>
                <th className="text-left px-4 py-3 font-medium">责任人</th>
                <th className="text-left px-4 py-3 font-medium">系统状态</th>
                <th className="text-left px-4 py-3 font-medium">触发动作</th>
                <th className="text-left px-4 py-3 font-medium">流转结果</th>
              </tr>
            </thead>
            <tbody>
              {FLOW_STEPS.map((step, idx) => (
                <tr
                  key={`table-${step.id}`}
                  className="border-t align-top"
                  style={{
                    borderColor: 'rgba(56, 44, 37, 0.08)',
                    backgroundColor: idx % 2 === 1 ? '#FCFCFC' : 'white',
                    color: '#7A6E68',
                  }}
                >
                  <td className="px-4 py-3" style={labelStyle}>
                    {idx + 1}. {step.title}
                  </td>
                  <td className="px-4 py-3">{step.actor}</td>
                  <td className="px-4 py-3">{step.status}</td>
                  <td className="px-4 py-3">{step.actions[0]}</td>
                  <td className="px-4 py-3">{step.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <div className="space-y-4">
          {FLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className="rounded-lg border p-5"
                style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium"
                    style={{ backgroundColor: 'rgba(94, 196, 182, 0.14)', color: '#5EC4B6' }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Icon className="w-4 h-4" style={{ color: '#5EC4B6' }} />
                      <h2 className="text-[15px] font-medium" style={labelStyle}>
                        {step.title}
                      </h2>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(56, 44, 37, 0.08)', color: '#7A6E68' }}
                      >
                        状态：{step.status}
                      </span>
                    </div>

                    <p className="text-xs mb-2" style={hintStyle}>
                      责任人：{step.actor}
                    </p>
                    <p className="text-sm mb-3" style={hintStyle}>
                      {step.summary}
                    </p>

                    <ul className="space-y-1.5 mb-3">
                      {step.actions.map((a) => (
                        <li key={a} className="text-sm" style={hintStyle}>
                          - {a}
                        </li>
                      ))}
                    </ul>

                    <div
                      className="inline-flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(94, 196, 182, 0.08)',
                        color: '#5EC4B6',
                      }}
                    >
                      <MessageSquareMore className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>流转结果：{step.outcome}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
  );

  const embeddedSubTabs = embedded ? (
    <div
      className="flex flex-wrap gap-2 mb-6 p-1 rounded-lg border"
      style={{ borderColor: 'rgba(56, 44, 37, 0.08)', backgroundColor: '#FAFAFA' }}
    >
      <button
        type="button"
        onClick={() => switchPanel('flow')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all"
        style={{
          backgroundColor: panel === 'flow' ? '#5EC4B6' : 'transparent',
          color: panel === 'flow' ? 'white' : '#7A6E68',
        }}
      >
        <GitBranch className="w-4 h-4" />
        审批流程
      </button>
      <button
        type="button"
        onClick={() => switchPanel('staff')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all"
        style={{
          backgroundColor: panel === 'staff' ? '#5EC4B6' : 'transparent',
          color: panel === 'staff' ? 'white' : '#7A6E68',
        }}
      >
        <Users className="w-4 h-4" />
        人员管理
      </button>
    </div>
  ) : null;

  if (embedded) {
    return (
      <div
        className="bg-white rounded-lg border p-6"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        {embeddedSubTabs}
        {panel === 'staff' ? <AmbassadorStaffPanel /> : flowContent}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div
        className="bg-white rounded-lg border p-8"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        {flowContent}
      </div>
    </div>
  );
}
