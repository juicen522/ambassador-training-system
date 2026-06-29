/** 十如大使讲解收费标准（元/次/人） */

const FEE_TABLE = {
  workday: { zh: [100, 200, 300], en: [200, 400, 600] },
  holiday: { zh: [200, 400, 600], en: [400, 600, 800] },
  weekend: { zh: [600, 800, 1000], en: [600, 800, 1000] },
};

function durationTier(hours) {
  if (hours <= 1.5) return 0;
  if (hours < 3) return 1;
  return 2;
}

/**
 * @param {{ durationHours: number, language: 'zh'|'en', dayType: 'workday'|'holiday'|'weekend', ambassadorCount: number }} params
 */
export function calculateAmbassadorFee(params) {
  const hours = Math.max(0, Number(params.durationHours) || 0);
  const count = Math.max(1, Number(params.ambassadorCount) || 1);
  const rawDay = params.dayType === 'festival' ? 'weekend' : params.dayType;
  const dayType = FEE_TABLE[rawDay] ? rawDay : 'workday';
  const lang = params.language === 'en' ? 'en' : 'zh';
  const tier = durationTier(hours);
  const rate = FEE_TABLE[dayType][lang][tier];
  return {
    ratePerPerson: rate,
    ambassadorCount: count,
    durationHours: hours,
    durationTier: tier,
    totalFee: rate * count,
    dayType,
    language: lang,
  };
}

export function computeDurationHours(startAt, endAt) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / 3600000) * 10) / 10;
}
