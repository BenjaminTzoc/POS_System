import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryTransferService } from '../services/inventory-transfer.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User as UserDecorator } from 'src/common/decorators/user.decorator';
import {
  CreateInventoryTransferDto,
  InventoryTransferResponseDto,
  UpdateTransferStatusDto,
} from '../dto';

@Controller('inventory-transfers')
@UseGuards(JwtAuthGuard)
export class InventoryTransferController {
  constructor(private readonly transferService: InventoryTransferService) {}

  @Post()
  create(
    @Body() dto: CreateInventoryTransferDto,
    @UserDecorator() user: any,
  ): Promise<InventoryTransferResponseDto> {
    return this.transferService.create(dto, user.id);
  }

  @Get()
  findAll(
    @Query('originBranchId') originBranchId?: string,
    @Query('destinationBranchId') destinationBranchId?: string,
    @Query('status') status?: any,
  ): Promise<InventoryTransferResponseDto[]> {
    return this.transferService.findAll({
      originBranchId,
      destinationBranchId,
      status,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InventoryTransferResponseDto> {
    return this.transferService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferStatusDto,
    @UserDecorator() user: any,
  ): Promise<InventoryTransferResponseDto> {
    return this.transferService.updateStatus(id, dto, user.id);
  }
}
