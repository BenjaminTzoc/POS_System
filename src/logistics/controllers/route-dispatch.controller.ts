import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RouteDispatchService } from '../services/route-dispatch.service';
import { CreateRouteDispatchDto, ReceiveRouteDispatchDto, LiquidateRouteDispatchDto } from '../dto/route-dispatch.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/decorators';

@Controller('route-dispatches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RouteDispatchController {
  constructor(private readonly dispatchService: RouteDispatchService) {}

  @Post()
  @Permissions('logistics.manage')
  async create(@Body() dto: CreateRouteDispatchDto, @Req() req) {
    const userId = req.user?.id;
    return this.dispatchService.create(dto, userId);
  }

  @Patch(':id/receive')
  @Permissions('logistics.manage')
  async receive(@Param('id') id: string, @Body() dto: ReceiveRouteDispatchDto) {
    return this.dispatchService.receive(id, dto);
  }

  @Get(':id/reconcile')
  @Permissions('logistics.manage')
  async reconcile(@Param('id') id: string) {
    return this.dispatchService.reconcile(id);
  }

  @Patch(':id/liquidate')
  @Permissions('logistics.manage')
  async liquidate(@Param('id') id: string, @Body() dto: LiquidateRouteDispatchDto) {
    return this.dispatchService.liquidate(id, dto);
  }

  @Get()
  @Permissions('logistics.manage')
  async findAll() {
    return this.dispatchService.findAll();
  }

  @Get(':id')
  @Permissions('logistics.manage')
  async findOne(@Param('id') id: string) {
    return this.dispatchService.findOne(id);
  }
}
