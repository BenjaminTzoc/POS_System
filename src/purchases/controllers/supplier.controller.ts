import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { SupplierService } from '../services';
import {
  CreateSupplierDto,
  SupplierResponseDto,
  UpdateSupplierDto,
} from '../dto';
import { Permissions } from 'src/auth/decorators';
import { User } from 'src/common/decorators/user.decorator';
import { isSuperAdmin } from 'src/utils/user-scope.util';

@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @Permissions('suppliers.manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSupplierDto): Promise<SupplierResponseDto> {
    return this.supplierService.create(dto);
  }

  @Get()
  findAll(
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<SupplierResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.supplierService.findAll(showDeleted);
  }

  @Get('search')
  search(
    @Query('q') query: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<SupplierResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.supplierService.searchSuppliers(query, showDeleted);
  }

  @Get('stats')
  getStats(): Promise<{ total: number; active: number; deleted: number }> {
    return this.supplierService.getSuppliersStats();
  }

  @Get('nit/:nit')
  findByNit(@Param('nit') nit: string): Promise<SupplierResponseDto> {
    return this.supplierService.findByNit(nit);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<SupplierResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.supplierService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Permissions('suppliers.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('suppliers.manage')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.supplierService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('suppliers.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.restore(id);
  }
}
