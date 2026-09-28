"""验证码邮件：后台线程发送，失败重试三次。"""

from __future__ import annotations

import logging
import smtplib
import ssl
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

from config import settings

logger = logging.getLogger("lockauth.mail")

_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mail")
_BEIJING = timezone(timedelta(hours=8))

_COPY = {
    "register": {
        "subject": "LockAuth 注册验证码",
        "lead": "验证你的邮箱",
        "body": "在注册页面输入以下验证码。",
        "text_lead": "在注册页面输入以下验证码。",
    },
    "reset_password": {
        "subject": "LockAuth 重设密码验证码",
        "lead": "重设密码",
        "body": "在重设密码页面输入以下验证码。如果这不是你本人的操作，请忽略此邮件。",
        "text_lead": "在重设密码页面输入以下验证码。",
    },
}


def _render(code: str, purpose: str, expires_at: datetime) -> tuple[str, str, str]:
    copy = _COPY.get(purpose, _COPY["register"])
    expires = expires_at.replace(tzinfo=timezone.utc).astimezone(_BEIJING).strftime("%H:%M")
    year = datetime.now(_BEIJING).year
    digits = "".join(
        f'<td style="padding:0 5px;"><div style="width:40px;height:52px;line-height:52px;border-radius:10px;'
        f'background:#1c1a17;color:#f1ede6;font:600 26px/52px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
        f'text-align:center;">{d}</div></td>'
        for d in code
    )
    html = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>{copy['subject']}</title></head>
<body style="margin:0;padding:0;background:#efebe4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efebe4;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#faf8f4;border-radius:18px;border:1px solid #e3ddd3;">
    <tr><td style="padding:36px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:3px;height:22px;background:#2b2824;border-radius:2px;"></td>
        <td style="width:4px;"></td>
        <td style="width:3px;height:22px;background:#4f8f83;border-radius:2px;"></td>
        <td style="padding-left:12px;font:italic 500 20px Georgia,'Times New Roman',serif;color:#23201c;letter-spacing:-0.3px;">Lock<span style="font-style:normal;color:#7a736a;">Auth</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 40px 0 40px;font:600 22px/1.45 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#23201c;">{copy['lead']}</td></tr>
    <tr><td style="padding:10px 40px 0 40px;font:400 15px/1.75 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#5d574f;">{copy['body']}</td></tr>
    <tr><td align="left" style="padding:28px 35px 0 35px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>{digits}</tr></table>
    </td></tr>
    <tr><td style="padding:18px 40px 0 40px;font:400 13px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#8a8379;">
      10 分钟内有效（北京时间 {expires} 前）。请勿告诉他人。
    </td></tr>
    <tr><td style="padding:32px 40px 36px 40px;">
      <div style="height:1px;background:#e7e1d8;"></div>
      <p style="margin:18px 0 0 0;font:400 12px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#9d968c;">
        Funk &amp; Love · 浙江大学 DFM 街舞社
      </p>
    </td></tr>
  </table>
  <p style="margin:18px 0 0 0;font:400 11px sans-serif;color:#aaa39a;">© {year} Funk &amp; Love</p>
</td></tr></table>
</body></html>"""
    text = (
        f"{copy['text_lead']}\n\n"
        f"你的验证码：{code}\n"
        f"10 分钟内有效（北京时间 {expires} 前）。请勿告诉他人。\n\n"
        f"如果这不是你本人的操作，请忽略此邮件。\n\n"
        f"— Funk & Love · LockAuth"
    )
    return copy["subject"], html, text


def _build_message(to: str, subject: str, html: str, text: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    name, addr = parseaddr(settings.mail_default_sender)
    msg["From"] = formataddr((str(Header(name or "Funk & Love", "utf-8")), addr or settings.mail_default_sender))
    msg["To"] = to
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg


def _open_smtp(context: ssl.SSLContext) -> smtplib.SMTP:
    if settings.mail_use_ssl:
        return smtplib.SMTP_SSL(settings.mail_server, settings.mail_port, timeout=30, context=context)
    smtp = smtplib.SMTP(settings.mail_server, settings.mail_port, timeout=30)
    smtp.ehlo()
    if settings.mail_use_tls:
        smtp.starttls(context=context)
        smtp.ehlo()
    return smtp


def _deliver(to: str, msg: MIMEMultipart) -> None:
    sender = parseaddr(settings.mail_default_sender)[1] or settings.mail_default_sender
    context = ssl.create_default_context()
    last_error: Exception | None = None
    for attempt in range(3):
        smtp = None
        try:
            try:
                smtp = _open_smtp(context)
            except ssl.SSLCertVerificationError:
                # 个别邮箱服务商证书链不全，退回不校验证书（旧版一直是这样连的）
                logger.warning("SMTP 证书校验失败，改用不校验的连接")
                context = ssl._create_unverified_context()  # noqa: S323
                smtp = _open_smtp(context)
            smtp.login(settings.mail_username, settings.mail_password)
            smtp.sendmail(sender, [to], msg.as_string())
            smtp.quit()
            logger.info("验证码邮件已发送 -> %s", to)
            return
        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP 登录失败，检查 MAIL_USERNAME / MAIL_PASSWORD")
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("发送验证码邮件失败（第 %s/3 次）-> %s: %s", attempt + 1, to, exc)
            if smtp is not None:
                try:
                    smtp.close()
                except Exception:  # noqa: BLE001
                    pass
            time.sleep(2)
    logger.error("验证码邮件最终发送失败 -> %s: %s", to, last_error)


def send_code_email(to: str, code: str, purpose: str, expires_at: datetime) -> None:
    subject, html, text = _render(code, purpose, expires_at)
    if settings.mail_suppress:
        logger.warning("[MAIL_SUPPRESS_SEND] %s 的验证码：%s", to, code)
        return
    _pool.submit(_deliver, to, _build_message(to, subject, html, text))


def preview_html(purpose: str = "register") -> str:
    """本地看邮件样式用：python -c "from services.mailer import preview_html; print(preview_html())" """
    return _render("482915", purpose, datetime.utcnow() + timedelta(minutes=10))[1]
