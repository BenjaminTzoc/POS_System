import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ProductService } from '../services';
import { CreateProductDto, ProductResponseDto, UpdateProductDto } from '../dto';
import { Permissions, Public } from 'src/auth/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { isSuperAdmin } from 'src/utils/user-scope.util';

@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() dto: CreateProductDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const product = await this.productService.createWithInventory(dto, image);
    return { id: product.id };
  }

  @Get()
  @Permissions('products.manage')
  async findAll(
    @Req() req,
    @Query('includeDeleted') includeDeleted: string,
  ): Promise<ProductResponseDto[]> {
    const user = req.user;
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);

    const branchId = isSuperAdmin(user) ? undefined : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    return this.productService.findAll(branchId, showDeleted);
  }

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('branchId') branchIdParam: string,
    @Query('includeDeleted') includeDeleted: string,
    @Req() req,
  ): Promise<ProductResponseDto[]> {
    const user = req.user;
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);

    // Si es SuperAdmin, puede filtrar por la sucursal que quiera (o null para global)
    // Si NO es SuperAdmin, se fuerza su sucursal asignada
    const branchId = isSuperAdmin(user) ? branchIdParam : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    return this.productService.searchProducts(query, branchId, showDeleted);
  }

  @Get('top-selling')
  async getTopSelling(
    @Query('branchId') branchIdParam: string,
    @Req() req,
  ): Promise<ProductResponseDto[]> {
    const user = req.user;
    const branchId = isSuperAdmin(user) ? branchIdParam : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    return this.productService.getTopSelling(branchId);
  }

  @Get('sku/:sku')
  @Public()
  findBySku(@Param('sku') sku: string): Promise<ProductResponseDto> {
    return this.productService.findBySku(sku);
  }

  @Get('barcode/:barcode')
  @Public()
  findByBarcode(
    @Param('barcode') barcode: string,
  ): Promise<ProductResponseDto> {
    return this.productService.findByBarcode(barcode);
  }

  @Get(':id')
  @Permissions('products.manage')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted: string,
    @Req() req,
  ): Promise<ProductResponseDto> {
    const user = req.user;
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);

    const branchId = isSuperAdmin(user) ? undefined : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    return this.productService.findOne(id, branchId, showDeleted);
  }

  @Put(':id')
  @Public()
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    console.log('DTOoooooooooooo --->', dto);
    return this.productService.update(id, dto, image);
  }

  // NUEVO ENDPOINT para actualizar solo la imagen
  @Put(':id/image')
  @Public()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException('Solo se permiten archivos de imagen'),
            false,
          );
        }
      },
    }),
  )
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
