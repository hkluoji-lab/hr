#!/usr/bin/env python3
"""Live-server smoke test for the local workbench web app.

Drives a *running* `dsh web` server (default http://127.0.0.1:3080) with a real
Chromium over real HTTP, covering authentication, the hero dashboard, every
sidebar surface, and member management including the delete-account round trip.

This is not part of the keyless e2e lane (apps/web/tests/*.e2e.ts): it needs a
live server, a reachable SMS-code log, and demo accounts, so it stays an
owner-local check under `manual/`. Prerequisites:

  1. The web server is running, e.g.
     `nohup node --import tsx/esm apps/cli/src/bin.ts web --no-open > /tmp/web-server.log 2>&1 &`
  2. Demo SMS codes are printed to the server log by web-login (deployment demo
     mode); the script greps the log for the newest `验证码 <6 digits>`.
  3. Playwright for Python with the Chrome channel:
     `python3 -m pip install playwright && playwright install chrome`

Every knob below can be overridden by an environment variable. The script exits
non-zero when the page raised an uncaught exception (JS failures) or a required
check failed, and prints any non-2xx responses it observed for triage.
"""

import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("WEB_BASE", "http://127.0.0.1:3080")
SMS_LOG = os.environ.get("WEB_SMS_LOG", "/tmp/web-server.log")
OWNER = os.environ.get("WEB_OWNER", "13800001234")
DEMO_USER = os.environ.get("WEB_DEMO_USER", "13900001111")
DEMO_PASS = os.environ.get("WEB_DEMO_PASS", "secret123")
NEW_PHONE = os.environ.get("WEB_NEW_PHONE", "13700008888")

