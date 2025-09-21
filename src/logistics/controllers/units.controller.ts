import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { UnitService } from '../services/unit.service';
import { CreateUnitDto, UnitResponseDto, UpdateUnitDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('units')
export class UnitsController {
  constructor(
    private readonly unitService: UnitService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUnitDto): Promise<UnitResponseDto> {
    return this.unitService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<UnitResponseDto[]> {
    return this.unitService.findAll();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UnitResponseDto> {
    return this.unitService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ): Promise<UnitResponseDto> {
    return this.unitService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.unitService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<UnitResponseDto> {
    return this.unitService.restore(id);
  }
}
