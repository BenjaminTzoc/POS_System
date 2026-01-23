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
} from '@nestjs/common';
import { CategoryService } from '../services';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '../dto';
import { Permissions, Public } from 'src/auth/decorators';
import { isSuperAdmin } from 'src/utils/user-scope.util';
import { User } from 'src/common/decorators/user.decorator';

@Controller('products/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Permissions('categories.manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoryService.create(dto);
  }

  @Get()
  findAll(
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<CategoryResponseDto[]> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.categoryService.findAll(showDeleted);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted: string,
    @User() user: any,
  ): Promise<CategoryResponseDto> {
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    return this.categoryService.findOne(id, showDeleted);
  }

  @Put(':id')
  @Permissions('categories.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('categories.manage')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.categoryService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('categories.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.restore(id);
  }
}
