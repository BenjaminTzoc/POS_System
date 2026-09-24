import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { SaleFolderService } from '../services/sale-folder.service';
import { AddSalesToFolderDto, CreateSaleFolderDto, ReorderFolderSalesDto, UpdateSaleFolderDto } from '../dto/sale-folder.dto';
import { Permissions } from 'src/auth/decorators';

@Controller('sale-folders')
export class SaleFolderController {
  constructor(private readonly saleFolderService: SaleFolderService) {}

  @Get()
  @Permissions('orders.view')
  findAll(@Req() req, @Query('branchId') branchId?: string) {
    return this.saleFolderService.findAll(req.user, branchId);
  }

  @Get(':id')
  @Permissions('orders.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return this.saleFolderService.findOne(id, req.user);
  }

  @Post()
  @Permissions('orders.update')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSaleFolderDto, @Req() req) {
    return this.saleFolderService.create(dto, req.user);
  }

  @Put(':id')
  @Permissions('orders.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSaleFolderDto, @Req() req) {
    return this.saleFolderService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('orders.update')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return this.saleFolderService.remove(id, req.user);
  }

  @Post(':id/sales')
  @Permissions('orders.update')
  addSales(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSalesToFolderDto, @Req() req) {
    return this.saleFolderService.addSales(id, dto, req.user);
  }

  @Delete(':id/sales/:saleId')
  @Permissions('orders.update')
  @HttpCode(HttpStatus.OK)
  removeSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Req() req,
  ) {
    return this.saleFolderService.removeSale(id, saleId, req.user);
  }

  @Put(':id/sales/reorder')
  @Permissions('orders.update')
  reorder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderFolderSalesDto, @Req() req) {
    return this.saleFolderService.reorder(id, dto, req.user);
  }
}
