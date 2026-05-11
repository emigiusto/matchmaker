import { MailtrapClient } from 'mailtrap';

const mailtrap = new MailtrapClient({ token: process.env.MAILTRAP_API_KEY! });

const FROM = {
  name: 'MatchMaker',
  email: process.env.EMAIL_USER || 'no-reply@aceup.club',
};

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Recuperar contraseña</h2>
      <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace expira en 1 hora.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Restablecer contraseña
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no cambiará.
      </p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
        <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
      </p>
    </div>
  `;

  await mailtrap.send({
    from: FROM,
    to: [{ email: to }],
    subject: 'Restablecer contraseña – MatchMaker',
    html,
    text: `Restablece tu contraseña visitando: ${resetUrl}`,
  });
}
