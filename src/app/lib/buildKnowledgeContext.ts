import { fetchKnowledgeContextApi } from './materialsApi';

/**
 * 由服务端解析全部可识别附件并组装 AI 上下文（docx/pdf/xlsx 等）
 */
export async function buildKnowledgeContext(
  _materials: unknown,
  _includeFileContent = true,
  userQuery?: string,
): Promise<string> {
  return fetchKnowledgeContextApi(userQuery);
}