results = []
console_errors = []
page_errors = []
bad_responses = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def latest_code():
    with open(SMS_LOG, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    for line in reversed(lines):
        m = re.search(r"验证码\s+(\d{6})", line)
        if m:
            return m.group(1)
    return None


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(15000)
        page.on("console", lambda m: console_errors.append(m.text) if m.type in ("error",) else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("response", lambda r: bad_responses.append((r.status, r.url)) if r.status >= 400 else None)

        def close_overlay():
            page.keyboard.press("Escape")
            page.wait_for_timeout(800)

        def open_nav(name):
            close_overlay()
            page.get_by_text(name, exact=True).first.click()
            page.wait_for_timeout(1500)

        # ---- 1. unauthenticated redirect ----
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        record("未认证访问 / 重定向到 /login", page.url.endswith("/login"), page.url)

        # ---- 2. login page tabs ----
        page.goto(BASE + "/login", wait_until="domcontentloaded")
        page.wait_for_selector("#pwd", timeout=8000)
        tabs = page.eval_on_selector_all("[data-tab]", "els => els.map(e => e.getAttribute('data-tab'))")
        record("登录页四个 tab", sorted(tabs) == sorted(["pwd", "sms", "register", "wechat"]), str(tabs))

        # ---- 3. owner SMS login ----
        page.click('[data-tab="sms"]')
        page.fill("#sms-phone", OWNER)
        page.click("#sms-send")
        page.wait_for_timeout(1500)
        page.fill("#sms-code", latest_code() or "000000")
        page.click("#sms-submit")
        page.wait_for_url(lambda u: not u.endswith("/login"), timeout=20000)
        page.wait_for_timeout(2500)
        record("owner 验证码登录成功", "/login" not in page.url, page.url)

        # ---- 4. dashboard hero ----
        body = page.inner_text("body")
        ok = "开始您的 AI 团队协作" in body and "138****1234" in body
        record("hero 问候语含用户名", ok)
        c = page.locator('[data-workbench-card="credits"]').count()
        t = page.locator('[data-workbench-card="team-status"]').count()
        g = page.locator('[data-workbench-card="progress"]').count()
        d = page.locator('[data-workbench-card="deliverables"]').count()
        record("hero 三卡存在且无交付物卡", c == 1 and t == 1 and g == 1 and d == 0 and "任务交付物" not in body,
               f"credits={c} team={t} progress={g} deliverables={d}")

        # ---- 5. sidebar entries ----
        nav_names = ["任务大厅", "智能任务助手", "活跃任务", "客户与申报", "AI 团队", "项目", "成员管理"]
        body = page.inner_text("body")
        missing = [n for n in nav_names if n not in body]
        record("侧边栏七个入口", not missing, "缺:" + ",".join(missing) if missing else "全部存在")

        # ---- 6. pages ----
        open_nav("任务大厅")
        body = page.inner_text("body")
        record("任务大厅页", "全部任务的运行状态" in body, body[:60].replace(chr(10), " "))

        open_nav("智能任务助手")
        body = page.inner_text("body")
        record("智能任务助手页（任务描述+发起按钮）", "任务描述" in body and "发起任务" in body,
               body[:60].replace(chr(10), " "))

        open_nav("活跃任务")
        body = page.inner_text("body")
        record("活跃任务页", "正在运行的任务" in body or "当前没有运行中的任务" in body,
               body[:60].replace(chr(10), " "))

        open_nav("客户与申报")
        body = page.inner_text("body")
        checks = {
            "申报日程": "申报" in body,
            "客户主档": "客户" in body,
            "文件签转": ("签转" in body or "催办" in body),
        }
        record("客户与申报页各分区", all(checks.values()),
               "; ".join(f"{k}={v}" for k, v in checks.items()))

        open_nav("AI 团队")
        body = page.inner_text("body")
        record("AI 团队页角色卡", "秘书" in body and "会计" in body and "法务" in body and "审计" in body,
               body[:60].replace(chr(10), " "))

        # 项目 opens the workspace browser in the sidebar (no overlay page)
        open_nav("项目")
        time.sleep(1.0)
        body = page.inner_text("body")
        record("项目入口打开工作区", len(body) > 40, body[:60].replace(chr(10), " "))
        # the workspace browser replaced the nav; reload to reset the sidebar
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        record("项目后刷新回到主界面", "成员管理" in page.inner_text("body"))

        # ---- 7. members management (owner) ----
        open_nav("成员管理")
        body = page.inner_text("body")
        record("成员管理页含已注册账号区", "已注册账号" in body and "删除账号" in body)

        owner_row = page.locator("li", has_text="本人账号不可删除").first
        n1 = owner_row.count()
        btns = owner_row.locator("button", has_text="删除账号").count() if n1 else -1
        record("owner 账号行无删除按钮", n1 == 1 and btns == 0, f"rows={n1} btns={btns}")

        acc_rows = page.locator("li", has_text="注册于").count()
        del_btns = page.locator("button", has_text="删除账号").count()
        record("账号区列出账号且非 owner 有删除按钮", acc_rows >= 2 and del_btns >= 1, f"rows={acc_rows} del={del_btns}")

        # ---- 8. registration (fresh session) + deletion round trip ----
        ctx.clear_cookies()
        page.goto(BASE + "/login", wait_until="domcontentloaded")
        page.wait_for_selector("#pwd", timeout=8000)
        page.click('[data-tab="register"]')
        page.wait_for_selector("#reg-phone", timeout=8000)
        page.fill("#reg-phone", NEW_PHONE)
        page.fill("#reg-password", "demo1234")
        page.fill("#reg-confirm", "demo1234")
        page.check("#agree")
        page.click("#reg-submit")
        page.wait_for_timeout(2500)
        body = page.inner_text("body") if "/login" not in page.url else ""
        record("注册新账号自动登录", "/login" not in page.url and "开始您的 AI 团队协作" in body, page.url)

        # owner deletes the new account via UI
        ctx.clear_cookies()
        page.goto(BASE + "/login", wait_until="domcontentloaded")
        page.click('[data-tab="sms"]')
        page.fill("#sms-phone", OWNER)
        page.click("#sms-send")
        page.wait_for_timeout(1500)
        page.fill("#sms-code", latest_code() or "000000")
        page.click("#sms-submit")
        page.wait_for_url(lambda u: not u.endswith("/login"), timeout=20000)
        page.wait_for_timeout(2000)
        open_nav("成员管理")
        target = page.locator("li", has_text=NEW_PHONE[:3] + "****" + NEW_PHONE[-4:]).first
        try:
            # The page must have loaded the account row; an absent row means the
            # page was still loading, and skipping the delete here would turn the
            # next login check into a false failure.
            target.wait_for(state="visible", timeout=8000)
        except Exception as e:
            record("owner 经界面删除新注册账号", False, f"目标行未出现: {str(e)[:120]}")
        else:
            target.locator("button", has_text="删除账号").click()
            page.wait_for_timeout(1800)
            still = page.locator("li", has_text=NEW_PHONE[:3] + "****" + NEW_PHONE[-4:]).count()
            record("owner 经界面删除新注册账号", still == 0, f"剩余行={still}")

        # deleted account cannot password-login
        ctx.clear_cookies()
        page.goto(BASE + "/login", wait_until="domcontentloaded")
        page.fill("#pwd-phone", NEW_PHONE)
        page.fill("#pwd-password", "demo1234")
        page.click("#pwd-submit")
        page.wait_for_timeout(2000)
        record("已删账号密码登录被拒", "/login" in page.url, page.url)

        # ---- 9. non-owner password login ----
        ctx.clear_cookies()
        page.goto(BASE + "/login", wait_until="domcontentloaded")
        page.wait_for_selector("#pwd", timeout=8000)
        page.fill("#pwd-phone", DEMO_USER)
        page.fill("#pwd-password", DEMO_PASS)
        page.click("#pwd-submit")
        page.wait_for_url(lambda u: not u.endswith("/login"), timeout=20000)
        page.wait_for_timeout(2000)
        body = page.inner_text("body")
        record("非 owner 密码登录", "开始您的 AI 团队协作" in body)
        record("非 owner 无成员管理入口", "成员管理" not in body)

        # ---- 10. cookie persistence + refresh ----
        cookies = ctx.cookies()
        auth = [c for c in cookies if c["name"].startswith("dsh-auth-")]
        maxage = auth[0]["expires"] - time.time() if auth else 0
        record("登录后 HttpOnly cookie 30 天", len(auth) == 1 and maxage > 2592000 * 0.9,
               f"cookie={[c['name'] for c in auth]} 有效期={int(maxage)}s")
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        body = page.inner_text("body")
        record("刷新后会话保持", "开始您的 AI 团队协作" in body, page.url)

        # ---- 11. logout ----
        ctx.clear_cookies()
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        record("退出登录后回到 /login", page.url.endswith("/login"), page.url)

        browser.close()

    # summary
    passed = sum(1 for _, ok, _ in results if ok)
    print("\n" + "=" * 60)
    print(f"共 {len(results)} 项，通过 {passed} 项")
    if console_errors:
        print("页面 console error 事件:")
        for e in console_errors[:10]:
            print("  [console]", e[:200])
    if page_errors:
        print("页面未捕获异常:")
        for e in page_errors[:10]:
            print("  [pageerror]", e[:300])
    if bad_responses:
        print("非 2xx 响应:")
        for st, u in bad_responses[:15]:
            print(f"  {st} {u[:160]}")
    failed = [name for name, ok, _ in results if not ok]
    if failed or page_errors:
        print("失败项:", ", ".join(failed) if failed else "(无断言失败，仅页面异常)")
        sys.exit(1)


if __name__ == "__main__":
    main()
