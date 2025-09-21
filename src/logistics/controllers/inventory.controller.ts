import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { InventoryService } from '../services';
import { CreateInventoryDto, InventoryResponseDto, UpdateInventoryDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('inventories')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInventoryDto): Promise<InventoryResponseDto> {
    return this.inventoryService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<InventoryResponseDto[]> {
    return this.inventoryService.findAll();
  }

  @Get('product/:productId')
  @Public()
  findByProduct(@Param('productId', ParseUUIDPipe) productId: string): Promise<InventoryResponseDto[]> {
    return this.inventoryService.findByProduct(productId);
  }

  @Get('branch/:branchId')
  @Public()
  findByBranch(@Param('branchId', ParseUUIDPipe) branchId: string): Promise<InventoryResponseDto[]> {
    return this.inventoryService.findByBranch(branchId);
  }

  @Get('product/:productId/branch/:branchId')
  @Public()
  findByProductAndBranch(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<InventoryResponseDto> {
    return this.inventoryService.findByProductAndBranch(productId, branchId);
  }

  @Get('low-stock')
  @Public()
  getLowStock(@Query('branchId') branchId?: string): Promise<InventoryResponseDto[]> {
    return this.inventoryService.getLowStock(branchId);
  }

  @Get('stats')
  @Public()
  getStats(@Query('branchId') branchId?: string): Promise<{
    totalProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    totalValue: number;
  }> {
    return this.inventoryService.getInventoryStats(branchId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryResponseDto> {
    return this.inventoryService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryDto,
  ): Promise<InventoryResponseDto> {
    return this.inventoryService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.inventoryService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryResponseDto> {
    return this.inventoryService.restore(id);
  }
}
