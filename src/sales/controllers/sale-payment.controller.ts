import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SalePaymentService } from '../services';
import { CreateSalePaymentDto, SalePaymentResponseDto, UpdateSalePaymentDto, SalePaymentReceiptResponseDto, IndividualPaymentReceiptResponseDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('sale-payment')
export class SalePaymentController {
  constructor(private readonly salePaymentService: SalePaymentService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSalePaymentDto): Promise<SalePaymentResponseDto> {
    return this.salePaymentService.create(dto);
  }

  @Post('partial/:saleId')
  @HttpCode(HttpStatus.CREATED)
  createPartialPayment(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body()
    payments: Array<{
      paymentMethodId: string;
      amount: number;
      referenceNumber?: string;
      bankAccountId?: string;
      manualBankAccount?: string;
    }>,
  ): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.createPartialPayment(saleId, payments);
  }

  @Get()
  findAll(): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.findAll();
  }

  @Get('sale/:saleId/receipt/pdf')
  async getSaleReceiptPdf(@Param('saleId', ParseUUIDPipe) saleId: string, @Res() res: Response) {
    const { buffer, invoiceNumber } = await this.salePaymentService.generateReceiptPdf(saleId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Recibo_Abono_${invoiceNumber}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sale/:saleId/receipt')
  getSaleReceipt(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<SalePaymentReceiptResponseDto> {
    return this.salePaymentService.getSaleReceipt(saleId);
  }

  @Get('receipt/:id')
  getPaymentReceipt(@Param('id', ParseUUIDPipe) id: string): Promise<IndividualPaymentReceiptResponseDto> {
    return this.salePaymentService.getPaymentReceipt(id);
  }

  @Get('sale/:saleId')
  findBySale(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.findBySale(saleId);
  }

  @Get('payment-method/:paymentMethodId')
  findByPaymentMethod(@Param('paymentMethodId', ParseUUIDPipe) paymentMethodId: string): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.findByPaymentMethod(paymentMethodId);
  }

  @Get('customer/:customerId')
  getCustomerPayments(@Param('customerId', ParseUUIDPipe) customerId: string): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.getCustomerPayments(customerId);
  }

  @Get('date-range')
  findByDateRange(@Query('startDate') startDate: string, @Query('endDate') endDate: string): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.findByDateRange(startDate, endDate);
  }

  @Get('daily/:date')
  getDailyPayments(@Param('date') date: string): Promise<{
    date: string;
    total: number;
    payments: SalePaymentResponseDto[];
  }> {
    return this.salePaymentService.getDailyPayments(date);
  }

  @Get('stats')
  getStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    completedPayments: number;
    cancelledPayments: number;
    byPaymentMethod: Record<string, number>;
    averagePayment: number;
  }> {
    return this.salePaymentService.getPaymentStats();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SalePaymentResponseDto> {
    return this.salePaymentService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSalePaymentDto): Promise<SalePaymentResponseDto> {
    return this.salePaymentService.update(id, dto);
  }

  @Post(':id/cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<SalePaymentResponseDto> {
    return this.salePaymentService.cancel(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.salePaymentService.remove(id);
  }
}
