import { ensureFileIndexed } from './materialFileIndex.js';
import { isExtractableFileName } from './materialTextExtract.js';

const MAX_SNIPPET_PER_FILE = 30_000;
const MAX_TOTAL_CONTEXT = 280_000;

function queryTokens(query) {
  const raw = String(query || '')
    .replace(/[？?。，,；;：:\s]+/g, '')
    .trim();
  if (!raw) return [];
  const set = new Set();
  if (raw.length >= 2) set.add(raw);
  for (let len = 2; len <= Math.min(6, raw.length); len += 1) {
    for (let i = 0; i <= raw.length - len; i += 1) {
      set.add(raw.slice(i, i + len));
    }
  }
  return [...set].sort((a, b) => b.length - a.length);
}

function metadataScore(material, tokens) {
  if (tokens.length === 0) return 0;
  const hay = `${material.title}\n${material.description ?? ''}\n${(material.files || [])
    .map((f) => f.fileName)
    .join('\n')}`;
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length >= 3 ? 8 : 4;
  }
  return score;
}

function contentScoreFromStored(files, tokens) {
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const f of files) {
    const text = String(f.extracted_text || '');
    if (!text) continue;
    for (const t of tokens) {
      if (text.includes(t)) score += t.length >= 3 ? 15 : 8;
    }
  }
  return score;
}

function prioritizeMaterials(materials, query) {
  const tokens = query?.trim() ? queryTokens(query.trim()) : [];
  if (tokens.length === 0) return materials;
  return [...materials]
    .map((m, index) => ({
      m,
      index,
      score: metadataScore(m, tokens) + contentScoreFromStored(m.files || [], tokens),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.m);
}

function snippetFromFile(fileRow, includeFileContent) {
  const name = fileRow.file_name;
  if (!includeFileContent) return '';

  if (!isExtractableFileName(name)) {
    return `\n【${name}】格式为图片/视频/PPT 等，系统无法自动识别画面与幻灯片文字。`;
  }

  const status = fileRow.extract_status;
  const text = String(fileRow.extracted_text || '').trim();

  if (status === 'unsupported') {
    return `\n【${name}】${fileRow.extract_error || '暂不支持自动解析'}。`;
  }
  if (status === 'error') {
    return `\n【${name}】解析失败：${fileRow.extract_error || '未知错误'}。`;
  }
  if (status === 'empty' || !text) {
    return `\n【${name}】已解析但未提取到可读文字（可能为扫描件或纯图片）。`;
  }

  const snippet =
    text.length > MAX_SNIPPET_PER_FILE
      ? `${text.slice(0, MAX_SNIPPET_PER_FILE)}…（已截断）`
      : text;
  return `\n【${name} 正文摘录】\n${snippet}`;
}

/**
 * @param {import('../db/database.js').Material[]} materials - rowToMaterial 结果
 * @param {object} database
 */
export async function buildKnowledgeContext(
  database,
  materials,
  includeFileContent = true,
  userQuery,
) {
  if (!materials.length) {
    return '（当前知识库没有任何资料条目。）';
  }

  const ordered = prioritizeMaterials(materials, userQuery);
  const blocks = [];
  let totalLength = 0;

  for (const m of ordered) {
    const fileIds = (m.files || []).map((f) => f.id);
    const freshFiles = [];
    for (const fileId of fileIds) {
      let dbFile = database.prepare('SELECT * FROM material_files WHERE id = ?').get(fileId);
      if (!dbFile) continue;
      if (includeFileContent) {
        dbFile = await ensureFileIndexed(database, dbFile);
      }
      freshFiles.push(dbFile);
    }

    const fileList =
      freshFiles.length > 0
        ? freshFiles.map((f) => `${f.file_name}（${f.file_type}）`).join('、')
        : '无附件';

    const titlePrefix = m.hidden ? '[仅知识库·已隐藏] ' : '';
    let block = `### ${titlePrefix}${m.title}
- 分类：${m.category}
- 类型：${m.type}
- 简介：${m.description || '（无）'}
- 附件：${fileList}`;
    if (m.hidden) {
      block +=
        '\n- 可见性：仅知识库（已对学员隐藏；向用户说明出处时须写「知识库记载」，勿写「资料记载」）';
    }

    if (includeFileContent) {
      for (const file of freshFiles) {
        if (totalLength >= MAX_TOTAL_CONTEXT) break;
        const part = snippetFromFile(file, true);
        block += part;
        totalLength += part.length;
      }
    }

    if (totalLength < MAX_TOTAL_CONTEXT) {
      blocks.push(block);
      totalLength += block.length;
    }
  }

  const readableNote = includeFileContent
    ? '服务端已自动解析 docx/doc/txt/md/csv/xlsx/xls/pdf 正文；图片/视频/PPT 无法识别画面文字。'
    : '未包含附件正文（配置已关闭）。';
  const priorityNote =
    userQuery?.trim() && queryTokens(userQuery).length > 0
      ? ' 资料已按与当前提问的相关性排序。'
      : '';

  const header = `共 ${materials.length} 条资料。${readableNote}${priorityNote}\n向用户标注出处时统一使用「【知识库记载】」，勿用「【资料记载】」。\n若正文为考核题格式（含「（正确答案）」），须从选项与正确答案提炼事实后回答。\n\n`;

  return header + blocks.join('\n\n');
}
