import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CreateTruckDto, TruckResponseDto, UpdateTruckDto } from '../dto/truck.dto';
import { TruckService } from '../services/truck.service';
import { TruckStatus } from '../entities/truck.entity';
import { Permissions } from 'src/auth/decorators';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { User } from 'src/common/decorators/user.decorator';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';

@Controller('trucks')
@UseGuards(JwtAuthGuard)
export class TruckController {
  constructor(private readonly truckService: TruckService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTruckDto): Promise<TruckResponseDto> {
    return this.truckService.create(dto);
  }

  @Get()
  findAll(
    @Query('includeDeleted') includeDeleted: string,
    @Query('status') status: TruckStatus,
    @User() user: any,
  ): Promise<TruckResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.truckService.findAll(showDeleted, status);
  }

  @Get('search')
  search(
    @Query('q') query: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<TruckResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.truckService.search(query, showDeleted);
  }

  @Get('stats')
  getStats(): Promise<{ total: number; active: number; maintenance: number; inactive: number }> {
    return this.truckService.getStats();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<TruckResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.truckService.findOne(id, showDeleted);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTruckDto,
  ): Promise<TruckResponseDto> {
    return this.truckService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.truckService.remove(id);
  }

  @Patch(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<TruckResponseDto> {
    return this.truckService.restore(id);
  }
}
