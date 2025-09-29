import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { CustomerCategoryService } from '../services';
import { CreateCustomerCategoryDto, CustomerCategoryResponseDto, UpdateCustomerCategoryDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('customer-categories')
export class CustomerCategoryController {
  constructor(
    private readonly customerCategoryService: CustomerCategoryService
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCustomerCategoryDto): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<CustomerCategoryResponseDto[]> {
    return this.customerCategoryService.findAll();
  }

  @Get('name/:name')
  @Public()
  findByName(@Param('name') name: string): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.findByName(name);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerCategoryDto,
  ): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.customerCategoryService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.restore(id);
  }
}
