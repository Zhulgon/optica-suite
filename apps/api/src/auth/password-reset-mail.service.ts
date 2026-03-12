import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class PasswordResetMailService {
  private readonly logger = new Logger(PasswordResetMailService.name);

  private getTransportConfig() {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = String(process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim();

    if (!host || !from || !Number.isFinite(port) || port <= 0) {
      return null;
    }

    return {
      host,
      port,
      secure,
      user,
      pass,
      from,
    };
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
  }) {
    const config = this.getTransportConfig();
    if (!config) {
      this.logger.warn(
        `SMTP no configurado. Link de recuperacion para ${params.to}: ${params.resetUrl}`,
      );
      return { delivered: false };
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });

    await transporter.sendMail({
      from: config.from,
      to: params.to,
      subject: 'Optica Suite - Recuperacion de contrasena',
      text: [
        `Hola ${params.name},`,
        '',
        'Recibimos una solicitud para restablecer tu contraseña.',
        `Abre este enlace para continuar: ${params.resetUrl}`,
        '',
        'Si no solicitaste este cambio, puedes ignorar este correo.',
      ].join('\n'),
    });

    return { delivered: true };
  }
}
