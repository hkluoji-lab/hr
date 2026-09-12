/**
 * The rendered login page: one self-contained HTML document (inline CSS and
 * vanilla JS, no external assets) with the pink brand wall on the left and
 * the login card on the right. All copy comes from {@link strings}; the page
 * renders no user data, so no escaping is needed.
 * @module @deepseek-ai/dsh-web-login/src/page
 */

import { strings } from './strings.ts'

/** Copy the page script needs at runtime, serialized into the document. */
const runtimeCopy = {
  sendCode: strings.card.sendCode,
  sending: strings.card.sending,
  resendTemplate: strings.card.resendTemplate,
  submitPassword: strings.card.submitPassword,
  submitting: strings.card.submitting,
  submitRegister: strings.card.submitRegister,
  registering: strings.card.registering,
  submitReset: strings.card.submitReset,
  resetting: strings.card.resetting,
  redeeming: strings.card.redeeming,
  redeemContinue: strings.card.redeemContinue,
  sentNotice: strings.card.sentNotice,
  passwordHint: strings.card.passwordHint,
  passwordRequired: strings.card.passwordRequired,
  agreeRequired: strings.card.agreeRequired,
  passwordMismatch: strings.card.passwordMismatch,
  showPassword: strings.card.showPassword,
  hidePassword: strings.card.hidePassword,
  errors: strings.errors,
} as const

/** The stacked-layers brand glyph, shared with the sidebar brand mark. */
const BRAND_GLYPH = [
  '<path d="M12 3.5 20.5 8 12 12.5 3.5 8Z" fill="#ffffff"/>',
  '<path d="m5 12.4 7 3.8 7-3.8"/>',
  '<path d="m5 16.8 7 3.7 7-3.7"/>',
].join('')

/** Line icons for the three product highlights. */
const HIGHLIGHT_ICONS = [
  // Team: two heads with shoulders.
  '<circle cx="9" cy="8" r="3.2"/><path d="M3.4 19c.7-3.1 3-4.8 5.6-4.8s4.9 1.7 5.6 4.8"/><circle cx="16.8" cy="9.4" r="2.5"/><path d="M15.6 14.9c2.3.2 4.2 1.7 4.9 4.1"/>',
  // Flow: refresh cycle.
  '<path d="M20 8.5A8 8 0 0 0 5.5 6.2L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 15.5a8 8 0 0 0 14.5 2.3L20 16"/><path d="M20 20.5V16h-4.5"/>',
  // Local data: lock.
  '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
] as const

/** Render-time knobs of the login page. */
export interface LoginPageOptions {
  /**
   * Whether the register form demands an SMS code. False renders no code
   * field at all, so the account is created from a phone and a password.
   */
  readonly requireRegistrationCode: boolean
}

/**
 * Render the complete login page document.
 * @param options - the deployment's register policy, mirrored by the page.
 * @returns the HTML document as one string.
 */
