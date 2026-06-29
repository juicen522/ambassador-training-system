/** 生产环境：不写入演示数据，使用真实账号与业务数据 */
export function isProductionMode() {
  if (process.env.SEED_DEMO_DATA === '1') return false;
  if (process.env.SEED_DEMO_DATA === '0') return true;
  return (
    process.env.APP_MODE === 'production' || process.env.NODE_ENV === 'production'
  );
}

export function shouldSeedDemoData() {
  return !isProductionMode();
}
