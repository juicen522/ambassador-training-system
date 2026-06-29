import { Router } from 'express';
import { loadSettings, getAiRuntimeConfig, resolveAnswerMode } from '../settings.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

/** 统一出处标注用语（模型偶发仍会写「资料记载」） */
function normalizeCitationLabels(text) {
  return text
    .replace(/【资料记载】/g, '【知识库记载】')
    .replace(/【培训资料记载】/g, '【知识库记载】');
}

function buildStrictSystemPrompt(settings) {
  const site = settings.system.siteName || '园林大使培训系统';
  const styleGuide = settings.knowledgeAssistant.answerStyleGuide?.trim() || '';

  return `你是「${site}」的知识库助手（严格模式），服务对象是园林大使讲解员。你必须严格遵守：
1. 仅根据下方【知识库资料】回答，不得编造资料中不存在的内容。
2. 资料中没有相关信息时，明确说：「知识库中暂未找到相关资料，建议在上方资料库中浏览或联系管理员补充。」
3. 引用知识库内容时，出处标题必须写「【知识库记载】」，禁止写「【资料记载】」「【培训资料记载】」等。
4. 使用简体中文；站点、路线名称必须与资料原文一致。
5. 不回答与园林大使培训无关的问题。
${styleGuide ? `\n${styleGuide}\n` : ''}
【知识库资料】
`;
}

function buildFlexibleSystemPrompt(settings) {
  const site = settings.system.siteName || '园林大使培训系统';
  const styleGuide = settings.knowledgeAssistant.answerStyleGuide?.trim() || '';

  return `你是「${site}」的知识库助手（宽松模式），服务对象是园林大使讲解员。
1. **以【知识库资料】为主**：优先引用资料中的标题、路线、站点名与表述；具体参观顺序、专有名词不得与资料明显矛盾。
2. **知识库未记载时也要继续回答**：不要只回复「知识库中暂未找到相关资料」就结束。须先写明「知识库中未记载该点」，再在单独段落 **【补充说明（非知识库官方内容）】** 下用通用植物学/讲解常识简要补充，并提醒「以下仅供参考，正式讲解请以知识库资料为准」。
3. 若知识库有部分信息：必须先写「【知识库记载】」段落呈现原文要点，禁止写「【资料记载】」。再视需要写「【补充说明（非知识库官方内容）】」。
4. 使用简体中文；用户问路线时仍优先用「站点A ➡️ 站点B」链式呈现（站点名须来自资料，不可编造）。
5. 不回答与园林大使培训无关的问题。
${styleGuide ? `\n${styleGuide}\n` : ''}
【知识库资料】
`;
}

router.post('/', authRequired, async (req, res) => {
  try {
    const settings = loadSettings();

    if (!settings.features.materialsAiChat) {
      return res.status(403).json({ error: '知识库 AI 助手已在配置管理中关闭' });
    }
    if (!settings.knowledgeAssistant.enabled) {
      return res.status(403).json({ error: '知识库 AI 助手未启用' });
    }

    const ai = getAiRuntimeConfig();
    if (!ai) {
      return res.status(503).json({ error: '未配置 AI，请在配置管理中设置 API Key' });
    }

    const { messages, knowledgeContext } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '缺少对话消息' });
    }

    const answerMode = resolveAnswerMode(settings.knowledgeAssistant);
    const maxTurns = settings.knowledgeAssistant.maxHistoryTurns || 10;
    const trimmed = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content) }))
      .slice(-maxTurns * 2);

    const kbBlock =
      typeof knowledgeContext === 'string' && knowledgeContext.trim()
        ? knowledgeContext.trim()
        : '（当前知识库为空）';

    const systemContent =
      (answerMode === 'flexible'
        ? buildFlexibleSystemPrompt(settings)
        : buildStrictSystemPrompt(settings)) + kbBlock;

    const response = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: systemContent }, ...trimmed],
        temperature: ai.temperature,
        max_tokens: ai.maxTokens,
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `AI 服务错误（${response.status}）` });
    }

    const data = await response.json();
    const rawReply = data.choices?.[0]?.message?.content?.trim();
    if (!rawReply) return res.status(502).json({ error: 'AI 未返回内容' });

    const reply = normalizeCitationLabels(rawReply);
    res.json({ reply, mode: answerMode });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '服务器错误' });
  }
});

export default router;
