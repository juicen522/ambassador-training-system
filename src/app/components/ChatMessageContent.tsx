import type { ReactNode } from 'react';

/** 将 AI 返回的 **加粗** 等简单 Markdown 转为可读样式 */
function parseInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) {
      return (
        <strong key={index} className="font-medium">
          {bold[1]}
        </strong>
      );
    }
    return part;
  });
}

export default function ChatMessageContent({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const trimmed = line.trimEnd();
        if (!trimmed) {
          return <div key={index} className="h-2" />;
        }
        return (
          <p key={index} className="m-0 leading-relaxed whitespace-pre-wrap">
            {parseInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
