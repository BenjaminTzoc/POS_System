import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { PurchaseService } from '../services';
import { CreatePurchaseDto, PurchaseResponseDto, UpdatePurchaseDto } from '../dto';
import { PurchaseStatus } from '../entities';
import { Public } from 'src/auth/decorators';

@Controller('purchases')
export class PurchaseController {
  constructor(
    private readonly purchaseService: PurchaseService,
  ) {}

  @Get('next-number')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getNextInvoiceNumber(): Promise<{ nextNumber: string }> {
    const nextNumber = await this.purchaseService.generateNextInvoiceNumber();
    return nextNumber;
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePurchaseDto): Promise<PurchaseResponseDto> {
    return this.purchaseService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<PurchaseResponseDto[]> {
    return this.purchaseService.findAll();
  }

  @Get('supplier/:supplierId')
  @Public()
  findBySupplier(@Param('supplierId', ParseUUIDPipe) supplierId: string): Promise<PurchaseResponseDto[]> {
    return this.purchaseService.findBySupplier(supplierId);
  }

  @Get('status/:status')
  @Public()
  findByStatus(@Param('status') status: PurchaseStatus): Promise<PurchaseResponseDto[]> {
    return this.purchaseService.findByStatus(status);
  }

  @Get('stats')
  @Public()
  getStats(): Promise<{
    total: number;
    pending: number;
    partiallyPaid: number;
    paid: number;
    cancelled: number;
    totalAmount: number;
    pendingAmount: number;
  }> {
    return this.purchaseService.getPurchaseStats();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseResponseDto> {
    return this.purchaseService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseDto,
  ): Promise<PurchaseResponseDto> {
    return this.purchaseService.update(id, dto);
  }

  @Post(':id/cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseResponseDto> {
    return this.purchaseService.cancel(id);
  }

  @Post(':id/receive/:branchId')
  @Public()
  @HttpCode(HttpStatus.OK)
  receivePurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<PurchaseResponseDto> {
    return this.purchaseService.receivePurchase(id, branchId);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.purchaseService.remove(id);
  }
}
