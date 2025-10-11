import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ProductService } from '../services';
import { CreateProductDto, ProductResponseDto, UpdateProductDto } from '../dto';
import { Public } from 'src/auth/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  create(
    @Body() dto: CreateProductDto, 
    @UploadedFile() image?: any,
  ): Promise<ProductResponseDto> {
    return this.productService.create(dto, image);
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
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Solo se permiten archivos de imagen'), false);
      }
    },
  }))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile() image?: any,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, dto, image);
  }

  // NUEVO ENDPOINT para actualizar solo la imagen
  @Put(':id/image')
  @Public()
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Solo se permiten archivos de imagen'), false);
      }
    },
  }))
  @HttpCode(HttpStatus.OK)
  updateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() image: any,
  ): Promise<ProductResponseDto> {
    if (!image) {
      throw new BadRequestException('Debe proporcionar una imagen');
    }
    return this.productService.updateImage(id, image);
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
