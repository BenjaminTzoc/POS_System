import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { InventoryMovementService } from '../services';
import { CreateInventoryMovementDto, InventoryMovementResponseDto, UpdateInventoryMovementDto } from '../dto';
import { MovementType } from '../entities/inventory-movement.entity';
import { Public } from 'src/auth/decorators';

@Controller('inventory-movements')
export class InventoryMovementController {
  constructor(
    private readonly movementService: InventoryMovementService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInventoryMovementDto): Promise<InventoryMovementResponseDto> {
    return this.movementService.create(dto);
  }

  @Post('transfer')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  createTransfer(
    @Body('productId', ParseUUIDPipe) productId: string,
    @Body('fromBranchId', ParseUUIDPipe) fromBranchId: string,
    @Body('toBranchId', ParseUUIDPipe) toBranchId: string,
    @Body('quantity') quantity: number,
    @Body('notes') notes?: string,
  ): Promise<{ outMovement: InventoryMovementResponseDto; inMovement: InventoryMovementResponseDto }> {
    return this.movementService.createTransfer(productId, fromBranchId, toBranchId, quantity, notes);
  }

  @Post('transfer/:referenceId/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  completeTransfer(
    @Param('referenceId') referenceId: string,
  ): Promise<{ outMovement: InventoryMovementResponseDto; inMovement: InventoryMovementResponseDto }> {
    return this.movementService.completeTransfer(referenceId);
  }

  @Get()
  @Public()
  findAll(): Promise<InventoryMovementResponseDto[]> {
    return this.movementService.findAll();
  }

  @Get('product/:productId')
  @Public()
  findByProduct(@Param('productId', ParseUUIDPipe) productId: string): Promise<InventoryMovementResponseDto[]> {
    return this.movementService.findByProduct(productId);
  }

  @Get('branch/:branchId')
  @Public()
  findByBranch(@Param('branchId', ParseUUIDPipe) branchId: string): Promise<InventoryMovementResponseDto[]> {
    return this.movementService.findByBranch(branchId);
  }

  @Get('type/:type')
  @Public()
  findByType(@Param('type') type: MovementType): Promise<InventoryMovementResponseDto[]> {
    return this.movementService.findByType(type);
  }

  @Get('stats')
  @Public()
  getStats(@Query('branchId') branchId?: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    byType: Record<MovementType, number>;
  }> {
    return this.movementService.getMovementStats(branchId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryMovementResponseDto> {
    return this.movementService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryMovementDto,
  ): Promise<InventoryMovementResponseDto> {
    return this.movementService.update(id, dto);
  }

  @Post(':id/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  completeMovement(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryMovementResponseDto> {
    return this.movementService.completeMovement(id);
  }

  @Post(':id/cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  cancelMovement(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryMovementResponseDto> {
    return this.movementService.cancelMovement(id);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.movementService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryMovementResponseDto> {
    return this.movementService.restore(id);
  }
}
