import { cleanListLayoutInlineStyles } from './viTypography';

export function scanEditorListHealth(root: HTMLElement) {
  const issues: string[] = [];
  if (root.querySelector('li > p')) issues.push('li_has_p');
  if (root.querySelector('li > div')) issues.push('li_has_div');
  if (root.querySelector('ul > :not(li), ol > :not(li)')) issues.push('list_bad_child');

  root.querySelectorAll('ul, ol, li').forEach((el, idx) => {
    if (!(el instanceof HTMLElement)) return;
    const style = el.getAttribute('style') ?? '';
    if (/list-style-position\s*:\s*inside/i.test(style)) {
      issues.push(`${el.tagName.toLowerCase()}${idx}_inside`);
    }
    if (el.tagName === 'LI' && /padding-left/i.test(style)) {
      issues.push(`li${idx}_padding`);
    }
  });

  return { issues };
}

/** 修正 contentEditable 列表 DOM，避免符号错位、光标异常 */
function isEmptyBlock(el: HTMLElement): boolean {
  const html = el.innerHTML
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u200b/g, '')
    .trim();
  return html === '';
}

export function findParentLi(
  node: Node,
  root: HTMLElement,
): HTMLLIElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n instanceof HTMLLIElement) return n;
    n = n.parentNode;
  }
  return null;
}

export function isLiEmpty(li: HTMLLIElement): boolean {
  return (li.textContent ?? '').replace(/\u200b/g, '').trim() === '';
}

export function isCaretAtLiStart(range: Range, li: HTMLLIElement): boolean {
  if (!li.contains(range.startContainer)) return false;
  const probe = document.createRange();
  probe.selectNodeContents(li);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

/** @param toStart true=段首，false=段尾（对应 Range.collapse(toStart)） */
export function placeCaretIn(el: HTMLElement, toStart = true): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(toStart);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 空列表项按回车：在列表后新建段落并移除该 li */
export function exitListFromEmptyLi(li: HTMLLIElement): HTMLParagraphElement {
  const list = li.parentElement;
  const p = document.createElement('p');
  p.appendChild(document.createElement('br'));
  if (list?.parentNode) {
    list.parentNode.insertBefore(p, list.nextSibling);
  }
  li.remove();
  if (
    list instanceof HTMLUListElement ||
    list instanceof HTMLOListElement
  ) {
    if (!list.querySelector('li')) list.remove();
  }
  return p;
}

function unwrapLiContentHtml(li: HTMLLIElement): string {
  const clone = li.cloneNode(true) as HTMLLIElement;
  clone.querySelectorAll(':scope > p, :scope > div').forEach((block) => {
    const parent = block.parentElement;
    if (!parent) return;
    while (block.firstChild) parent.insertBefore(block.firstChild, block);
    block.remove();
  });
  const html = clone.innerHTML.trim();
  return html || '<br>';
}

/** 行首退格：去掉项目符号，保留文字为普通段落 */
export function liftLiToParagraph(li: HTMLLIElement): HTMLParagraphElement {
  const list = li.parentElement;
  const p = document.createElement('p');
  p.innerHTML = unwrapLiContentHtml(li);
  if (list?.parentNode) {
    list.parentNode.insertBefore(p, list);
  }
  li.remove();
  if (
    list instanceof HTMLUListElement ||
    list instanceof HTMLOListElement
  ) {
    if (!list.querySelector('li')) list.remove();
  }
  return p;
}

export function getCaretCharacterOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

export function setCaretCharacterOffset(
  root: HTMLElement,
  offset: number,
): void {
  const sel = window.getSelection();
  if (!sel) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let target: Text | null = null;
  let targetOffset = 0;

  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const len = text.data.length;
    if (remaining <= len) {
      target = text;
      targetOffset = remaining;
      break;
    }
    remaining -= len;
  }

  const range = document.createRange();
  if (target) {
    range.setStart(target, targetOffset);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function normalizeActivityEditorDom(
  root: HTMLElement,
  restoreCaretOffset?: number | null,
): boolean {
  let changed = false;
  const mark = () => {
    changed = true;
  };

  root.querySelectorAll(':scope > div').forEach((div) => {
    const p = document.createElement('p');
    p.innerHTML = div.innerHTML;
    div.replaceWith(p);
    mark();
  });

  root.querySelectorAll('ul, ol').forEach((list) => {
    [...list.childNodes].forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'LI') return;
        const li = document.createElement('li');
        list.insertBefore(li, el);
        li.appendChild(el);
        mark();
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (!text.trim()) {
          node.remove();
          mark();
        } else {
          const li = document.createElement('li');
          li.textContent = text;
          list.insertBefore(li, node);
          node.remove();
          mark();
        }
      }
    });
  });

  root.querySelectorAll('li > div').forEach((div) => {
    const li = div.parentElement;
    if (!li) return;
    while (div.firstChild) li.insertBefore(div.firstChild, div);
    div.remove();
    mark();
  });

  root.querySelectorAll('li').forEach((li) => {
    li.querySelectorAll(':scope > p').forEach((block) => {
      while (block.firstChild) li.insertBefore(block.firstChild, block);
      block.remove();
      mark();
    });
  });

  cleanListLayoutInlineStyles(root);

  [...root.children].forEach((block) => {
    if (!(block instanceof HTMLElement)) return;
    if (block.tagName !== 'P' && block.tagName !== 'DIV') return;
    if (!isEmptyBlock(block)) return;
    const sibling =
      block.nextElementSibling ?? block.previousElementSibling;
    if (sibling?.matches('ul, ol')) {
      block.remove();
      mark();
    }
  });

  if (changed && restoreCaretOffset != null) {
    setCaretCharacterOffset(root, restoreCaretOffset);
  }

  return changed;
}

export function editorDomNeedsNormalize(root: HTMLElement): boolean {
  return !!root.querySelector(
    ':scope > div, li > div, li > p, ul > :not(li), ol > :not(li)',
  );
}
