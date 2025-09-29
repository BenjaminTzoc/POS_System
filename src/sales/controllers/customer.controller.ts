import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { CreateCustomerDto, CustomerResponseDto, UpdateCustomerDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.customerService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<CustomerResponseDto[]> {
    return this.customerService.findAll();
  }

  @Get('search')
  @Public()
  search(@Query('q') query: string): Promise<CustomerResponseDto[]> {
    return this.customerService.searchCustomers(query);
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
  @Public()
  findByCategory(@Param('categoryId', ParseUUIDPipe) categoryId: string): Promise<CustomerResponseDto[]> {
    return this.customerService.findByCategory(categoryId);
  }

  @Get('nit/:nit')
  @Public()
  findByNit(@Param('nit') nit: string): Promise<CustomerResponseDto> {
    return this.customerService.findByNit(nit);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.findOne(id);
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
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.restore(id);
  }
}
