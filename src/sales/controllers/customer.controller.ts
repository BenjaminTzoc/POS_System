import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { CustomerProductPriceService } from '../services/customer-product-price.service';
import { CreateCustomerDto, CustomerResponseDto, UpdateCustomerDto } from '../dto';
import {
  AppliedProductPriceDto,
  CustomerProductPriceResponseDto,
  UpdateCustomerProductPriceDto,
  UpsertCustomerProductPriceDto,
} from '../dto/customer-product-price.dto';
import { Permissions, Public } from 'src/auth/decorators';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly productPriceService: CustomerProductPriceService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.customerService.create(dto);
  }

  @Get()
  @Permissions('customers.view')
  findAll(@Req() req, @Query('includeDeleted') includeDeleted: string): Promise<CustomerResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findAll(showDeleted);
  }

  @Get('search')
  @Permissions('customers.view')
  search(@Req() req, @Query('q') query: string, @Query('includeDeleted') includeDeleted: string): Promise<CustomerResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.searchCustomers(query, showDeleted);
  }

  @Get('top')
  @Public()
  getTopCustomers(@Query('limit') limit: number = 10): Promise<CustomerResponseDto[]> {
    return this.customerService.getTopCustomers(limit);
  }

  @Get('stats')
  @Public()
  getStats(): Promise<{
    total: number;
    withCategory: number;
    withoutCategory: number;
    deleted: number;
    totalLoyaltyPoints: number;
  }> {
    return this.customerService.getCustomerStats();
  }

  @Get('category/:categoryId')
  @Permissions('customers.view')
  findByCategory(@Req() req, @Param('categoryId', ParseUUIDPipe) categoryId: string, @Query('includeDeleted') includeDeleted: string): Promise<CustomerResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findByCategory(categoryId, showDeleted);
  }

  @Get('nit/:nit')
  @Permissions('customers.view')
  findByNit(@Req() req, @Param('nit') nit: string, @Query('includeDeleted') includeDeleted: string): Promise<CustomerResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findByNit(nit, showDeleted);
  }

  @Get(':id/product-prices')
  @Permissions('customers.view')
  listProductPrices(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerProductPriceResponseDto[]> {
    return this.productPriceService.listByCustomer(id);
  }

  @Get(':id/applied-price/:productId')
  @Permissions('customers.view')
  getAppliedPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<AppliedProductPriceDto> {
    return this.productPriceService.getApplied(id, productId);
  }

  @Put(':id/product-prices/:productId')
  @Permissions('customers.manage')
  upsertProductPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCustomerProductPriceDto,
  ): Promise<CustomerProductPriceResponseDto> {
    if (dto.price === undefined) {
      return this.productPriceService.update(id, productId, dto);
    }
    return this.productPriceService.upsert(id, { ...dto, productId, price: dto.price });
  }

  @Put(':id/product-prices')
  @Permissions('customers.manage')
  upsertProductPriceBody(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCustomerProductPriceDto,
  ): Promise<CustomerProductPriceResponseDto> {
    return this.productPriceService.upsert(id, dto);
  }

  @Delete(':id/product-prices/:productId')
  @Permissions('customers.manage')
  @HttpCode(HttpStatus.OK)
  removeProductPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ message: string }> {
    return this.productPriceService.remove(id, productId);
  }

  @Get(':id')
  @Permissions('customers.view')
  findOne(@Req() req, @Param('id', ParseUUIDPipe) id: string, @Query('includeDeleted') includeDeleted: string): Promise<CustomerResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Public()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    return this.customerService.update(id, dto);
  }

  @Post(':id/add-points/:points')
  @Public()
  @HttpCode(HttpStatus.OK)
  addLoyaltyPoints(@Param('id', ParseUUIDPipe) id: string, @Param('points') points: number): Promise<CustomerResponseDto> {
    return this.customerService.addLoyaltyPoints(id, points);
  }

  @Post(':id/redeem-points/:points')
  @Public()
  @HttpCode(HttpStatus.OK)
  redeemLoyaltyPoints(@Param('id', ParseUUIDPipe) id: string, @Param('points') points: number): Promise<CustomerResponseDto> {
    return this.customerService.redeemLoyaltyPoints(id, points);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.customerService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('customers.manage')
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.restore(id);
  }
}
