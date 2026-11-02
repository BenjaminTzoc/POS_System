import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { UnitService } from '../services/unit.service';
import { CreateUnitDto, UnitResponseDto, UpdateUnitDto } from '../dto';
import { Permissions } from 'src/auth/decorators';

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
  findAll(): Promise<UnitResponseDto[]> {
    return this.unitService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UnitResponseDto> {
    return this.unitService.findOne(id);
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
}
