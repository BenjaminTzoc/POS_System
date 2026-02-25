import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { UnitService } from '../services/unit.service';
import { CreateUnitDto, UnitResponseDto, UpdateUnitDto } from '../dto';
import { Permissions } from 'src/auth/decorators';
import { User } from 'src/common/decorators/user.decorator';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitService: UnitService) {}

  @Post()
  @Permissions('units.manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUnitDto): Promise<UnitResponseDto> {
    return this.unitService.create(dto);
  }

  @Get()
  findAll(@Query('includeDeleted') includeDeleted: string, @User() user: any): Promise<UnitResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.unitService.findAll(showDeleted);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query('includeDeleted') includeDeleted: string, @User() user: any): Promise<UnitResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.unitService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Permissions('units.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto): Promise<UnitResponseDto> {
    return this.unitService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('units.manage')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.unitService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('units.manage')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<UnitResponseDto> {
    return this.unitService.restore(id);
  }
}
