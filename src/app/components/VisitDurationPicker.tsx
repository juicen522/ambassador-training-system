import { useEffect, useMemo, type ReactNode } from 'react';
import { Calendar } from 'lucide-react';
import {
  combineDateAndTime,
  computeDurationHours,
  visitDateLabel,
  visitDateYmd,
} from '../lib/datetime';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
const inputStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#382C25',
  backgroundColor: 'white',
};
const guideTitleClass = 'text-[13px] font-semibold leading-snug';

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className={`block ${guideTitleClass}`} style={labelStyle}>
        {required && <span style={{ color: '#e57373' }}>* </span>}
        {label}
      </label>
      {hint && (
        <p className="text-xs leading-[1.6] -mt-0.5" style={hintStyle}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function VisitDurationPicker({
  fixedDateIso,
  startTime,
  endTime,
  durationHours,
  onStartTimeChange,
  onEndTimeChange,
  onDurationHoursChange,
}: {
  fixedDateIso: string;
  startTime: string;
  endTime: string;
  durationHours: string;
  onStartTimeChange: (v: string) => void;
  onEndTimeChange: (v: string) => void;
  onDurationHoursChange: (v: string) => void;
}) {
  const dateYmd = useMemo(() => visitDateYmd(fixedDateIso), [fixedDateIso]);
  const startAt = useMemo(
    () => combineDateAndTime(dateYmd, startTime),
    [dateYmd, startTime],
  );
  const endAt = useMemo(() => combineDateAndTime(dateYmd, endTime), [dateYmd, endTime]);
  const computedHours = useMemo(() => {
    if (!startAt || !endAt) return 0;
    return computeDurationHours(startAt, endAt);
  }, [startAt, endAt]);

  useEffect(() => {
    onDurationHoursChange(computedHours > 0 ? String(computedHours) : '');
  }, [computedHours, onDurationHoursChange]);

  return (
    <div className="space-y-5">
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg border"
        style={{
          borderColor: 'rgba(94, 196, 182, 0.25)',
          backgroundColor: 'rgba(94, 196, 182, 0.06)',
        }}
      >
        <Calendar className="w-4 h-4 shrink-0" style={{ color: '#5EC4B6' }} />
        <div>
          <p className="text-xs" style={hintStyle}>
            参观日期（与需求一致，不可修改）
          </p>
          <p className="text-sm font-medium" style={labelStyle}>
            {visitDateLabel(fixedDateIso)}
          </p>
        </div>
      </div>

      <Field
        label="讲解开始时间"
        required
        hint="时长应包含大使就位及穿插活动等等待时间；仅限需求当天"
      >
        <input
          type="time"
          className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
          style={inputStyle}
          value={startTime}
          onChange={(e) => onStartTimeChange(e.target.value)}
        />
      </Field>

      <Field label="讲解结束时间" required hint="仅限需求当天">
        <input
          type="time"
          className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
          style={inputStyle}
          value={endTime}
          onChange={(e) => onEndTimeChange(e.target.value)}
        />
      </Field>

      <Field label="实际参观时长（小时）" hint="根据起止时间自动计算">
        <p
          className="w-full px-4 py-2.5 border rounded-lg text-sm"
          style={{
            borderColor: 'rgba(56, 44, 37, 0.15)',
            color: computedHours > 0 ? '#382C25' : '#7A6E68',
            backgroundColor: '#FAFAFA',
          }}
        >
          {computedHours > 0
            ? `${computedHours} 小时`
            : durationHours.trim()
              ? `${durationHours} 小时`
              : '请先选择开始与结束时间'}
        </p>
      </Field>
    </div>
  );
}
