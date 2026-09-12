/**
 * All login-page copy in one place. This is a host-rendered static page, so
 * the strings live here rather than in a client locale dictionary; a page
 * change starts with a change to this table.
 * @module @deepseek-ai/dsh-web-login/src/strings
 */

/** Every user-visible string of the rendered login page. */
export const strings = {
  documentTitle: '登录 — 星躍智 · AI 秘书工作台',

  brand: {
    name: '星躍智',
    badge: '秘',
    product: 'AI 秘书工作台',
    tagline: '一句话任务，交给你的 AI 团队',
    highlights: [
      {
        title: 'AI 团队协作',
        body: '秘书、会计、法务、审计四角色智能协同',
      },
      {
        title: '任务自动流转',
        body: '智能分诊、并行执行、复核交付，全程可追踪',
      },
      {
        title: '数据本地化',
        body: '会话与凭据保存在本机，隐私由你掌控',
      },
    ],
    footer: '星躍智 · 安全的 AI 团队工作台',
  },

  card: {
    title: '登录 / 注册',
    subtitle: '使用手机号密码登录，或切换验证码登录与注册',
    tabPassword: '密码登录',
    tabSms: '验证码登录',
    tabRegister: '注册',
    tabWechat: '微信扫码',
    badgeSoon: '即将上线',
    labelPhone: '手机号',
    phonePlaceholder: '请输入手机号',
    labelPassword: '密码',
    passwordPlaceholder: '请输入密码',
    labelCode: '验证码',
    codePlaceholder: '6 位验证码',
    sendCode: '获取验证码',
    resendTemplate: '{seconds}s 后重发',
    labelNewPassword: '设置密码',
    newPasswordPlaceholder: '8-64 位，含字母和数字',
    labelConfirm: '确认密码',
    confirmPlaceholder: '再次输入密码',
    rememberMe: '记住我',
    forgot: '忘记密码？',
    resetTitle: '重置密码',
    backToLogin: '返回登录',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
    labelInvite: '邀请码（选填）',
    invitePlaceholder: '持有团队邀请码请填写',
    submitPassword: '登录',
    submitting: '登录中…',
    submitRegister: '注册并登录',
    registering: '注册中…',
    submitReset: '重置密码并登录',
    resetting: '重置中…',
    redeeming: '绑定岗位中…',
    redeemContinue: '进入工作台',
    sending: '发送中…',
    sentNotice: '验证码已发送（演示模式：请查看服务端控制台）',
    passwordHint: '8-64 位，至少包含一个字母和一个数字',
    passwordRequired: '请输入密码',
    agreePrefix: '我已阅读并同意',
    agreeRequired: '请先勾选同意服务条款与隐私政策',
    passwordMismatch: '两次输入的密码不一致',
    wechatTitle: '微信扫码登录',
    wechatBody: '微信扫码登录即将上线，敬请期待',
    termsPrefix: '登录即代表同意',
    termsService: '服务条款',
    termsAnd: '与',
    termsPrivacy: '隐私政策',
  },

  status: {
    authenticated: '已登录，正在进入工作台…',
  },

  errors: {
    'bad-phone': '请输入正确的手机号',
    'bad-request': '请求格式不正确，请重试',
    'bad-code': '验证码错误',
    'no-challenge': '请先获取验证码',
    'expired': '验证码已过期，请重新获取',
    'exhausted': '尝试次数过多，请重新获取验证码',
    'cooldown': '发送过于频繁，请稍后再试',
    'unsupported-media-type': '请求格式不正确，请重试',
    'payload-too-large': '请求过大，请重试',
    'authority-unavailable': '服务暂时不可用，请重试',
    'bad-invite': '邀请码不存在，请核对后重试',
    'invite-used': '邀请码已被使用',
    'invite-expired': '邀请码已过期，请联系管理员重新发放',
    'wrong-password': '手机号或密码错误',
    'no-credential': '该账号未设置密码，请使用验证码登录',
    'phone-registered': '该手机号已注册，请直接登录',
    'no-account': '该手机号尚未注册',
    'weak-password': '密码需 8-64 位，且至少包含一个字母和一个数字',
    network: '网络异常，请检查后重试',
  },
} as const
