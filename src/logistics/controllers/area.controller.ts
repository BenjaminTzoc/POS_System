import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AreaService } from '../services/area.service';
import { CreateAreaDto, UpdateAreaDto } from '../dto/area.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('logistics/areas')
@UseGuards(JwtAuthGuard)
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Post()
  create(@Body() createAreaDto: CreateAreaDto) {
    return this.areaService.create(createAreaDto);
  }

  @Get()
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    const showDeleted = includeDeleted === 'true';
    return this.areaService.findAll(showDeleted);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query('includeDeleted') includeDeleted?: string) {
    const showDeleted = includeDeleted === 'true';
    return this.areaService.findOne(id, showDeleted);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateAreaDto: UpdateAreaDto) {
    return this.areaService.update(id, updateAreaDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.areaService.remove(id);
  }

  @Patch(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.areaService.restore(id);
  }
}
