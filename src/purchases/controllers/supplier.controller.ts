import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { SupplierService } from '../services';
import { CreateSupplierDto, SupplierResponseDto, UpdateSupplierDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('suppliers')
export class SupplierController {
  constructor(
    private readonly supplierService: SupplierService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSupplierDto): Promise<SupplierResponseDto> {
    return this.supplierService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<SupplierResponseDto[]> {
    return this.supplierService.findAll();
  }

  @Get('search')
  @Public()
  search(@Query('q') query: string): Promise<SupplierResponseDto[]> {
    return this.supplierService.searchSuppliers(query);
  }

  @Get('stats')
  @Public()
  getStats(): Promise<{ total: number; active: number; deleted: number }> {
    return this.supplierService.getSuppliersStats();
  }

  @Get('nit/:nit')
  @Public()
  findByNit(@Param('nit') nit: string): Promise<SupplierResponseDto> {
    return this.supplierService.findByNit(nit);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponseDto> {
    return this.supplierService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.supplierService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponseDto> {
    return this.supplierService.restore(id);
  }
}
