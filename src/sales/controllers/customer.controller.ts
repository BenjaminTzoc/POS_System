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
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import {
  CreateCustomerDto,
  CustomerResponseDto,
  UpdateCustomerDto,
} from '../dto';
import { Permissions, Public } from 'src/auth/decorators';
import { isSuperAdmin } from 'src/utils/user-scope.util';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.customerService.create(dto);
  }

  @Get()
  @Permissions('customers.view')
  findAll(
    @Req() req,
    @Query('includeDeleted') includeDeleted: string,
  ): Promise<CustomerResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findAll(showDeleted);
  }

  @Get('search')
  @Permissions('customers.view')
  search(
    @Req() req,
    @Query('q') query: string,
    @Query('includeDeleted') includeDeleted: string,
  ): Promise<CustomerResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.searchCustomers(query, showDeleted);
  }

  @Get('top')
  @Public()
  getTopCustomers(
    @Query('limit') limit: number = 10,
  ): Promise<CustomerResponseDto[]> {
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
  findByCategory(
    @Req() req,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query('includeDeleted') includeDeleted: string,
  ): Promise<CustomerResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findByCategory(categoryId, showDeleted);
  }

  @Get('nit/:nit')
  @Permissions('customers.view')
  findByNit(
    @Req() req,
    @Param('nit') nit: string,
    @Query('includeDeleted') includeDeleted: string,
  ): Promise<CustomerResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findByNit(nit, showDeleted);
  }

  @Get(':id')
  @Permissions('customers.view')
  findOne(
    @Req() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted: string,
  ): Promise<CustomerResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(req.user);
    return this.customerService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customerService.update(id, dto);
  }

  @Post(':id/add-points/:points')
  @Public()
  @HttpCode(HttpStatus.OK)
  addLoyaltyPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('points') points: number,
  ): Promise<CustomerResponseDto> {
    return this.customerService.addLoyaltyPoints(id, points);
  }

  @Post(':id/redeem-points/:points')
  @Public()
  @HttpCode(HttpStatus.OK)
  redeemLoyaltyPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('points') points: number,
  ): Promise<CustomerResponseDto> {
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
  restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponseDto> {
    return this.customerService.restore(id);
  }
}