export function renderLoginPage(options: LoginPageOptions): string {
  const registerCodeField = options.requireRegistrationCode
    ? [
      `<label for="reg-code">${strings.card.labelCode}</label>`,
      '<div class="field">',
      '  <input id="reg-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"',
      `         maxlength="6" placeholder="${strings.card.codePlaceholder}">`,
      `  <button type="button" class="send" id="reg-send">${strings.card.sendCode}</button>`,
      '</div>',
    ].map(line => `        ${line}`).join('\n')
    : ''
  const registerCodeHint = options.requireRegistrationCode
    ? ''
    : `<p class="hint">${strings.card.noCodeHint}</p>`

  const highlightRows = strings.brand.highlights
    .map((highlight, index) => {
      const icon = HIGHLIGHT_ICONS[index] ?? HIGHLIGHT_ICONS[0]
      return [
        '<li>',
        `<span class="h-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>`,
        '<div>',
        `<b>${highlight.title}</b>`,
        `<span>${highlight.body}</span>`,
        '</div>',
        '</li>',
      ].join('')
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light">
<title>${strings.documentTitle}</title>
<style>
:root {
  --brand-1: #f7b3d2; --brand-2: #e08bc8; --brand-3: #d678c1;
  --ink: #251f2a; --muted: #8a8292; --line: #e9e3ec; --danger: #e5484d;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  color: var(--ink); background: #fbf8fb;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.shell { display: grid; grid-template-columns: 11fr 9fr; min-height: 100dvh; }

/* ── brand wall ───────────────────────────────────────────────────────── */
.brand {
  position: relative; overflow: hidden; color: #fff;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 44px 56px 36px;
  background: linear-gradient(160deg, var(--brand-1) 0%, var(--brand-2) 55%, var(--brand-3) 100%);
}
.brand::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,.075) 0 1px, transparent 1px 44px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.075) 0 1px, transparent 1px 44px);
  -webkit-mask-image: radial-gradient(120% 90% at 70% 20%, #000 0%, transparent 78%);
          mask-image: radial-gradient(120% 90% at 70% 20%, #000 0%, transparent 78%);
}
/* .brand > .orb, not .orb alone: the later .brand > * rule would otherwise
   win the equal-specificity cascade and pull the orbs back into flow. */
.brand > .orb { position: absolute; border-radius: 50%; pointer-events: none; }
.orb-a {
  width: 460px; height: 460px; right: -140px; top: -160px;
  background: radial-gradient(closest-side, rgba(255,255,255,.38), transparent 72%);
}
.orb-b {
  width: 380px; height: 380px; left: -120px; bottom: -150px;
  background: radial-gradient(closest-side, rgba(255,244,250,.30), transparent 70%);
}
.brand > * { position: relative; }
.brand-top { display: flex; align-items: center; }
.mark {
  width: 52px; height: 52px; border-radius: 15px; display: grid; place-items: center;
  background: linear-gradient(135deg, rgba(255,255,255,.42), rgba(255,255,255,.14));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.55), 0 10px 26px rgba(118,42,98,.24);
  margin-right: 13px;
}
.mark svg { width: 28px; height: 28px; }
.wordmark { font-size: 20px; font-weight: 700; letter-spacing: 2px; }
.badge {
  display: inline-block; margin-left: 7px; transform: translateY(-7px);
  background: #e5484d; color: #fff; font-size: 11.5px; font-weight: 600;
  line-height: 1; padding: 2.5px 5.5px; border-radius: 6px;
  box-shadow: 0 2px 8px rgba(160,32,48,.35);
}
.brand-title { font-size: clamp(30px, 3.4vw, 42px); font-weight: 800; margin: 0 0 12px; letter-spacing: 1px; }
.brand-tagline { font-size: 16px; margin: 0; opacity: .9; }
.highlights { list-style: none; margin: 44px 0 0; padding: 0; display: grid; gap: 22px; max-width: 460px; }
.highlights li { display: flex; align-items: flex-start; }
.h-icon {
  flex: 0 0 auto; width: 38px; height: 38px; border-radius: 12px; margin-right: 14px;
  display: grid; place-items: center;
  background: rgba(255,255,255,.18); box-shadow: inset 0 0 0 1px rgba(255,255,255,.4);
}
.h-icon svg { width: 19px; height: 19px; }
.highlights b { display: block; font-size: 15px; margin: 1px 0 3px; letter-spacing: .5px; }
.highlights span { font-size: 13px; opacity: .82; line-height: 1.55; }
.brand-foot { font-size: 12.5px; opacity: .58; letter-spacing: .5px; }

/* ── login panel ──────────────────────────────────────────────────────── */
.panel {
  display: grid; place-items: center; padding: 48px 32px;
  background: linear-gradient(180deg, #fcf9fc 0%, #f5f0f5 100%);
}
.card {
  width: min(400px, 100%); background: #fff; border-radius: 20px;
  padding: 38px 36px 28px; border: 1px solid #f1eaf3;
  box-shadow: 0 18px 50px rgba(46,32,58,.10), 0 2px 8px rgba(46,32,58,.05);
  animation: rise .45s ease both;
}
@keyframes rise { from { opacity: 0; transform: translateY(10px); } }
.card h2 { margin: 0 0 6px; font-size: 22px; text-align: center; letter-spacing: 1px; }
.sub { margin: 0 0 24px; font-size: 13px; color: var(--muted); text-align: center; }
.tabs { display: flex; gap: 30px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.tab {
  appearance: none; background: none; border: none; padding: 10px 2px 12px;
  font-size: 15px; color: var(--muted); cursor: pointer; position: relative;
  transition: color .2s ease; font-family: inherit;
}
.tab.is-active { color: var(--brand-3); font-weight: 600; }
.tab::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2.5px;
  border-radius: 2px; background: linear-gradient(90deg, var(--brand-1), var(--brand-3));
  transform: scaleX(0); transform-origin: left; transition: transform .25s ease;
}
.tab.is-active::after { transform: scaleX(1); }
.soon {
  font-size: 10.5px; font-weight: 500; color: var(--brand-3); margin-left: 6px;
  border: 1px solid rgba(214,120,193,.45); padding: 1px 6px; border-radius: 999px;
  vertical-align: 2px;
}
label { display: block; font-size: 13px; font-weight: 500; margin: 16px 0 6px; }
.field {
  display: flex; align-items: stretch; border: 1px solid var(--line);
  border-radius: 10px; background: #fff; overflow: hidden;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.field:focus-within { border-color: var(--brand-3); box-shadow: 0 0 0 3px rgba(214,120,193,.15); }
.prefix {
  display: flex; align-items: center; padding: 0 12px; font-size: 14.5px;
  background: #faf6fa; border-right: 1px solid var(--line); color: var(--ink);
}
.field input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  padding: 12px; font-size: 15px; color: var(--ink); font-family: inherit;
}
.field input::placeholder { color: #bcb4c2; }
.send {
  border: none; background: none; color: var(--brand-3); font-size: 13.5px;
  padding: 0 14px; cursor: pointer; white-space: nowrap; font-family: inherit;
  transition: color .15s ease;
}
.send:hover:not(:disabled) { filter: brightness(1.08); }
.send:disabled { color: #bcb4c2; cursor: default; }
.field.has-eye { position: relative; }
.field.has-eye input { padding-right: 44px; }
.eye {
  position: absolute; right: 6px; top: 0; bottom: 0; width: 36px;
  border: none; background: none; cursor: pointer; color: var(--muted);
  display: grid; place-items: center; padding: 0;
}
.eye svg { width: 18px; height: 18px; }
.eye:hover { color: var(--ink); }
.row {
  display: flex; justify-content: space-between; align-items: center;
  margin: 14px 0 0;
}
.check {
  display: flex; align-items: center; gap: 6px; margin: 0;
  font-size: 13px; font-weight: 400; color: var(--muted); cursor: pointer;
}
.check input { accent-color: var(--brand-3); margin: 0; }
.check a { color: var(--brand-3); text-decoration: none; }
.check a:hover { text-decoration: underline; }
.link { color: var(--brand-3); font-size: 13px; text-decoration: none; cursor: pointer; }
.link:hover { text-decoration: underline; }
.reset-title { margin: 10px 0 0; font-size: 15.5px; font-weight: 600; letter-spacing: 1px; }
.back { margin: 14px 0 0; text-align: center; }
.notice { margin: 10px 0 0; font-size: 12.5px; color: #2f9e6e; }
.hint { margin: 14px 0 0; font-size: 12.5px; color: var(--muted); }
.error { margin: 10px 0 0; font-size: 13px; color: var(--danger); }
.submit {
  margin-top: 22px; width: 100%; height: 46px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, var(--brand-1) 0%, var(--brand-2) 55%, var(--brand-3) 100%);
  color: #fff; font-size: 15.5px; font-weight: 600; letter-spacing: 2px;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 8px 20px rgba(214,120,193,.35);
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
}
.submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(214,120,193,.42); }
.submit:active:not(:disabled) { transform: translateY(0); }
.submit:disabled { filter: saturate(.55); opacity: .75; cursor: default; transform: none; box-shadow: none; }
.terms { margin: 18px 0 0; font-size: 12px; color: var(--muted); text-align: center; }
.terms a { color: var(--brand-3); text-decoration: none; }
.terms a:hover { text-decoration: underline; }
.wechat { text-align: center; padding: 18px 0 6px; }
.qr {
  width: 168px; height: 168px; margin: 4px auto 16px; border-radius: 14px;
  border: 1.5px dashed #e0c9dd; background: #fbf7fa; display: grid; place-items: center;
  color: #d9a9cd;
}
.qr svg { width: 58px; height: 58px; }
.w-title { margin: 0; font-size: 15px; font-weight: 600; }
.w-body { margin: 5px 0 0; font-size: 13px; color: var(--muted); }

/* ── narrow screens: the wall folds into a top banner ─────────────────── */
@media (max-width: 960px) {
  .shell { grid-template-columns: 1fr; }
  .brand { padding: 26px 24px; }
  .highlights, .brand-foot { display: none; }
  .brand-title { font-size: 22px; margin: 18px 0 6px; }
  .brand-tagline { font-size: 13.5px; }
  .mark { width: 42px; height: 42px; border-radius: 12px; margin-right: 10px; }
  .mark svg { width: 23px; height: 23px; }
  .wordmark { font-size: 16px; }
  .panel { padding: 28px 20px 44px; }
  .card { padding: 28px 22px 22px; }
  .tabs { gap: 16px; flex-wrap: wrap; }
  .tab { font-size: 13.5px; padding: 8px 2px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
  .tab::after, .submit, .send { transition: none; }
}
</style>
</head>
<body>
<main class="shell">
  <section class="brand" aria-label="星躍智品牌介绍">
    <i class="orb orb-a" aria-hidden="true"></i>
    <i class="orb orb-b" aria-hidden="true"></i>
    <header class="brand-top">
      <span class="mark" role="img" aria-label="${strings.brand.name}">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${BRAND_GLYPH}</svg>
      </span>
      <span class="wordmark">${strings.brand.name}</span><span class="badge" aria-hidden="true">${strings.brand.badge}</span>
    </header>
    <div class="brand-body">
      <h1 class="brand-title">${strings.brand.product}</h1>
      <p class="brand-tagline">${strings.brand.tagline}</p>
      <ul class="highlights">${highlightRows}</ul>
    </div>
    <footer class="brand-foot">${strings.brand.footer}</footer>
  </section>

  <section class="panel">
    <div class="card">
      <h2>${strings.card.title}</h2>
      <p class="sub">${strings.card.subtitle}</p>
      <div class="tabs" role="tablist" aria-label="登录方式">
        <button type="button" class="tab is-active" data-tab="pwd" role="tab" aria-selected="true">${strings.card.tabPassword}</button>
        <button type="button" class="tab" data-tab="sms" role="tab" aria-selected="false">${strings.card.tabSms}</button>
        <button type="button" class="tab" data-tab="register" role="tab" aria-selected="false">${strings.card.tabRegister}</button>
        <button type="button" class="tab" data-tab="wechat" role="tab" aria-selected="false">${strings.card.tabWechat}<span class="soon">${strings.card.badgeSoon}</span></button>
      </div>

      <form id="pwd" novalidate>
        <label for="pwd-phone">${strings.card.labelPhone}</label>
        <div class="field">
          <span class="prefix">+86</span>
          <input id="pwd-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"
                 maxlength="11" placeholder="${strings.card.phonePlaceholder}" autofocus>
        </div>
        <label for="pwd-password">${strings.card.labelPassword}</label>
        <div class="field has-eye">
          <input id="pwd-password" name="password" type="password" autocomplete="current-password"
                 placeholder="${strings.card.passwordPlaceholder}">
          <button type="button" class="eye" data-eye aria-label="${strings.card.showPassword}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <div class="row">
          <label class="check"><input id="remember" type="checkbox" checked>${strings.card.rememberMe}</label>
          <a href="#" class="link" id="forgot">${strings.card.forgot}</a>
        </div>
        <p class="notice" id="pwd-notice" hidden></p>
        <p class="error" id="pwd-error" role="alert" hidden></p>
        <button class="submit" id="pwd-submit" type="submit">${strings.card.submitPassword}</button>
      </form>

      <form id="sms" hidden novalidate>
        <label for="sms-phone">${strings.card.labelPhone}</label>
        <div class="field">
          <span class="prefix">+86</span>
          <input id="sms-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"
                 maxlength="11" placeholder="${strings.card.phonePlaceholder}">
        </div>
        <label for="sms-code">${strings.card.labelCode}</label>
        <div class="field">
          <input id="sms-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="${strings.card.codePlaceholder}">
          <button type="button" class="send" id="sms-send">${strings.card.sendCode}</button>
        </div>
        <label for="sms-invite">${strings.card.labelInvite}</label>
        <div class="field">
          <input id="sms-invite" name="invite" type="text" autocomplete="off"
                 maxlength="16" placeholder="${strings.card.invitePlaceholder}" spellcheck="false">
        </div>
        <p class="notice" id="sms-notice" hidden></p>
        <p class="error" id="sms-error" role="alert" hidden></p>
        <button class="submit" id="sms-submit" type="submit">${strings.card.submitPassword}</button>
      </form>

      <form id="register" hidden novalidate>
        <label for="reg-phone">${strings.card.labelPhone}</label>
        <div class="field">
          <span class="prefix">+86</span>
          <input id="reg-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"
                 maxlength="11" placeholder="${strings.card.phonePlaceholder}">
        </div>
${registerCodeField}
        <label for="reg-password">${strings.card.labelNewPassword}</label>
        <div class="field has-eye">
          <input id="reg-password" name="password" type="password" autocomplete="new-password"
                 maxlength="64" placeholder="${strings.card.newPasswordPlaceholder}">
          <button type="button" class="eye" data-eye aria-label="${strings.card.showPassword}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <label for="reg-confirm">${strings.card.labelConfirm}</label>
        <div class="field has-eye">
          <input id="reg-confirm" name="confirm" type="password" autocomplete="new-password"
                 maxlength="64" placeholder="${strings.card.confirmPlaceholder}">
          <button type="button" class="eye" data-eye aria-label="${strings.card.showPassword}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <div class="row">
          <label class="check"><input id="agree" type="checkbox">${strings.card.agreePrefix}
            <a href="#" onclick="return false">${strings.card.termsService}</a>${strings.card.termsAnd}<a href="#" onclick="return false">${strings.card.termsPrivacy}</a>
          </label>
        </div>
        <label for="reg-invite">${strings.card.labelInvite}</label>
        <div class="field">
          <input id="reg-invite" name="invite" type="text" autocomplete="off"
                 maxlength="16" placeholder="${strings.card.invitePlaceholder}" spellcheck="false">
        </div>
        ${registerCodeHint}
        <p class="error" id="reg-error" role="alert" hidden></p>
        <button class="submit" id="reg-submit" type="submit">${strings.card.submitRegister}</button>
      </form>

      <form id="reset" hidden novalidate>
        <p class="reset-title">${strings.card.resetTitle}</p>
        <label for="reset-phone">${strings.card.labelPhone}</label>
        <div class="field">
          <span class="prefix">+86</span>
          <input id="reset-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"
                 maxlength="11" placeholder="${strings.card.phonePlaceholder}">
        </div>
        <label for="reset-code">${strings.card.labelCode}</label>
        <div class="field">
          <input id="reset-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="${strings.card.codePlaceholder}">
          <button type="button" class="send" id="reset-send">${strings.card.sendCode}</button>
        </div>
        <label for="reset-password">${strings.card.labelNewPassword}</label>
        <div class="field has-eye">
          <input id="reset-password" name="password" type="password" autocomplete="new-password"
                 maxlength="64" placeholder="${strings.card.newPasswordPlaceholder}">
          <button type="button" class="eye" data-eye aria-label="${strings.card.showPassword}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <label for="reset-confirm">${strings.card.labelConfirm}</label>
        <div class="field has-eye">
          <input id="reset-confirm" name="confirm" type="password" autocomplete="new-password"
                 maxlength="64" placeholder="${strings.card.confirmPlaceholder}">
          <button type="button" class="eye" data-eye aria-label="${strings.card.showPassword}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <p class="error" id="reset-error" role="alert" hidden></p>
        <button class="submit" id="reset-submit" type="submit">${strings.card.submitReset}</button>
        <p class="back"><a href="#" class="link" id="back-login">${strings.card.backToLogin}</a></p>
      </form>

      <div class="wechat" id="wechat" hidden>
        <div class="qr" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.8" y="4" width="11.5" height="8.6" rx="3"/>
            <path d="M6 12.6 5 15.2l3.2-1.6"/>
            <rect x="10.6" y="9.4" width="10.4" height="7.6" rx="3"/>
            <path d="M17.6 17l1 2.4-3-1.5"/>
          </svg>
        </div>
        <p class="w-title">${strings.card.wechatTitle}</p>
        <p class="w-body">${strings.card.wechatBody}</p>
      </div>

      <p class="terms">${strings.card.termsPrefix} <a href="#" onclick="return false">${strings.card.termsService}</a> ${strings.card.termsAnd} <a href="#" onclick="return false">${strings.card.termsPrivacy}</a></p>
    </div>
  </section>
</main>
<script>
(function () {
  'use strict'
  var COPY = ${JSON.stringify(runtimeCopy)}
  var PHONE = /^1\\d{10}$/
  var CODE = /^\\d{6}$/
  // Mirrors the deployment's register policy: false registers from a phone
  // and a password alone, with no code field in the form at all.
  var REG_CODE = ${String(options.requireRegistrationCode)}
  var $ = function (id) { return document.getElementById(id) }

  // Front-end mirror of the server's password policy: 8-64 chars, one letter, one digit.
  function passwordOk(value) {
    return value.length >= 8 && value.length <= 64 && /[a-zA-Z]/.test(value) && /\\d/.test(value)
  }

  // Every form carries its own notice/error pair; submit paths hide them all first.
  var messages = ['pwd-notice', 'pwd-error', 'sms-notice', 'sms-error', 'reg-error', 'reset-error'].map($)
  function hideMessages() {
    messages.forEach(function (el) { el.hidden = true })
  }
  function showError(errEl, code, detail) {
    var message = COPY.errors[code] || COPY.errors['bad-request']
    if (code === 'cooldown' && typeof detail === 'number') {
      message = COPY.errors.cooldown + ' (' + detail + 's)'
    } else if (code === 'bad-code' && typeof detail === 'number') {
      message += ' (' + detail + ')'
    }
    errEl.textContent = message
    errEl.hidden = false
  }
  function showLocal(errEl, message) {
    errEl.textContent = message
    errEl.hidden = false
  }
  function resetButton(btn, label) { btn.disabled = false; btn.textContent = label }

  // Password show/hide: the eye toggles its own field's input type.
  document.querySelectorAll('[data-eye]').forEach(function (eye) {
    eye.addEventListener('click', function () {
      var input = eye.parentElement.querySelector('input')
      var hiddenAgain = input.type === 'text'
      input.type = hiddenAgain ? 'password' : 'text'
      eye.setAttribute('aria-label', hiddenAgain ? COPY.showPassword : COPY.hidePassword)
    })
  })

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (data) {
        return { status: res.status, data: data }
      })
    })
  }

  // One send button per form, each with its own countdown state.
  function resendText(left) { return COPY.resendTemplate.replace('{seconds}', String(left)) }
  function bindSend(btn, phoneInput, errEl, noticeEl) {
    var timer = null
    function startCountdown(seconds) {
      if (timer !== null) clearInterval(timer)
      var left = seconds
      btn.disabled = true
      btn.textContent = resendText(left)
      timer = setInterval(function () {
        left -= 1
        if (left <= 0) {
          clearInterval(timer)
          timer = null
          btn.disabled = false
          btn.textContent = COPY.sendCode
          return
        }
        btn.textContent = resendText(left)
      }, 1000)
    }
    btn.addEventListener('click', function () {
      hideMessages()
      var phone = phoneInput.value.trim()
      if (!PHONE.test(phone)) { showError(errEl, 'bad-phone'); phoneInput.focus(); return }
      btn.disabled = true
      btn.textContent = COPY.sending
      post('/auth/sms/send', { phone: phone }).then(function (reply) {
        if (reply.status === 200 && reply.data && reply.data.ok) {
          if (noticeEl !== null) {
            noticeEl.textContent = COPY.sentNotice
            noticeEl.hidden = false
          }
          startCountdown(reply.data.cooldownSeconds || 60)
          return
        }
        if (timer === null) resetButton(btn, COPY.sendCode)
        if (reply.status === 429 && reply.data && typeof reply.data.cooldownSeconds === 'number') {
          startCountdown(reply.data.cooldownSeconds)
        }
        showError(errEl, reply.data && reply.data.code, reply.data && reply.data.cooldownSeconds)
      }).catch(function () {
        if (timer === null) resetButton(btn, COPY.sendCode)
        showError(errEl, 'network')
      })
    })
  }
  bindSend($('sms-send'), $('sms-phone'), $('sms-error'), $('sms-notice'))
  if (REG_CODE) bindSend($('reg-send'), $('reg-phone'), $('reg-error'), null)
  bindSend($('reset-send'), $('reset-phone'), $('reset-error'), null)

  // ── panel switching ─────────────────────────────────────────────────────
  // Four tabs (password / SMS / register / WeChat) plus the reset panel,
  // which the forgot link opens without a tab of its own.
  var tabs = document.querySelectorAll('.tab')
  var panels = ['pwd', 'sms', 'register', 'reset', 'wechat'].map($)
  function showPanel(name) {
    panels.forEach(function (panel) { panel.hidden = panel.id !== name })
    tabs.forEach(function (tab) {
      var active = tab.getAttribute('data-tab') === name
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    var first = $(name).querySelector('input')
    if (first !== null) first.focus()
  }
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      showPanel(tab.getAttribute('data-tab'))
    })
  })
  $('forgot').addEventListener('click', function (event) {
    event.preventDefault()
    showPanel('reset')
  })
  $('back-login').addEventListener('click', function (event) {
    event.preventDefault()
    showPanel('pwd')
  })

  // A failed invite redeem keeps the caller logged in: the submit button
  // turns into an explicit continue that skips the (now consumed)
  // verification on the next submit.
  var continueMode = { sms: false, register: false }
  function redeem(btn, code, redirect, errEl, formId) {
    btn.disabled = true
    btn.textContent = COPY.redeeming
    post('/team/invites/redeem', { code: code }).then(function (reply) {
      if (reply.status === 200 && reply.data && reply.data.ok) {
        location.replace(redirect || '/')
        return
      }
      continueMode[formId] = true
      btn.disabled = false
      btn.textContent = COPY.redeemContinue
      showError(errEl, reply.data && reply.data.code)
    }).catch(function () {
      continueMode[formId] = true
      btn.disabled = false
      btn.textContent = COPY.redeemContinue
      showError(errEl, 'network')
    })
  }

  // ── password login ──────────────────────────────────────────────────────
  $('pwd').addEventListener('submit', function (event) {
    event.preventDefault()
    hideMessages()
    var phone = $('pwd-phone').value.trim()
    var password = $('pwd-password').value
    if (!PHONE.test(phone)) { showError($('pwd-error'), 'bad-phone'); $('pwd-phone').focus(); return }
    if (password === '') { showLocal($('pwd-error'), COPY.passwordRequired); $('pwd-password').focus(); return }
    var btn = $('pwd-submit')
    btn.disabled = true
    btn.textContent = COPY.submitting
    post('/auth/password/login', {
      phone: phone, password: password, remember: $('remember').checked,
    }).then(function (reply) {
      if (reply.status === 200 && reply.data && reply.data.ok) {
        location.replace(reply.data.redirect || '/')
        return
      }
      resetButton(btn, COPY.submitPassword)
      showError($('pwd-error'), reply.data && reply.data.code)
    }).catch(function () {
      resetButton(btn, COPY.submitPassword)
      showError($('pwd-error'), 'network')
    })
  })

  // ── SMS-code login ──────────────────────────────────────────────────────
  $('sms').addEventListener('submit', function (event) {
    event.preventDefault()
    if (continueMode.sms) { location.replace('/'); return }
    hideMessages()
    var phone = $('sms-phone').value.trim()
    var code = $('sms-code').value.trim()
    if (!PHONE.test(phone)) { showError($('sms-error'), 'bad-phone'); $('sms-phone').focus(); return }
    if (!CODE.test(code)) { showError($('sms-error'), 'bad-code'); $('sms-code').focus(); return }
    var btn = $('sms-submit')
    btn.disabled = true
    btn.textContent = COPY.submitting
    post('/auth/sms/verify', { phone: phone, code: code }).then(function (reply) {
      if (reply.status === 200 && reply.data && reply.data.ok) {
        var invite = $('sms-invite').value.trim()
        if (invite === '') { location.replace(reply.data.redirect || '/'); return }
        redeem(btn, invite, reply.data.redirect, $('sms-error'), 'sms')
        return
      }
      resetButton(btn, COPY.submitPassword)
      showError($('sms-error'), reply.data && reply.data.code, reply.data && reply.data.remainingAttempts)
    }).catch(function () {
      resetButton(btn, COPY.submitPassword)
      showError($('sms-error'), 'network')
    })
  })

  // ── registration (auto-login on success) ────────────────────────────────
  $('register').addEventListener('submit', function (event) {
    event.preventDefault()
    if (continueMode.register) { location.replace('/'); return }
    hideMessages()
    var phone = $('reg-phone').value.trim()
    var password = $('reg-password').value
    var confirm = $('reg-confirm').value
    if (!PHONE.test(phone)) { showError($('reg-error'), 'bad-phone'); $('reg-phone').focus(); return }
    var code = ''
    if (REG_CODE) {
      code = $('reg-code').value.trim()
      if (!CODE.test(code)) { showError($('reg-error'), 'bad-code'); $('reg-code').focus(); return }
    }
    if (!passwordOk(password)) { showLocal($('reg-error'), COPY.passwordHint); $('reg-password').focus(); return }
    if (password !== confirm) { showLocal($('reg-error'), COPY.passwordMismatch); $('reg-confirm').focus(); return }
    if (!$('agree').checked) { showLocal($('reg-error'), COPY.agreeRequired); return }
    var btn = $('reg-submit')
    btn.disabled = true
    btn.textContent = COPY.registering
    var body = REG_CODE ? { phone: phone, code: code, password: password } : { phone: phone, password: password }
    post('/auth/register', body).then(function (reply) {
      if (reply.status === 200 && reply.data && reply.data.ok) {
        var invite = $('reg-invite').value.trim()
        if (invite === '') { location.replace(reply.data.redirect || '/'); return }
        redeem(btn, invite, reply.data.redirect, $('reg-error'), 'register')
        return
      }
      resetButton(btn, COPY.submitRegister)
      showError($('reg-error'), reply.data && reply.data.code)
    }).catch(function () {
      resetButton(btn, COPY.submitRegister)
      showError($('reg-error'), 'network')
    })
  })

  // ── password reset (auto-login on success) ──────────────────────────────
  $('reset').addEventListener('submit', function (event) {
    event.preventDefault()
    hideMessages()
    var phone = $('reset-phone').value.trim()
    var code = $('reset-code').value.trim()
    var password = $('reset-password').value
    var confirm = $('reset-confirm').value
    if (!PHONE.test(phone)) { showError($('reset-error'), 'bad-phone'); $('reset-phone').focus(); return }
    if (!CODE.test(code)) { showError($('reset-error'), 'bad-code'); $('reset-code').focus(); return }
    if (!passwordOk(password)) { showLocal($('reset-error'), COPY.passwordHint); $('reset-password').focus(); return }
    if (password !== confirm) { showLocal($('reset-error'), COPY.passwordMismatch); $('reset-confirm').focus(); return }
    var btn = $('reset-submit')
    btn.disabled = true
    btn.textContent = COPY.resetting
    post('/auth/password/reset', { phone: phone, code: code, password: password }).then(function (reply) {
      if (reply.status === 200 && reply.data && reply.data.ok) {
        location.replace(reply.data.redirect || '/')
        return
      }
      resetButton(btn, COPY.submitReset)
      showError($('reset-error'), reply.data && reply.data.code)
    }).catch(function () {
      resetButton(btn, COPY.submitReset)
      showError($('reset-error'), 'network')
    })
  })

  fetch('/auth/status').then(function (res) { return res.json() }).then(function (status) {
    if (status && status.authenticated) location.replace('/')
  }).catch(function () { /* the page stays usable without the status probe */ })
})()
</script>
</body>
</html>
`
}
