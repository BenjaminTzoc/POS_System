import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST') || 'smtp.gmail.com';
    const port = parseInt(this.configService.get<string>('MAIL_PORT') || '465', 10);
    const user = this.configService.get<string>('MAIL_USER');
    const rawPass = this.configService.get<string>('MAIL_PASS') || '';
    const pass = rawPass.replace(/\s+/g, ''); // Quitar cualquier espacio en blanco accidental

    this.transporter = nodemailer.createTransport({
      service: host.includes('gmail') ? 'gmail' : undefined,
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async sendMail(to: string, subject: string, text: string, attachments?: any[]) {
    try {
      const mailOptions = {
        from: `"Sistema POS" <${this.configService.get('MAIL_USER')}>`,
        to,
        subject,
        text,
        attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      throw new InternalServerErrorException('Error al enviar el correo electrónico');
    }
  }
}
