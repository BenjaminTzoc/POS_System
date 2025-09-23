import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { PurchasePaymentService } from '../services';
import { CreatePurchasePaymentDto, PurchasePaymentResponseDto, UpdatePurchasePaymentDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('purchase-payments')
export class PurchasePaymentController {
  constructor(
    private readonly purchasePaymentService: PurchasePaymentService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePurchasePaymentDto): Promise<PurchasePaymentResponseDto> {
    return this.purchasePaymentService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<PurchasePaymentResponseDto[]> {
    return this.purchasePaymentService.findAll();
  }

  @Get('purchase/:purchaseId')
  @Public()
  findByPurchase(@Param('purchaseId', ParseUUIDPipe) purchaseId: string): Promise<PurchasePaymentResponseDto[]> {
    return this.purchasePaymentService.findByPurchase(purchaseId);
  }

  @Get('payment-method/:paymentMethodId')
  @Public()
  findByPaymentMethod(@Param('paymentMethodId', ParseUUIDPipe) paymentMethodId: string): Promise<PurchasePaymentResponseDto[]> {
    return this.purchasePaymentService.findByPaymentMethod(paymentMethodId);
  }

  @Get('supplier/:supplierId')
  @Public()
  getSupplierPayments(@Param('supplierId', ParseUUIDPipe) supplierId: string): Promise<PurchasePaymentResponseDto[]> {
    return this.purchasePaymentService.getSupplierPayments(supplierId);
  }

  @Get('date-range')
  @Public()
  findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<PurchasePaymentResponseDto[]> {
    return this.purchasePaymentService.findByDateRange(startDate, endDate);
  }

  @Get('stats')
  @Public()
  getStats(): Promise<{
    totalPayments: number;
    totalAmount: number;
    completedPayments: number;
    cancelledPayments: number;
    byPaymentMethod: Record<string, number>;
  }> {
    return this.purchasePaymentService.getPaymentStats();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PurchasePaymentResponseDto> {
    return this.purchasePaymentService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchasePaymentDto,
  ): Promise<PurchasePaymentResponseDto> {
    return this.purchasePaymentService.update(id, dto);
  }

  @Post(':id/cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PurchasePaymentResponseDto> {
    return this.purchasePaymentService.cancel(id);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.purchasePaymentService.remove(id);
  }
}
