/** 首页展示与相册页共用；后期可将 imageUrl 改为上传文件或 CDN 地址 */

export type AmbassadorPhoto = {
  id: string;
  /** 图片地址，留空则使用占位渐变 */
  imageUrl?: string;
  caption: string;
};

export type AmbassadorAlbum = {
  id: string;
  title: string;
  date: string;
  location?: string;
  /** 首页卡片摘要 */
  summary: string;
  /** 活动内页「活动简介」 */
  intro?: string;
  /** 相册页正文 */
  description: string;
  /** 正文为后台富文本 HTML */
  descriptionHtml?: boolean;
  coverImageUrl?: string;
  /** 无封面图时的渐变色 */
  coverGradient: string;
  photos: AmbassadorPhoto[];
};

export const AMBASSADOR_MOMENTS_INTRO = {
  pageTitle: '大使风采相册',
  pageDescription:
    '记录十如大使在讲解服务、培训学习与团队活动中的日常瞬间。每一张照片背后，都是我们对园林故事的热爱与传递。',
  homeTitle: '大使日常互动',
  homeDescription: '走进讲解现场与团队活动的精彩瞬间，点击查看完整相册与故事文案。',
};

export const ambassadorAlbums: AmbassadorAlbum[] = [
  {
    id: 'spring-open-day',
    title: '春日园区开放日讲解',
    date: '2026年4月',
    location: '十如园区 · 主游览线',
    summary: '新人大使首次联岗讲解，来宾互动热烈。',
    description:
      '开放日当天，多位正式大使带领来宾沿常规路线参观，并在丝亭、绮彩楼展厅前做重点讲解。新人大使在带教老师陪同下完成首次对外服务，现场问答与合影环节气氛轻松，也帮助我们收集了讲解节奏与动线安排的反馈。',
    coverGradient: 'linear-gradient(135deg, #C3E2C7 0%, #5EC4B6 55%, #7EB8A8 100%)',
    photos: [
      {
        id: 's1',
        caption: '开放日集合，出发前核对讲解要点与分工。',
      },
      {
        id: 's2',
        caption: '丝亭前为来宾介绍园林建筑与十如故事。',
      },
      {
        id: 's3',
        caption: '展厅内协助来宾理解展陈内容与参观礼仪。',
      },
      {
        id: 's4',
        caption: '活动尾声团队合影，总结本场服务亮点。',
      },
    ],
  },
  {
    id: 'training-workshop',
    title: '讲解演练工作坊',
    date: '2026年3月',
    location: '培训中心',
    summary: '基础培训阶段集体演练，互评互学。',
    description:
      '工作坊围绕「开场破冰、动线节奏、收尾致谢」三个模块展开。学员分组模拟真实参观场景，由资深大使担任评委，从语言表达、站位手势与突发问题应对等维度给出建议。演练结束后，大家将优秀片段整理进内部资料库，供后续新人学习参考。',
    coverGradient: 'linear-gradient(135deg, #FDD562 0%, #F5C98A 45%, #E8A838 100%)',
    photos: [
      {
        id: 't1',
        caption: '小组讨论讲解脚本与分工。',
      },
      {
        id: 't2',
        caption: '模拟讲解动线，评委现场记录反馈。',
      },
      {
        id: 't3',
        caption: '互评环节：指出亮点与可改进之处。',
      },
    ],
  },
  {
    id: 'team-gathering',
    title: '大使团队季度聚会',
    date: '2026年2月',
    location: '园区餐厅',
    summary: '经验分享与文化建设，增进团队默契。',
    description:
      '季度聚会上，服务时长与积分表现突出的大使分享了接待外企团体、节假日讲解等经验。L&D 同步了下半年的培训安排与需求单流程更新。轻松的茶歇与交流环节，也让跨部门协作更加顺畅。',
    coverGradient: 'linear-gradient(135deg, #E8D4C8 0%, #C9A99A 50%, #9A7B6E 100%)',
    photos: [
      {
        id: 'g1',
        caption: '季度表彰：感谢持续投入的大使伙伴。',
      },
      {
        id: 'g2',
        caption: '经验分享环节，讨论节假日讲解注意事项。',
      },
      {
        id: 'g3',
        caption: '自由交流时间，新老大使结对答疑。',
      },
      {
        id: 'g4',
        caption: '聚会合影，记录团队温暖时刻。',
      },
    ],
  },
  {
    id: 'winter-garden',
    title: '冬季园林专题讲解',
    date: '2026年1月',
    location: '蓉湖 · 云裳楼外围',
    summary: '结合季节特点设计讲解内容，来宾反馈良好。',
    description:
      '冬季讲解侧重园林季相、植物休眠特征与室内展厅的衔接。大使们提前更新了冬季版讲解词，并在户外停留时间、保暖提示等方面做了细致安排。专场活动结束后，我们根据来宾问卷优化了冬季动线时长建议。',
    coverGradient: 'linear-gradient(135deg, #B8D4E8 0%, #7A9EB8 50%, #5A7A94 100%)',
    photos: [
      {
        id: 'w1',
        caption: '蓉湖畔介绍冬季水景与植物季相。',
      },
      {
        id: 'w2',
        caption: '云裳楼外围讲解建筑细节与历史背景。',
      },
      {
        id: 'w3',
        caption: '来宾小组讨论，大使答疑互动。',
      },
    ],
  },
];

export function getAlbumById(id: string): AmbassadorAlbum | undefined {
  return ambassadorAlbums.find((a) => a.id === id);
}
