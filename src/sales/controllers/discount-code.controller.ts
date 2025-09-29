import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { DiscountCodeService } from '../services';
import { CreateDiscountCodeDto, DiscountCodeResponseDto, UpdateDiscountCodeDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('discount-codes')
export class DiscountCodeController {
  constructor(
    private readonly discountCodeService: DiscountCodeService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDiscountCodeDto): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<DiscountCodeResponseDto[]> {
    return this.discountCodeService.findAll();
  }

  @Get('active')
  @Public()
  findActive(): Promise<DiscountCodeResponseDto[]> {
    return this.discountCodeService.findActive();
  }

  @Get('stats')
  @Public()
  getStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    deleted: number;
    byScope: Record<string, number>;
    byType: Record<string, number>;
    totalUsage: number;
  }> {
    return this.discountCodeService.getDiscountCodeStats();
  }

  @Get('validate/:code')
  @Public()
  validateCode(
    @Param('code') code: string,
    @Query('customerId') customerId?: string,
    @Query('productId') productId?: string,
    @Query('purchaseAmount') purchaseAmount: number = 0,
  ): Promise<{ isValid: boolean; discountAmount: number; message?: string }> {
    return this.discountCodeService.validateDiscountCode(
      code, 
      customerId, 
      productId, 
      Number(purchaseAmount)
    );
  }

  @Get('code/:code')
  @Public()
  findByCode(@Param('code') code: string): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.findByCode(code);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountCodeDto,
  ): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.update(id, dto);
  }

  @Post('apply/:code')
  @Public()
  @HttpCode(HttpStatus.OK)
  applyDiscountCode(
    @Param('code') code: string,
    @Body('saleId', ParseUUIDPipe) saleId: string,
  ): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.applyDiscountCode(code, saleId);
  }

  @Patch(':id/toggle-status')
  @Public()
  @HttpCode(HttpStatus.OK)
  toggleStatus(@Param('id', ParseUUIDPipe) id: string): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.toggleStatus(id);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.discountCodeService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<DiscountCodeResponseDto> {
    return this.discountCodeService.restore(id);
  }
}
