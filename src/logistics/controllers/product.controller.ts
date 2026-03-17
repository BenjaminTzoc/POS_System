import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors, UseGuards, ForbiddenException } from '@nestjs/common';
import { ProductService } from '../services';
import { CreateProductDto, ProductResponseDto, UpdateProductDto, BranchProductResponseDto } from '../dto';
import { Permissions, Public } from 'src/auth/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';

@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('dispatch-catalog')
  @Permissions('products.manage')
  async getDispatchableCatalog(
    @Req() req,
    @Query('branchId') branchIdParam?: string,
    @Query('excludeTypes') excludeTypes?: string,
  ): Promise<ProductResponseDto[]> {
    const user = req.user;
    const branchId = isSuperAdmin(user) ? branchIdParam : user.branch?.id;
    const excludeTypesArray = excludeTypes ? excludeTypes.split(',') : undefined;

    return this.productService.getDispatchableCatalog(branchId, excludeTypesArray);
  }

  @Get('suggest-sku')
  @Permissions('products.manage')
  async suggestSku(
    @Query('name') name?: string,
    @Query('categoryId') categoryId?: string,
    @Query('type') type?: string,
  ) {
    if (!name && !categoryId && !type) {
      throw new BadRequestException('Debe proporcionar al menos el nombre del producto para sugerir un SKU');
    }
    return this.productService.suggestSku(name, categoryId, type as any);
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  async create(@Body() dto: CreateProductDto, @UploadedFile() image?: Express.Multer.File) {
    const product = await this.productService.createWithInventory(dto, image);
    return { id: product.id };
  }

  @Get()
  @Permissions('products.manage')
  async findAll(
    @Req() req,
    @Query('branchId') branchIdParam?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('type') type?: string,
    @Query('hasRecipe') hasRecipe?: string,
    @Query('isMaster') isMaster?: string,
    @Query('excludeTypes') excludeTypes?: string,
    @Query('manageStock') manageStock?: string,
  ): Promise<ProductResponseDto[]> {
    const user = req.user;
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);
    const branchId = isSuperAdmin(user) ? branchIdParam : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    const hasRecipeBool = hasRecipe === 'true' ? true : hasRecipe === 'false' ? false : undefined;
    const isMasterBool = isMaster === 'true' ? true : isMaster === 'false' ? false : undefined;
    const manageStockBool = manageStock === 'true' ? true : manageStock === 'false' ? false : undefined;
    const excludeTypesArray = excludeTypes ? excludeTypes.split(',') : undefined;

    return this.productService.findAll(branchId, showDeleted, type, hasRecipeBool, isMasterBool, excludeTypesArray, manageStockBool);
  }

  @Get('search')
  async search(
    @Query('q') query: string, 
    @Query('branchId') branchIdParam: string, 
    @Query('includeDeleted') includeDeleted: string, 
    @Query('type') type: string,
    @Query('isMaster') isMaster: string,
    @Query('manageStock') manageStock: string,
    @Query('excludeTypes') excludeTypes: string,
    @Req() req
  ): Promise<ProductResponseDto[]> {
    const user = req.user;
    const showDeleted = includeDeleted === 'true' && isSuperAdmin(user);

    const branchId = isSuperAdmin(user) ? branchIdParam : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    const isMasterBool = isMaster === 'true' ? true : isMaster === 'false' ? false : undefined;
    const manageStockBool = manageStock === 'true' ? true : manageStock === 'false' ? false : undefined;
    const excludeTypesArray = excludeTypes ? excludeTypes.split(',') : undefined;

    return this.productService.searchProducts(query, branchId, showDeleted, type, isMasterBool, manageStockBool, excludeTypesArray);
  }

  @Get('top-selling')
  async getTopSelling(@Query('branchId') branchIdParam: string, @Req() req): Promise<ProductResponseDto[]> {
    const user = req.user;
    const branchId = isSuperAdmin(user) ? branchIdParam : user.branch?.id;

    if (!isSuperAdmin(user) && !branchId) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }

    return this.productService.getTopSelling(branchId);
  }

  @Get('branch/:branchId/catalog')
  @Permissions('products.manage')
  async getBranchCatalog(@Param('branchId', ParseUUIDPipe) branchId: string): Promise<BranchProductResponseDto[]> {
    return this.productService.getBranchCatalog(branchId);
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
  @Permissions('products.manage')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query('includeDeleted') includeDeleted: string, @Req() req): Promise<ProductResponseDto> {
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
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @UploadedFile() image?: Express.Multer.File): Promise<ProductResponseDto> {
    console.log('DTOoooooooooooo --->', dto);
    return this.productService.update(id, dto, image);
  }

  @Put(':id/image')
  @Public()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Solo se permiten archivos de imagen'), false);
        }
      },
    }),
  )
  @HttpCode(HttpStatus.OK)
  updateImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() image: any): Promise<ProductResponseDto> {
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
