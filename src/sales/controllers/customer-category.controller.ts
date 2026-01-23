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
import { CustomerCategoryService } from '../services';
import {
  CreateCustomerCategoryDto,
  CustomerCategoryResponseDto,
  UpdateCustomerCategoryDto,
} from '../dto';
import { Permissions, Public } from 'src/auth/decorators';
import { isSuperAdmin } from 'src/utils/user-scope.util';
import { User } from 'src/common/decorators/user.decorator';

@Controller('customer-categories')
export class CustomerCategoryController {
  constructor(
    private readonly customerCategoryService: CustomerCategoryService,
  ) {}

  @Post()
  @Permissions('customer-categories.manage')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateCustomerCategoryDto,
  ): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.create(dto);
  }

  @Get()
  findAll(
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<CustomerCategoryResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.customerCategoryService.findAll(showDeleted);
  }

  @Get('name/:name')
  findByName(
    @Param('name') name: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<CustomerCategoryResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.customerCategoryService.findByName(name, showDeleted);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<CustomerCategoryResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.customerCategoryService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Permissions('customer-categories.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerCategoryDto,
  ): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('customer-categories.manage')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.customerCategoryService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('customer-categories.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerCategoryResponseDto> {
    return this.customerCategoryService.restore(id);
  }
}
