import { MailtrapClient } from 'mailtrap';

const mailtrap = new MailtrapClient({ token: process.env.MAILTRAP_API_KEY! });

const FROM = {
  name: 'MatchMaker',
  email: process.env.EMAIL_USER || 'no-reply@aceup.club',
};

const COPY: Record<string, { subject: string; heading: string; body: string; cta: string; ignore: string; fallback: string }> = {
  es: {
    subject: 'Restablecer contraseña – MatchMaker',
    heading: 'Recuperar contraseña',
    body: 'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace expira en 1 hora.',
    cta: 'Restablecer contraseña',
    ignore: 'Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no cambiará.',
    fallback: 'Si el botón no funciona, copia y pega este enlace en tu navegador:',
  },
  en: {
    subject: 'Reset your password – MatchMaker',
    heading: 'Reset your password',
    body: 'We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in 1 hour.',
    cta: 'Reset password',
    ignore: 'If you did not request this change, you can ignore this email. Your password will not change.',
    fallback: 'If the button does not work, copy and paste this link into your browser:',
  },
  ca: {
    subject: 'Restableix la contrasenya – MatchMaker',
    heading: 'Recupera la contrasenya',
    body: "Hem rebut una sol·licitud per restablir la contrasenya del teu compte. Fes clic al botó de sota per crear una nova contrasenya. Aquest enllaç expira en 1 hora.",
    cta: 'Restablir la contrasenya',
    ignore: 'Si no has sol·licitat aquest canvi, pots ignorar aquest correu. La teva contrasenya no canviarà.',
    fallback: 'Si el botó no funciona, copia i enganxa aquest enllaç al teu navegador:',
  },
};

export async function sendPasswordResetEmail(to: string, resetUrl: string, locale = 'es'): Promise<void> {
  const c = COPY[locale] ?? COPY.es;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>${c.heading}</h2>
      <p>${c.body}</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          ${c.cta}
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">${c.ignore}</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
        ${c.fallback}<br/>
        <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
      </p>
    </div>
  `;

  await mailtrap.send({
    from: FROM,
    to: [{ email: to }],
    subject: c.subject,
    html,
    text: `${c.cta}: ${resetUrl}`,
  });
}
