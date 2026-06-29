import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AlignCenter,
  AlignLeft,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';
import {
  exitListFromEmptyLi,
  findParentLi,
  getCaretCharacterOffset,
  isCaretAtLiStart,
  isLiEmpty,
  liftLiToParagraph,
  normalizeActivityEditorDom,
  placeCaretIn,
  scanEditorListHealth,
} from '../lib/activityEditorDom';
import { normalizeActivityCopywriting, sanitizePastedHtml } from '../lib/viTypography';

type MenuId = 'ul' | 'ol' | 'nest';
type BulletVariant = 'disc' | 'circle' | 'square';
type OrderedVariant = 'decimal' | 'lower-alpha' | 'lower-roman';

type FormatState = {
  bold: boolean;
  underline: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
};

const DEFAULT_FORMAT: FormatState = {
  bold: false,
  underline: false,
  justifyLeft: true,
  justifyCenter: false,
};

const ink = '#000';
const activeBtnStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 196, 182, 0.22)',
  boxShadow: 'inset 0 0 0 1px rgba(94, 196, 182, 0.55)',
};

function keepFocus(e: React.PointerEvent) {
  e.preventDefault();
}

function ToolbarDivider() {
  return <span className="w-px h-5 shrink-0 bg-black/10" aria-hidden />;
}

function ListMarkerLines() {
  return (
    <span className="flex flex-col gap-[3px] justify-center text-[#382C25]" aria-hidden>
      <span className="block h-px w-7 bg-current opacity-75" />
      <span className="block h-px w-7 bg-current opacity-75" />
      <span className="block h-px w-5 bg-current opacity-50" />
    </span>
  );
}

function BulletStyleIcon({ variant }: { variant: BulletVariant }) {
  const marker = variant === 'disc' ? '●' : variant === 'circle' ? '○' : '■';
  return (
    <span className="inline-flex items-center gap-2 text-[#382C25]">
      <span className="w-4 text-center text-sm leading-none">{marker}</span>
      <ListMarkerLines />
    </span>
  );
}

