export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  apiKeyConfigured?: boolean;
  apiKeyPreview?: string;
}

export interface SystemSettings {
  siteName: string;
  organizationName: string;
  supportContact: string;
}

export interface KnowledgeAssistantSettings {
  enabled: boolean;
  /** strict=仅根据资料；flexible=以资料为主可补充说明 */
  answerMode?: 'strict' | 'flexible';
  /** @deprecated 兼容旧配置，请用 answerMode */
  useKnowledgeBase?: boolean;
  welcomeMessage: string;
  flexibleWelcomeMessage?: string;
  /** @deprecated 请用 flexibleWelcomeMessage */
  generalWelcomeMessage?: string;
  maxHistoryTurns: number;
  includeTextFileContent: boolean;
  answerStyleGuide?: string;
}

export interface FeatureSettings {
  materialsAiChat: boolean;
  weeklyTest: boolean;
  knowledgeTest: boolean;
  showQuickLogin: boolean;
}

/** 侧边栏菜单 + 页面标题 + 说明 */
export interface NavCopy {
  menuLabel: string;
  pageTitle: string;
  pageDescription: string;
}

export interface ServicePageLabels extends NavCopy {}

export interface ServiceApplicationsLabels extends ServicePageLabels {
  backLinkLabel: string;
  emptyListHint: string;
}

export interface ServiceNavigationSettings {
  demandsGroupLabel: string;
  workGroupLabel: string;
  newRequest: ServicePageLabels;
  applications: ServiceApplicationsLabels;
  tasks: ServicePageLabels;
  report: ServicePageLabels;
}

export interface TrainingNavigation {
  menuLabel: string;
  overview: NavCopy;
  basic: NavCopy;
  advanced: NavCopy;
}

export interface AdminNavigation {
  menuLabel: string;
  pageTitle: string;
  pageDescription: string;
  tabs: {
    users: string;
    materials: string;
    training: string;
    settings: string;
  };
}

export interface AmbassadorServicesAdminNavigation {
  menuLabel: string;
  pageTitle: string;
  pageDescription: string;
  requests: NavCopy;
  visits: NavCopy;
}

export interface ApprovalFlowNavigation extends NavCopy {}

export interface NavigationSettings {
  dashboard: NavCopy;
  materials: NavCopy;
  training: TrainingNavigation;
  admin: AdminNavigation;
  approvalFlow: ApprovalFlowNavigation;
  ambassadorServices: AmbassadorServicesAdminNavigation;
  service: ServiceNavigationSettings;
}

export const DEFAULT_SERVICE_NAVIGATION: ServiceNavigationSettings = {
  demandsGroupLabel: '大使需求',
  workGroupLabel: '讲解服务',
  newRequest: {
    menuLabel: '发起大使需求',
    pageTitle: '发起大使需求',
    pageDescription:
      '需求部门填写并提交后，由管理员派单给指定大使；参观结束后大使填报实际时长，系统据此统计积分。',
  },
  applications: {
    menuLabel: '我的申请单',
    pageTitle: '我的申请单',
    pageDescription: '查看您提交的需求及处理进度；被退回的需求可修改后重新提交。',
    backLinkLabel: '返回我的申请单',
    emptyListHint: '暂无申请记录，请点击「发起大使需求」填写表单。',
  },
  tasks: {
    menuLabel: '我的讲解任务',
    pageTitle: '我的讲解任务',
    pageDescription:
      '查看管理员派给您的讲解任务，接受或拒绝派单；参观结束后填报实际讲解时长。',
  },
  report: {
    menuLabel: '我的服务报表',
    pageTitle: '我的服务报表',
    pageDescription: '汇总您的讲解积分、服务时长及每次参观记录。',
  },
};

export const DEFAULT_NAVIGATION: NavigationSettings = {
  dashboard: {
    menuLabel: '首页',
    pageTitle: '欢迎回来',
    pageDescription: '继续你的学习之旅',
  },
  materials: {
    menuLabel: '知识库',
    pageTitle: '培训资料库',
    pageDescription: '浏览和学习园林大使必备知识（点击卡片可打开已上传的文件）',
  },
  training: {
    menuLabel: '培训中心',
    overview: {
      menuLabel: '学习进度',
      pageTitle: '我的学习进度',
      pageDescription: '全面了解你的培训完成情况',
    },
    basic: {
      menuLabel: '基础培训',
      pageTitle: '基础培训',
      pageDescription: '按顺序完成5个阶段，全面掌握讲解技能',
    },
    advanced: {
      menuLabel: '进阶培训',
      pageTitle: '进阶培训',
      pageDescription: '深化专业知识，提升讲解技能',
    },
  },
  admin: {
    menuLabel: '培训管理',
    pageTitle: '培训管理',
    pageDescription: '管理大使、知识库、培训内容与系统配置',
    tabs: {
      users: '大使管理',
      materials: '知识库管理',
      training: '培训内容管理',
      settings: '配置管理',
    },
  },
  approvalFlow: {
    menuLabel: '审批流',
    pageTitle: '审批流',
    pageDescription: '集中查看和处理待审批事项，后续可在此接入完整审批流程。',
  },
  ambassadorServices: {
    menuLabel: '大使服务',
    pageTitle: '大使服务',
    pageDescription: '派单处理讲解需求；大使填报实际参观时长后，在此统计积分与排行',
    requests: {
      menuLabel: '需求处理',
      pageTitle: '需求处理',
      pageDescription: '',
    },
    visits: {
      menuLabel: '参观与积分',
      pageTitle: '参观与积分',
      pageDescription: '',
    },
  },
  service: DEFAULT_SERVICE_NAVIGATION,
};

export interface AppSettings {
  ai: AiSettings;
  system: SystemSettings;
  knowledgeAssistant: KnowledgeAssistantSettings;
  features: FeatureSettings;
  navigation: NavigationSettings;
}

export interface PublicAppSettings {
  system: Pick<SystemSettings, 'siteName' | 'organizationName'>;
  knowledgeAssistant: Pick<
    KnowledgeAssistantSettings,
    | 'enabled'
    | 'answerMode'
    | 'welcomeMessage'
    | 'flexibleWelcomeMessage'
    | 'maxHistoryTurns'
    | 'includeTextFileContent'
  >;
  features: FeatureSettings;
  navigation: NavigationSettings;
  aiConfigured: boolean;
}

export const AI_PROVIDER_PRESETS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'qwen',
    label: '通义千问（兼容模式）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
] as const;
