export function formatUploadError(err: unknown): string {
  if (typeof err === 'string' && err.trim()) return err;

  const msg = err instanceof Error ? err.message : '';
  const lower = msg.toLowerCase();

  if (!msg) {
    return '保存失败：请确认已用管理员登录，并执行 npm run dev 后访问 http://localhost:5181/';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    return '无法连接后端，请确认终端里 npm run dev 正在运行，并使用本机 http://localhost:5181/ 或终端显示的局域网地址访问';
  }
  if (msg.includes('管理员') || msg.includes('403')) {
    return '需要管理员账号才能上传，请用「张明」登录';
  }
  if (msg.includes('未登录') || msg.includes('401') || msg.includes('过期')) {
    return '登录已过期，请刷新页面后重新登录';
  }
  if (msg.includes('100MB') || msg.includes('413') || msg.includes('过大')) {
    return msg;
  }
  if (msg.includes('未收到文件')) {
    return '未收到文件，请重新选择后再试';
  }

  return msg;
}
