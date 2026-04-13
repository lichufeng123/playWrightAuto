export interface GroupPromptCase {
  name: string;
  prompt: string;
}

export const GROUP_PROMPT_CASES: GroupPromptCase[] = [
  {
    name: '品牌策略组',
    prompt:
      '我需要为【元气森林】制定品牌策略。当前所处的行业是【饮料行业】，主要竞争对手是【可口可乐、农夫山泉】。我们的核心优势或资源是【低糖配方、年轻化产品研发、强供应链】。希望打造一个【亲民活力】的品牌形象，核心目标受众是【18-30岁的都市年轻人】。品牌的长期愿景是【成为年轻人首选的健康饮品品牌】希望解决【品牌同质化、认知分散】的问题。',
  },
  {
    name: '市场策略组',
    prompt:
      '我们计划将【外星人电解质水】推向【马来西亚】市场，该产品的核心价值是【低糖但口感好，满足控糖人群的饮料替代】。当前的核心竞品是【Coke Zero、Perrier】。我们的核心目标客户是【18-35城市白领、健身人群】预算范围约为【50万马币】。希望在【6个月】内实现【占据2%市场份额】请重点规划【市场定位/渠道策略】。',
  },
  {
    name: '传播策略组',
    prompt:
      '我们需要为【元气森林】的【新品造势】制定传播策略。核心传播信息是【低糖但好喝，轻负担的快乐】核心目标人群是【18-30都市年轻人】传播阶段为【2026-01-01至2026-03-31】总预算约【300万】期望解决【品牌声量小】的问题。',
  },
  {
    name: '创意策略组',
    prompt:
      '我们需要为【魔爪】的【新品发布】制定创意方案。本次传播的核心目标是【提升尝试率】需要向目标受众【18-30都市年轻人】传达的关键信息是【低糖但好喝，轻负担】期望创意能引发【强烈好奇】整体的创意基调希望是【颠覆性】可参考的创意风格或案例包括【脑洞反转短片、极简高对比海报】。',
  },
];

export const GROUP_MESSAGE_TARGETS = GROUP_PROMPT_CASES.map(({ name }) => name);

export const GROUPS = {
  DEFAULT_TARGET: GROUP_MESSAGE_TARGETS[0],
  MESSAGE_TARGETS: GROUP_MESSAGE_TARGETS,
  PROMPT_CASES: GROUP_PROMPT_CASES,
};
