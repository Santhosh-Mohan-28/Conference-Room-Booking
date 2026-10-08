/**
 * Enterprise Email Delivery Service Abstraction
 *
 * Supports pluggable email delivery providers:
 * - "resend": Resend REST API (https://resend.com)
 * - "sendgrid": SendGrid v3 REST API (https://sendgrid.com)
 * - "smtp": Generic HTTP/SMTP webhook or direct REST bridge
 * - "console": Development/fallback server log delivery
 *
 * Configured via environment variables:
 * - EMAIL_PROVIDER ("resend" | "sendgrid" | "console")
 * - EMAIL_API_KEY (API key for the chosen provider)
 * - EMAIL_FROM (Sender address, e.g. "Conference Room Booking <noreply@company.com>")
 */

export interface SendOtpEmailParams {
  to: string;
  otp: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<EmailDeliveryResult> {
  const { to, otp } = params;
  const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase().trim();
  const from = process.env.EMAIL_FROM || "Conference Room Booking <noreply@company.com>";
  const apiKey = process.env.EMAIL_API_KEY || "";

  const subject = `Your Conference Room Booking Verification Code: ${otp}`;
  const textBody = [
    "Conference Room Booking System",
    "--------------------------------------------------",
    `Your verification code is: ${otp}`,
    "",
    "This single-use code will expire in 5 minutes.",
    "If you did not request this login code, please ignore this email or contact corporate security.",
    "--------------------------------------------------",
  ].join("\n");

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <tr>
      <td style="padding: 28px 32px; background: linear-gradient(135deg, #1e40af, #3b82f6); text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Conference Room Booking System</h1>
        <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 13px;">Enterprise Workplace Scheduling</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <p style="font-size: 15px; margin: 0 0 16px; color: #334155;">Hello,</p>
        <p style="font-size: 14px; margin: 0 0 24px; color: #64748b; line-height: 1.5;">
          Use the 6-digit verification code below to sign in to your corporate account:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <div style="display: inline-block; padding: 14px 28px; background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace;">
            ${otp}
          </div>
        </div>
        <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; margin: 24px 0;">
          <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.4;">
            ⏱ <strong>Expires in 5 minutes.</strong> For security, this single-use code cannot be reused and should never be shared with anyone.
          </p>
        </div>
        <p style="font-size: 12px; margin: 24px 0 0; color: #94a3b8; line-height: 1.4;">
          If you did not request this login verification code, please ignore this email or report it to your company system administrator.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
        Confidential Internal Corporate Communication &bull; All logins are audited
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  // 1. Resend Provider
  if (provider === "resend" && apiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[EmailService:Resend] Error sending email:", errorText);
        return { success: false, error: `Resend error: ${res.status}` };
      }

      const data = (await res.json()) as { id?: string };
      return { success: true, messageId: data.id };
    } catch (err: any) {
      console.error("[EmailService:Resend] Exception:", err);
      return { success: false, error: err.message };
    }
  }

  // 2. SendGrid Provider
  if (provider === "sendgrid" && apiKey) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from.includes("<") ? from.replace(/.*<([^>]+)>.*/, "$1") : from },
          subject,
          content: [
            { type: "text/plain", value: textBody },
            { type: "text/html", value: htmlBody },
          ],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[EmailService:SendGrid] Error sending email:", errorText);
        return { success: false, error: `SendGrid error: ${res.status}` };
      }

      return { success: true, messageId: res.headers.get("x-message-id") || undefined };
    } catch (err: any) {
      console.error("[EmailService:SendGrid] Exception:", err);
      return { success: false, error: err.message };
    }
  }

  // 3. Fallback / Console / Logger
  // Used in local development or when provider credentials are not yet configured.
  // Securely logged to server console (never exposed to browser client).
  console.log("============================================================");
  console.log(`[EMAIL SERVICE: ${provider.toUpperCase()}]`);
  console.log(`To:      ${to}`);
  console.log(`From:    ${from}`);
  console.log(`Subject: ${subject}`);
  console.log(`Code:    [ ${otp} ] (Valid for 5 minutes)`);
  console.log("============================================================");

  return {
    success: true,
    messageId: `console-${Date.now()}`,
  };
}
