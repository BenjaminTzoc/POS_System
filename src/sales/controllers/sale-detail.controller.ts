import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { SaleDetailService } from '../services';
import { CreateSaleDetailDto, SaleDetailResponseDto, UpdateSaleDetailDto } from '../dto';

@Controller('sale-details')
export class SaleDetailController {
  constructor(
    private readonly saleDetailService: SaleDetailService,
  ) {}

  @Post('sale/:saleId')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() dto: CreateSaleDetailDto,
  ): Promise<SaleDetailResponseDto> {
    return this.saleDetailService.create(dto, saleId);
  }

  @Get('sale/:saleId')
  findAllBySale(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<SaleDetailResponseDto[]> {
    return this.saleDetailService.findAllBySale(saleId);
  }

  @Get('sale/:saleId/discounts')
  findDetailsWithDiscounts(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<SaleDetailResponseDto[]> {
    return this.saleDetailService.findDetailsWithDiscounts(saleId);
  }

  @Get('sale/:saleId/stats')
  getSaleDetailsStats(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<{
    totalItems: number;
    totalQuantity: number;
    averagePrice: number;
    totalTax: number;
    totalDiscount: number;
    mostSoldProduct: { productId: string; productName: string; quantity: number } | null;
  }> {
    return this.saleDetailService.getSaleDetailsStats(saleId);
  }

  @Get('product/:productId/stats')
  getProductSalesStats(@Param('productId', ParseUUIDPipe) productId: string): Promise<{
    totalSold: number;
    totalRevenue: number;
    averagePrice: number;
    salesCount: number;
  }> {
    return this.saleDetailService.getProductSalesStats(productId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SaleDetailResponseDto> {
    return this.saleDetailService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDetailDto,
  ): Promise<SaleDetailResponseDto> {
    return this.saleDetailService.update(id, dto);
  }

  @Put(':id/quantity/:quantity')
  @HttpCode(HttpStatus.OK)
  updateQuantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quantity') quantity: number,
  ): Promise<SaleDetailResponseDto> {
    return this.saleDetailService.updateDetailQuantity(id, quantity);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.saleDetailService.remove(id);
  }
}
