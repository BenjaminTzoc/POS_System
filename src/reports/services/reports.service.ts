import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../sales/entities';
import { Branch } from '../../logistics/entities';
import { PdfService } from '../../common/pdf/pdf.service';
import { SalesReportsService } from './sales-reports.service';
import { InventoryReportsService } from './inventory-reports.service';
import { ConsolidatedReportsService } from './consolidated-reports.service';
import { CustomerWeeklySummaryService } from './customer-weekly-summary.service';
import { TodayPulseService } from './today-pulse.service';
import { TodayPaymentsService } from './today-payments.service';
import { TopProductsSummaryService } from './top-products-summary.service';
import { TopProductsSummaryQueryDto } from '../dto/top-products-summary.dto';
import { StockRunwayService } from './stock-runway.service';
import { StockRunwayQueryDto } from '../dto/stock-runway.dto';
import { SendWeeklyConsolidatedWhatsAppDto } from '../dto/send-weekly-consolidated-whatsapp.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly pdfService: PdfService,
    private readonly salesReports: SalesReportsService,
    private readonly inventoryReports: InventoryReportsService,
    private readonly consolidatedReports: ConsolidatedReportsService,
    private readonly customerWeeklySummary: CustomerWeeklySummaryService,
    private readonly todayPulse: TodayPulseService,
    private readonly todayPayments: TodayPaymentsService,
    private readonly topProductsSummary: TopProductsSummaryService,
    private readonly stockRunway: StockRunwayService,
  ) {}

  async generateWeeklyConsolidatedPdf(params: {
    customerId?: string;
    startDate?: string;
    endDate?: string;
    customerName?: string;
    nit?: string;
    phone?: string;
    address?: string;
    branchId?: string;
  }): Promise<Buffer> {
    let customerData: {
      name: string;
      nit: string;
      phone: string;
      address: string;
      categoryName?: string;
      lastPurchaseDate?: string | Date | null;
    } = {
      name: params.customerName || 'Consumidor Final',
      nit: params.nit || 'C/F',
      phone: params.phone || '',
      address: params.address || '',
    };

    if (params.customerId) {
      const customer = await this.customerRepository.findOne({
        where: { id: params.customerId },
        relations: ['category'],
      });
      if (customer) {
        customerData = {
          name: customer.name,
          nit: customer.nit || 'C/F',
          phone: customer.phone || '',
          address: customer.address || '',
          categoryName: customer.category?.name,
          lastPurchaseDate: customer.lastPurchaseDate,
        };
      }
    }

    let weekRange = 'Semana Actual';
    let weekStartDate = params.startDate;
    if (!weekStartDate) {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      weekStartDate = monday.toISOString().split('T')[0];
    }

    if (params.startDate && params.endDate) {
      weekRange = `${params.startDate} al ${params.endDate}`;
    } else if (params.startDate) {
      weekRange = `Desde ${params.startDate}`;
    }

    // Obtener datos consolidados si existen
    let metrics = { totalSpent: 0, orderCount: 0, avgTicket: 0 };
    let days: Array<{ day: string; total: number }> = [
      { day: 'Lun', total: 0 },
      { day: 'Mar', total: 0 },
      { day: 'Mié', total: 0 },
      { day: 'Jue', total: 0 },
      { day: 'Vie', total: 0 },
      { day: 'Sáb', total: 0 },
      { day: 'Dom', total: 0 },
    ];
    let financial = {
      paidAmount: 0,
      pendingAmount: 0,
      creditLimit: 0,
      creditUsed: 0,
    };

    let mix: Array<{
      productName: string;
      quantity: number;
      unit: string;
      revenue: number;
      share: number;
    }> = [];

    try {
      const summary = await this.customerWeeklySummary.getWeeklySummary(weekStartDate, params.branchId, 200);
      const targetItem = summary.customers.find((c) =>
        params.customerId ? c.id === params.customerId : c.name.toLowerCase() === customerData.name.toLowerCase()
      );

      if (targetItem) {
        metrics = {
          totalSpent: targetItem.total,
          orderCount: targetItem.orderCount,
          avgTicket: targetItem.averageTicket,
        };
        days = targetItem.days.map((d) => ({
          day: d.day,
          total: d.total,
        }));
        financial = {
          paidAmount: targetItem.paidAmount,
          pendingAmount: targetItem.pendingAmount,
          creditLimit: targetItem.creditLimit,
          creditUsed: targetItem.creditUsed,
        };
        if (targetItem.mix && targetItem.mix.length > 0) {
          mix = targetItem.mix.map((m) => ({
            productName: m.productName,
            quantity: m.quantity,
            unit: m.unit,
            revenue: m.revenue,
            share: m.share,
          }));
        }
        if (targetItem.lastPurchaseDate) {
          customerData.lastPurchaseDate = targetItem.lastPurchaseDate;
        }
      }
    } catch (e) {
      // Fallback a valores por defecto si no encuentra semana válida
    }

    let branchName = 'Todas las sucursales';
    if (params.branchId) {
      const branch = await this.branchRepository.findOne({ where: { id: params.branchId } });
      if (branch) {
        branchName = branch.name;
      }
    }

    return this.pdfService.generateWeeklyConsolidatedPdf({
      customer: customerData,
      emission: {
        date: new Date(),
        weekRange,
        branchName,
        reportType: 'Consolidado por Cliente',
      },
      metrics,
      days,
      financial,
      mix,
    });
  }


  // 1. Actividad en ventas (Trends)
  getSalesTrends(branchId?: string, days: number = 7, start?: Date, end?: Date, frequency?: any) {
    return this.salesReports.getSalesTrends(branchId, days, start, end, frequency);
  }

  // 2. Ventas por categoría
  getCategorySales(branchId?: string, start?: Date, end?: Date, frequency?: any) {
    return this.salesReports.getCategorySales(branchId, start, end, frequency);
  }

  // 3. Rendimiento de productos
  getProductPerformance(limit: number = 10, branchId?: string, start?: Date, end?: Date, frequency?: any) {
    return this.salesReports.getProductPerformance(limit, branchId, start, end, frequency);
  }

  // 4. Rendimiento de sucursales
  getBranchPerformance(branchId?: string, start?: Date, end?: Date, frequency?: any, sortBy?: any, order?: any) {
    return this.salesReports.getBranchPerformance(branchId, start, end, frequency, sortBy, order);
  }

  // 5. Alertas de inventario
  getCriticalStockReport(branchId?: string) {
    return this.inventoryReports.getCriticalStockReport(branchId);
  }

  // 6. Picos por hora
  getHourlySalesDistribution(branchId?: string, start?: Date, end?: Date) {
    return this.salesReports.getHourlySalesDistribution(branchId, start, end);
  }

  // 7. Merma por periodo
  getWasteTrends(branchId?: string, days: number = 30, start?: Date, end?: Date) {
    return this.inventoryReports.getWasteTrends(branchId, days, start, end);
  }

  // 8. Merma por producto
  getWasteByProduct(branchId?: string, limit: number = 10, start?: Date, end?: Date) {
    return this.inventoryReports.getWasteByProduct(branchId, limit, start, end);
  }

  // 10. Dashboard Unificado
  async getUnifiedDashboard(branchId?: string, days: number = 7, startDate?: Date, endDate?: Date) {
    const [trends, categories, products, criticalStock] = await Promise.all([this.getSalesTrends(branchId, days, startDate, endDate), this.getCategorySales(branchId, startDate, endDate), this.getProductPerformance(5, branchId, startDate, endDate), this.getCriticalStockReport(branchId)]);

    return {
      trends,
      categories,
      products,
      criticalStock: criticalStock.slice(0, 10),
    };
  }

  // 11. Calendario
  getDashboardCalendar(month?: number, year?: number, branchId?: string) {
    return this.consolidatedReports.getDashboardCalendar(month, year, branchId);
  }

  // 12. Consolidado Semanal Branch
  getWeeklyBranchConsolidated(month?: number, year?: number, branchId?: string) {
    return this.consolidatedReports.getWeeklyBranchConsolidated(month, year, branchId);
  }

  // 13. Consolidado Semanal Product
  getWeeklyProductConsolidated(weekStartDate: string, branchId?: string) {
    return this.consolidatedReports.getWeeklyProductConsolidated(weekStartDate, branchId);
  }

  // 14. Consolidado Semanal Customer
  getWeeklyCustomerConsolidated(weekStartDate: string, branchId?: string) {
    return this.consolidatedReports.getWeeklyCustomerConsolidated(weekStartDate, branchId);
  }

  getWeeklyCustomerSummary(weekStartDate: string, branchId?: string, limit?: number) {
    return this.customerWeeklySummary.getWeeklySummary(weekStartDate, branchId, limit);
  }

  getTodayPulse(branchId?: string, lowStockLimit?: number) {
    return this.todayPulse.getTodayPulse(branchId, lowStockLimit);
  }

  getTodayPayments(branchId?: string, limit?: number) {
    return this.todayPayments.getTodayPayments(branchId, limit);
  }

  // 15. Tendencias mensuales por producto
  getMonthlyProductSalesTrends(month?: number, year?: number, branchId?: string, limit?: number, page?: number) {
    return this.salesReports.getMonthlyProductSalesTrends(month, year, branchId, limit, page);
  }

  // 16. Resumen de productos más comprados
  getTopProductsSummary(query: TopProductsSummaryQueryDto) {
    return this.topProductsSummary.getTopProductsSummary(query);
  }

  // 17. Monitor de inventario y velocidad de consumo
  getStockRunway(query: StockRunwayQueryDto) {
    return this.stockRunway.getStockRunway(query);
  }

  async uploadMediaToMeta(pdfBuffer: Buffer, fileName: string): Promise<string> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      throw new BadRequestException('Las credenciales de WhatsApp no están configuradas');
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, fileName);
    formData.append('messaging_product', 'whatsapp');

    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Meta Media Upload Error (Weekly Consolidated):', errText);
      throw new InternalServerErrorException(`Fallo al subir el documento a Meta: ${errText}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  async sendWeeklyConsolidatedWhatsApp(dto: SendWeeklyConsolidatedWhatsAppDto): Promise<{ message: string }> {
    let customerName = dto.customerName || 'Cliente';
    let phone = dto.phone;

    if (dto.customerId) {
      const customer = await this.customerRepository.findOne({
        where: { id: dto.customerId },
      });
      if (customer) {
        if (!customerName || customerName === 'Cliente') {
          customerName = customer.name;
        }
        if (!phone) {
          phone = customer.phone || undefined;
        }
      }
    }

    if (!phone) {
      throw new BadRequestException('El cliente no tiene un número de teléfono asociado para enviar WhatsApp');
    }

    let cleanPhone = phone.replace(/\D/g, '');
    const defaultPrefix = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '502';
    if (cleanPhone.length === 8) {
      cleanPhone = defaultPrefix + cleanPhone;
    } else if (cleanPhone.length > 0 && !cleanPhone.startsWith(defaultPrefix)) {
      cleanPhone = defaultPrefix + cleanPhone;
    }

    try {
      let pdfBuffer: Buffer;
      if (dto.pdfBase64) {
        pdfBuffer = Buffer.from(dto.pdfBase64, 'base64');
      } else {
        pdfBuffer = await this.generateWeeklyConsolidatedPdf({
          customerId: dto.customerId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          branchId: dto.branchId,
          customerName: dto.customerName,
          phone: dto.phone,
        });
      }

      const safeCustomerName = customerName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Consolidado_${safeCustomerName}_${dto.startDate || 'Semanal'}.pdf`;
      const mediaId = await this.uploadMediaToMeta(pdfBuffer, fileName);

      const token = process.env.WHATSAPP_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

      const startDateText = dto.startDate || 'Inicio de semana';
      const endDateText = dto.endDate || 'Fin de semana';

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
          name: process.env.WHATSAPP_WEEKLY_CONSOLIDATED_TEMPLATE || 'envio_consolidado_semanal',
          language: {
            code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX',
          },
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    id: mediaId,
                    filename: fileName,
                  },
                },
              ],
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: startDateText },
                { type: 'text', text: endDateText },
              ],
            },
          ],
        },
      };

      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Meta Send Message Error (Weekly Consolidated):', errText);
        throw new InternalServerErrorException(`Fallo al enviar el mensaje de WhatsApp: ${errText}`);
      }

      return { message: 'Consolidado semanal enviado por WhatsApp exitosamente' };
    } catch (error) {
      console.error('Error in sendWeeklyConsolidatedWhatsApp:', error);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al procesar el envío de WhatsApp');
    }
  }
}
