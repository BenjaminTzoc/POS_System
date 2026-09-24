import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SaleService } from '../services/sale.service';

@Injectable()
export class BillingReminderJob {
  private readonly logger = new Logger(BillingReminderJob.name);

  constructor(private readonly saleService: SaleService) {}

  @Cron('0 8 * * *', { timeZone: 'America/Guatemala' })
  async handleBillingStartReminders() {
    this.logger.log('Cron de recordatorio de inicio de cobro');
    await this.saleService.processBillingStartReminders();
  }
}
