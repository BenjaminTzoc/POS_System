import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { SalePaymentService } from '../services';
import { CreateSalePaymentDto, SalePaymentResponseDto, UpdateSalePaymentDto } from '../dto';

@Controller('sale-payment')
export class SalePaymentController {
  constructor(
    private readonly salePaymentService: SalePaymentService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSalePaymentDto): Promise<SalePaymentResponseDto> {
    return this.salePaymentService.create(dto);
  }

  @Post('partial/:saleId')
  @HttpCode(HttpStatus.CREATED)
  createPartialPayment(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() payments: Array<{ paymentMethodId: string; amount: number; referenceNumber?: string; bankAccount?: string }>,
  ): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.createPartialPayment(saleId, payments);
  }

  @Get()
  findAll(): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.findAll();
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
  findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<SalePaymentResponseDto[]> {
    return this.salePaymentService.findByDateRange(startDate, endDate);
  }

  @Get('daily/:date')
  getDailyPayments(@Param('date') date: string): Promise<{ date: string; total: number; payments: SalePaymentResponseDto[] }> {
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
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalePaymentDto,
  ): Promise<SalePaymentResponseDto> {
    return this.salePaymentService.update(id, dto);
  }

  @Post(':id/cancel')
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
