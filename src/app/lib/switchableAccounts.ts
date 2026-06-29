/** 流程模拟测试账号（与 server ensureSimulationFlowDemo 对应） */
export const SWITCHABLE_ACCOUNTS = [
  {
    username: 'simulate_admin',
    name: '模拟·管理员',
    roleLabel: '管理员 · 派单与处理需求',
    group: '流程模拟',
  },
  {
    username: 'simulate_ambassador',
    name: '王芳',
    roleLabel: '正式大使 · 讲解与填报',
    group: '流程模拟',
  },
] as const;
