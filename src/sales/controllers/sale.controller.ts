import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { SaleService } from '../services';
import { CreateSaleDto, SaleFilterDto, SaleResponseDto, UpdateSaleDto } from '../dto';
import { UpdateDetailStatusDto } from '../dto/update-detail-status.dto';
import { SaleStatus } from '../entities';
import { Permissions, Public } from 'src/auth/decorators';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';

@Controller('sales')
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  @Get('next-number')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getNextInvoiceNumber(): Promise<{ nextNumber: string }> {
    const nextNumber = await this.saleService.generateNextInvoiceNumber();
    return nextNumber;
  }

  @Post()
  @Permissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSaleDto, @Req() req): Promise<SaleResponseDto> {
    const user = req.user;

    if (isSuperAdmin(user)) {
      return this.saleService.create(dto);
    }

    if (!user.branch) {
      throw new BadRequestException('El usuario no tiene una sucursal asignada.');
    }

    dto.branchId = user.branch.id;
    return this.saleService.create(dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmSale(@Param('id', ParseUUIDPipe) id: string, @Req() req): Promise<SaleResponseDto> {
    const userId = req.user?.id;
    return this.saleService.confirmSale(id, undefined, userId);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  deliverSale(@Param('id', ParseUUIDPipe) id: string): Promise<SaleResponseDto> {
    return this.saleService.deliverSale(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelSale(@Param('id', ParseUUIDPipe) id: string, @Req() req): Promise<SaleResponseDto> {
    const userId = req.user?.id;
    return this.saleService.cancelSale(id, userId);
  }

  @Get('table')
  @Permissions('orders.view')
  async getTableData(@Query() filterDto: SaleFilterDto) {
    if (filterDto.groupBy === 'status') {
      const { groupBy, ...rest } = filterDto;
      return this.saleService.findAll(rest);
    }
    return this.saleService.findAll(filterDto);
  }

  @Get('kanban')
  @Permissions('orders.view')
  async getKanbanData(@Query() filterDto: SaleFilterDto) {
    return this.saleService.findAll({
      ...filterDto,
      groupBy: filterDto.groupBy || 'status',
    });
  }

  @Get()
  @Permissions('orders.view')
  findAll(@Query() filterDto: SaleFilterDto): Promise<any> {
    return this.saleService.findAll(filterDto);
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId', ParseUUIDPipe) customerId: string): Promise<SaleResponseDto[]> {
    return this.saleService.findByCustomer(customerId);
  }

  @Get('status/:status')
  findByStatus(@Param('status') status: SaleStatus): Promise<SaleResponseDto[]> {
    return this.saleService.findByStatus(status);
  }

  @Get('kanban/preparation')
  @Permissions('orders.view')
  @HttpCode(HttpStatus.OK)
  getPreparationWorklist(@Query('areaId', ParseUUIDPipe) areaId: string, @Query('branchId') branchId?: string) {
    return this.saleService.findAll({
      areaId,
      branchId,
      status: SaleStatus.CONFIRMED,
      groupBy: 'preparationStatus',
    });
  }

  @Get('daily/:date')
  getDailySales(@Param('date') date: string): Promise<SaleResponseDto[]> {
    return this.saleService.getDailySales(date);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SaleResponseDto> {
    return this.saleService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSaleDto): Promise<SaleResponseDto> {
    return this.saleService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.saleService.remove(id);
  }

  @Patch('details/:detailId/status')
  @Permissions('orders.update')
  @HttpCode(HttpStatus.OK)
  advanceDetailStatus(@Param('detailId', ParseUUIDPipe) detailId: string, @Body() dto: UpdateDetailStatusDto) {
    return this.saleService.advanceDetailStatus(detailId, dto.status);
  }

  @Post(':id/send-email')
  @HttpCode(HttpStatus.OK)
  sendEmail(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.saleService.sendSaleEmail(id);
  }
}