function OrderedStyleIcon({ variant }: { variant: OrderedVariant }) {
  const nums =
    variant === 'decimal'
      ? ['1', '2', '3']
      : variant === 'lower-alpha'
        ? ['a', 'b', 'c']
        : ['i', 'ii', 'iii'];
  return (
    <span className="inline-flex items-center gap-2 text-[#382C25]">
      <span className="flex flex-col gap-0.5 text-[10px] leading-none font-medium w-5">
        {nums.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </span>
      <ListMarkerLines />
    </span>
  );
}

function btnClass(active: boolean) {
  return `p-1.5 rounded hover:bg-gray-100 transition-colors${active ? ' ring-1 ring-[#5EC4B6]/50' : ''}`;
}

function ToolBtn({
  title,
  active = false,
  onPress,
  children,
}: {
  title: string;
  active?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={btnClass(active)}
      style={active ? activeBtnStyle : undefined}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onPointerDown={(e) => {
        keepFocus(e);
        onPress();
      }}
    >
      {children}
    </button>
  );
}

function ToolMenu({
  menuId,
  openId,
  setOpenId,
  title,
  icon,
  active = false,
  onPress,
  items,
}: {
  menuId: MenuId;
  openId: MenuId | null;
  setOpenId: (id: MenuId | null) => void;
  title: string;
  icon: ReactNode;
  active?: boolean;
  onPress: () => void;
  items: { title: string; icon: ReactNode; active?: boolean; onPress: () => void }[];
}) {
  const open = openId === menuId;
  return (
    <div
      className={`relative flex items-center rounded hover:bg-gray-100${active ? ' ring-1 ring-[#5EC4B6]/50' : ''}`}
      style={active ? activeBtnStyle : undefined}
    >
      <button
        type="button"
        className="p-1.5 rounded-l"
        title={title}
        aria-label={title}
        aria-pressed={active}
        onPointerDown={(e) => {
          keepFocus(e);
          onPress();
        }}
      >
        {icon}
      </button>
      <button
        type="button"
        className="pr-1 py-1.5 rounded-r"
        title={`${title} 更多`}
        aria-label={`${title} 更多`}
        aria-expanded={open}
        onPointerDown={(e) => {
          keepFocus(e);
          setOpenId(open ? null : menuId);
        }}
      >
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="关闭"
            onPointerDown={keepFocus}
            onClick={() => setOpenId(null)}
          />
          <div
            className="absolute left-0 top-full z-20 mt-1 py-1 rounded-md border bg-white shadow-lg"
            style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
          >
            {items.map((item) => (
              <button
                key={item.title}
                type="button"
                className={`w-full flex px-3 py-2 hover:bg-gray-50 rounded-sm${item.active ? ' bg-gray-100' : ''}`}
                style={item.active ? { boxShadow: 'inset 0 0 0 1px rgba(56,44,37,0.12)' } : undefined}
                title={item.title}
                aria-label={item.title}
                aria-pressed={item.active}
                onPointerDown={(e) => {
                  keepFocus(e);
                  item.onPress();
                  setOpenId(null);
                }}
              >
                {item.icon}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** 点工具栏时优先保留编辑器内当前光标，避免无法切换加粗/下划线 */
function prepareEditorCommand(
  editor: HTMLDivElement,
  savedRangeRef: { current: Range | null },
) {
  const sel = window.getSelection();
  if (sel?.rangeCount) {
    const live = sel.getRangeAt(0);
    if (editor.contains(live.commonAncestorContainer)) {
      editor.focus({ preventScroll: true });
      savedRangeRef.current = live.cloneRange();
      return;
    }
  }
  editor.focus({ preventScroll: true });
  const cached = savedRangeRef.current;
  if (cached && sel) {
    try {
      sel.removeAllRanges();
      sel.addRange(cached);
    } catch {
      savedRangeRef.current = null;
    }
  }
}

function readFormatState(editor: HTMLElement): FormatState {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return DEFAULT_FORMAT;

  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return DEFAULT_FORMAT;

  let justifyCenter = document.queryCommandState('justifyCenter');
  let justifyLeft =
    document.queryCommandState('justifyLeft') ||
    (!justifyCenter && !document.queryCommandState('justifyRight'));

  let block: Node | null = sel.anchorNode;
  if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
  while (block && block !== editor) {
    if (block instanceof HTMLElement) {
      const tag = block.tagName;
      if (tag === 'P' || tag === 'LI' || tag === 'DIV' || tag === 'H1' || tag === 'H2') {
        const align = block.style.textAlign || getComputedStyle(block).textAlign;
        if (align === 'center') {
          justifyCenter = true;
          justifyLeft = false;
        } else if (align === 'left' || align === 'start') {
          justifyLeft = true;
          justifyCenter = false;
        }
        break;
      }
    }
    block = block.parentElement;
  }

  return {
    bold: document.queryCommandState('bold'),
    underline: document.queryCommandState('underline'),
    justifyLeft,
    justifyCenter,
  };
}

export type ActivityCopyEditorHandle = {
  getHtml: () => string;
};

type ActivityCopyEditorProps = {
  value: string;
  onChange: (html: string) => void;
  resetKey: string;
};

const ActivityCopyEditor = forwardRef<ActivityCopyEditorHandle, ActivityCopyEditorProps>(
  function ActivityCopyEditor({ value, onChange, resetKey }, ref) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorFocusedRef = useRef(false);
  const lastResetKeyRef = useRef(resetKey);
  const savedRangeRef = useRef<Range | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [format, setFormat] = useState<FormatState>(DEFAULT_FORMAT);
  const formatRef = useRef(format);
  formatRef.current = format;

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => {
        const editor = editorRef.current;
        if (!editor) return '';
        normalizeActivityEditorDom(editor);
        return normalizeActivityCopywriting(editor.innerHTML);
      },
    }),
    [],
  );

  const refreshFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setFormat(readFormatState(editor));
  }, []);

  const saveSelection = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
      refreshFormatState();
    }
  }, [refreshFormatState]);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor) return false;
    editor.focus({ preventScroll: true });
    if (!range) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    try {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      savedRangeRef.current = null;
      return false;
    }
  }, []);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const caret = getCaretCharacterOffset(editor);
    if (scanEditorListHealth(editor).issues.length > 0) {
      normalizeActivityEditorDom(editor, caret);
    }
    let normalized = normalizeActivityCopywriting(editor.innerHTML);
    if (editor.innerHTML !== normalized) {
      editor.innerHTML = normalized;
      normalizeActivityEditorDom(editor, caret);
      normalized = normalizeActivityCopywriting(editor.innerHTML);
      if (caret != null) setCaretCharacterOffset(editor, caret);
    }
    onChange(normalized);
    saveSelection();
    requestAnimationFrame(() => refreshFormatState());
  }, [onChange, saveSelection, refreshFormatState]);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor || e.nativeEvent.isComposing) return;

      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;

      const li = findParentLi(range.startContainer, editor);

      if (e.key === 'Enter' && li && isLiEmpty(li)) {
        e.preventDefault();
        const p = exitListFromEmptyLi(li);
        placeCaretIn(p);
        emitChange();
        return;
      }

      if (e.key === 'Backspace' && range.collapsed && li && isCaretAtLiStart(range, li)) {
        e.preventDefault();
        const p = isLiEmpty(li) ? exitListFromEmptyLi(li) : liftLiToParagraph(li);
        placeCaretIn(p);
        emitChange();
      }
    },
    [emitChange],
  );

  const exec = useCallback(
    (command: string, commandValue?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelection();
      try {
        document.execCommand('styleWithCSS', false, 'false');
      } catch {
        /* ignore */
      }
      document.execCommand(command, false, commandValue);
      normalizeActivityEditorDom(editor);
      emitChange();
    },
    [restoreSelection, emitChange],
  );

  const toggleInline = useCallback(
    (kind: 'bold' | 'underline') => {
      const editor = editorRef.current;
      if (!editor) return;
      prepareEditorCommand(editor, savedRangeRef);

      const cmd = kind;
      const uiOn = kind === 'bold' ? formatRef.current.bold : formatRef.current.underline;

      try {
        document.execCommand('styleWithCSS', false, 'false');
      } catch {
        /* ignore */
      }

      if (uiOn) {
        document.execCommand(cmd);
        if (document.queryCommandState(cmd)) {
          document.execCommand(cmd);
        }
      } else {
        document.execCommand(cmd);
      }

      emitChange();
    },
    [emitChange],
  );

  const toggleAlign = useCallback(
    (which: 'left' | 'center') => {
      const editor = editorRef.current;
      if (!editor) return;
      prepareEditorCommand(editor, savedRangeRef);

      if (which === 'center') {
        if (formatRef.current.justifyCenter) {
          document.execCommand('justifyLeft');
        } else {
          document.execCommand('justifyCenter');
        }
      } else if (formatRef.current.justifyCenter) {
        document.execCommand('justifyLeft');
      } else {
        document.execCommand('justifyLeft');
      }

      emitChange();
    },
    [emitChange],
  );

  const applyListStyle = useCallback(
    (ordered: boolean, listStyleType: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelection();
      editor.querySelectorAll(':scope > div').forEach((div) => {
        const p = document.createElement('p');
        p.innerHTML = div.innerHTML;
        div.replaceWith(p);
      });
      restoreSelection();
      exec(ordered ? 'insertOrderedList' : 'insertUnorderedList');
      const sel = window.getSelection();
      let n: Node | null = sel?.anchorNode ?? null;
      while (n && n !== editor) {
        if (n instanceof HTMLUListElement || n instanceof HTMLOListElement) {
          n.style.listStyleType = listStyleType;
          break;
        }
        n = n.parentNode;
      }
      normalizeActivityEditorDom(editor);
      emitChange();
    },
    [restoreSelection, exec, emitChange],
  );

  const syncedSnapshotRef = useRef('');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const snapshot = `${resetKey}::${value}`;
    if (syncedSnapshotRef.current === snapshot) return;

    const resetChanged = lastResetKeyRef.current !== resetKey;
    lastResetKeyRef.current = resetKey;

    const incoming = normalizeActivityCopywriting(value || '');
    const current = normalizeActivityCopywriting(editor.innerHTML);

    if (!resetChanged && editorFocusedRef.current) {
      syncedSnapshotRef.current = snapshot;
      return;
    }

    if (current === incoming) {
      syncedSnapshotRef.current = snapshot;
      return;
    }

    syncedSnapshotRef.current = snapshot;
    editor.innerHTML = incoming;
    normalizeActivityEditorDom(editor);
    savedRangeRef.current = null;
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* ignore */
    }
    setFormat(DEFAULT_FORMAT);
  }, [resetKey, value]);

  return (
    <div
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: ink }}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b"
        style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
        onPointerDown={keepFocus}
      >
        <ToolBtn title="加粗" active={format.bold} onPress={() => toggleInline('bold')}>
          <Bold className="w-3.5 h-3.5" strokeWidth={format.bold ? 2.5 : 2} />
        </ToolBtn>
        <ToolBtn
          title="下划线"
          active={format.underline}
          onPress={() => toggleInline('underline')}
        >
          <Underline className="w-3.5 h-3.5" strokeWidth={format.underline ? 2.5 : 2} />
        </ToolBtn>
        <ToolbarDivider />
        <ToolMenu
          menuId="ul"
          openId={openMenu}
          setOpenId={setOpenMenu}
          title="项目符号"
          icon={<List className="w-3.5 h-3.5" />}
          onPress={() => applyListStyle(false, 'disc')}
          items={(
            [
              ['disc', '实心圆点'],
              ['circle', '空心圆'],
              ['square', '方块'],
            ] as const
          ).map(([variant, label]) => ({
            title: label,
            icon: <BulletStyleIcon variant={variant} />,
            onPress: () => applyListStyle(false, variant),
          }))}
        />
        <ToolMenu
          menuId="ol"
          openId={openMenu}
          setOpenId={setOpenMenu}
          title="编号列表"
          icon={<ListOrdered className="w-3.5 h-3.5" />}
          onPress={() => applyListStyle(true, 'decimal')}
          items={(
            [
              ['decimal', '1.2.3.'],
              ['lower-alpha', 'a.b.c.'],
              ['lower-roman', 'i.ii.iii.'],
            ] as const
          ).map(([variant, label]) => ({
            title: label,
            icon: <OrderedStyleIcon variant={variant} />,
            onPress: () => applyListStyle(true, variant),
          }))}
        />
        <ToolMenu
          menuId="nest"
          openId={openMenu}
          setOpenId={setOpenMenu}
          title="缩进"
          icon={<IndentIncrease className="w-3.5 h-3.5" />}
          onPress={() => exec('indent')}
          items={[
            {
              title: '增加缩进',
              icon: <IndentIncrease className="w-4 h-4" />,
              onPress: () => exec('indent'),
            },
            {
              title: '减少缩进',
              icon: <IndentDecrease className="w-4 h-4" />,
              onPress: () => exec('outdent'),
            },
          ]}
        />
        <ToolbarDivider />
        <ToolBtn
          title="左对齐"
          active={format.justifyLeft && !format.justifyCenter}
          onPress={() => toggleAlign('left')}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          title="居中"
          active={format.justifyCenter}
          onPress={() => toggleAlign('center')}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolBtn>
      </div>
      <div
        ref={editorRef}
        className="activity-vi-editor p-3 min-h-[140px] outline-none"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        onPointerUp={saveSelection}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onSelect={saveSelection}
        onFocus={() => {
          editorFocusedRef.current = true;
        }}
        onBlur={() => {
          editorFocusedRef.current = false;
          const editor = editorRef.current;
          if (editor) {
            const caret = getCaretCharacterOffset(editor);
            normalizeActivityEditorDom(editor, caret);
          }
          emitChange();
        }}
        onKeyDown={handleEditorKeyDown}
        onInput={emitChange}
        onPaste={(e) => {
          e.preventDefault();
          restoreSelection();
          const editor = editorRef.current;
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          const insert = html ? sanitizePastedHtml(html) : text.replace(/\n/g, '<br>');
          document.execCommand('insertHTML', false, insert);
          if (editor) {
            const caret = getCaretCharacterOffset(editor);
            normalizeActivityEditorDom(editor, caret);
          }
          emitChange();
        }}
      />
      <p
        className="px-3 py-1.5 text-[10px] border-t"
        style={{ color: '#7A6E68', borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        选中文字后点格式；字体自动按 VI（思源黑体 / Gotham）。
      </p>
    </div>
  );
},
);

export default ActivityCopyEditor;
