import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { SaleService } from '../services';
import { CreateSaleDto, SaleResponseDto, UpdateSaleDto } from '../dto';
import { SaleStatus } from '../entities';
import { Permissions, Public } from 'src/auth/decorators';

import { isSuperAdmin } from 'src/utils/user-scope.util';

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
      throw new BadRequestException(
        'El usuario no tiene una sucursal asignada.',
      );
    }

    console.log('USUARIO --->>>', user);
    dto.branchId = user.branch.id;
    return this.saleService.create(dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
  ): Promise<SaleResponseDto> {
    const userId = req.user?.id;
    return this.saleService.confirmSale(id, undefined, userId);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  deliverSale(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleResponseDto> {
    return this.saleService.deliverSale(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
  ): Promise<SaleResponseDto> {
    const userId = req.user?.id;
    return this.saleService.cancelSale(id, userId);
  }

  @Get()
  @Permissions('orders.view')
  findAll(@Req() req): Promise<SaleResponseDto[]> {
    const user = req.user;
    const branchId = isSuperAdmin(user) ? undefined : user.branch?.id;

    return this.saleService.findAll(branchId);
  }

  @Get('customer/:customerId')
  findByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<SaleResponseDto[]> {
    return this.saleService.findByCustomer(customerId);
  }

  @Get('status/:status')
  findByStatus(
    @Param('status') status: SaleStatus,
  ): Promise<SaleResponseDto[]> {
    return this.saleService.findByStatus(status);
  }

  @Get('daily/:date')
  getDailySales(@Param('date') date: string): Promise<SaleResponseDto[]> {
    return this.saleService.getDailySales(date);
  }

  // @Get('stats')
  // getStats(): Promise<{
  //   total: number;
  //   pending: number;
  //   confirmed: number;
  //   cancelled: number;
  //   totalAmount: number;
  //   averageSale: number;
  //   byType: Record<SaleType, number>;
  // }> {
  //   return this.saleService.getSaleStats();
  // }

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

  @Post(':id/send-email')
  @HttpCode(HttpStatus.OK)
  sendEmail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.saleService.sendSaleEmail(id);
  }
}
