import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TripService } from '../services/trip.service';
import {
  AddTripItemsDto,
  CreateTripDto,
  CreateTripIncidentDto,
  DeliverSaleItemDto,
  ReceiveTripReturnDto,
  ResolveTripIncidentDto,
  TripResponseDto,
} from '../dto/trip.dto';
import { ReceiveTransferDto } from '../dto/inventory-transfer.dto';
import { TripStatus } from '../entities/trip.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Get('pending-operations')
  getPendingOperations(@Query('originBranchId') originBranchId?: string, @User() user?: any) {
    const branchId = isSuperAdmin(user) ? originBranchId : user.branch?.id;
    return this.tripService.getPendingOperations(branchId);
  }

  @Get('mine')
  findMine(
    @Query('status') status?: TripStatus,
    @Query('date') date?: string,
    @User() user?: any,
  ): Promise<TripResponseDto[]> {
    return this.tripService.findMine(user.id, status, date);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTripDto, @User() user: any): Promise<TripResponseDto> {
    return this.tripService.create(dto, user);
  }

  @Get()
  findAll(
    @Query('originBranchId') originBranchId?: string,
    @Query('status') status?: TripStatus,
    @Query('date') date?: string,
    @User() user?: any,
  ): Promise<TripResponseDto[]> {
    const branchId = isSuperAdmin(user) ? originBranchId : user.branch?.id;
    return this.tripService.findAll(branchId, status, date);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @User() user: any): Promise<TripResponseDto> {
    return this.tripService.findOne(id, user);
  }

  @Post(':id/items')
  addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTripItemsDto,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.addItems(id, dto, user);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.removeItem(id, itemId, user);
  }

  @Patch(':id/confirm-departure')
  confirmDeparture(@Param('id', ParseUUIDPipe) id: string, @User() user: any): Promise<TripResponseDto> {
    return this.tripService.confirmDeparture(id, user);
  }

  @Patch(':id/items/:itemId/deliver')
  completeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<TripResponseDto> {
    return this.tripService.completeItem(id, itemId);
  }

  @Post(':id/items/:itemId/deliver-sale')
  deliverSaleItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: DeliverSaleItemDto,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.deliverSaleItem(id, itemId, dto, user);
  }

  @Post(':id/items/:itemId/deliver-transfer')
  deliverTransferItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ReceiveTransferDto,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.deliverTransferItem(id, itemId, dto, user);
  }

  @Post(':id/returns/:returnId/receive')
  receiveReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Body() dto: ReceiveTripReturnDto,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.receiveReturn(id, returnId, dto, user);
  }

  @Post(':id/incidents')
  createIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTripIncidentDto,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.createIncident(id, dto, user);
  }

  @Patch(':id/incidents/:incidentId/resolve')
  resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveTripIncidentDto,
    @User() user: any,
  ): Promise<TripResponseDto> {
    return this.tripService.resolveIncident(id, incidentId, dto, user);
  }

  @Patch(':id/complete')
  completeTrip(@Param('id', ParseUUIDPipe) id: string, @User() user: any): Promise<TripResponseDto> {
    return this.tripService.completeTrip(id, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
    @User() user?: any,
  ): Promise<TripResponseDto> {
    return this.tripService.cancel(id, reason, user);
  }
}
