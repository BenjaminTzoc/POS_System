import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ProductService } from '../services';
import { CreateProductDto, ProductResponseDto, UpdateProductDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return this.productService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<ProductResponseDto[]> {
    return this.productService.findAll();
  }

  @Get('search')
  @Public()
  search(@Query('q') query: string): Promise<ProductResponseDto[]> {
    return this.productService.searchProducts(query);
  }

  @Get('sku/:sku')
  @Public()
  findBySku(@Param('sku') sku: string): Promise<ProductResponseDto> {
    return this.productService.findBySku(sku);
  }

  @Get('barcode/:barcode')
  @Public()
  findByBarcode(@Param('barcode') barcode: string): Promise<ProductResponseDto> {
    return this.productService.findByBarcode(barcode);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.productService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productService.restore(id);
  }
}
