import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { SaleService } from '../services';
import { CreateSaleDto, SaleResponseDto, UpdateSaleDto } from '../dto';
import { SaleStatus, SaleType } from '../entities';

@Controller('sale')
export class SaleController {
  constructor(
    private readonly saleService: SaleService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSaleDto): Promise<SaleResponseDto> {
    return this.saleService.create(dto);
  }

  @Post(':id/confirm/:branchId')
  @HttpCode(HttpStatus.OK)
  confirmSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<SaleResponseDto> {
    return this.saleService.confirmSale(id, branchId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelSale(@Param('id', ParseUUIDPipe) id: string): Promise<SaleResponseDto> {
    return this.saleService.cancelSale(id);
  }

  @Get()
  findAll(): Promise<SaleResponseDto[]> {
    return this.saleService.findAll();
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId', ParseUUIDPipe) customerId: string): Promise<SaleResponseDto[]> {
    return this.saleService.findByCustomer(customerId);
  }

  @Get('status/:status')
  findByStatus(@Param('status') status: SaleStatus): Promise<SaleResponseDto[]> {
    return this.saleService.findByStatus(status);
  }

  @Get('daily/:date')
  getDailySales(@Param('date') date: string): Promise<SaleResponseDto[]> {
    return this.saleService.getDailySales(date);
  }

  @Get('stats')
  getStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    totalAmount: number;
    averageSale: number;
    byType: Record<SaleType, number>;
  }> {
    return this.saleService.getSaleStats();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SaleResponseDto> {
    return this.saleService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
  ): Promise<SaleResponseDto> {
    return this.saleService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.saleService.remove(id);
  }
}
