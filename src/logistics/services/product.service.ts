import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch, Inventory, Product } from '../entities';
import { SaleStatus } from 'src/sales/entities';
import { IsNull, Repository } from 'typeorm';
import { CategoryService } from './category.service';
import { UnitService } from './unit.service';
import { CreateProductDto, ProductResponseDto, UpdateProductDto } from '../dto';
import { plainToInstance } from 'class-transformer';
import { FilesService } from './files.service';
import { StockAvailability } from '../entities/product.entity';
import { InventoryService } from './inventory.service';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,

    private readonly categoryService: CategoryService,
    private readonly unitService: UnitService,
    private readonly fileService: FilesService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
  ) {}

  async createWithInventory(
    dto: CreateProductDto,
    image?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    // Verificar si el SKU ya existe (incluso en eliminados)
    const existingSku = await this.productRepository.findOne({
      where: { sku: dto.sku },
      withDeleted: true,
    });

    if (existingSku) {
      if (existingSku.deletedAt) {
        throw new ConflictException(
          `El SKU '${dto.sku}' pertenece a un producto eliminado (ID: ${existingSku.id}). Restaure el producto o use otro SKU.`,
        );
      }
      throw new ConflictException(`El SKU '${dto.sku}' ya está en uso`);
    }

    // Verificar si el código de barras ya existe (si se proporciona)
    if (dto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode },
        withDeleted: false,
      });

      if (existingBarcode)
        throw new ConflictException(
          `El código de barras '${dto.barcode}' ya está en uso`,
        );
    }

    let imageUrl: string | undefined;
    if (image) {
      imageUrl = await this.fileService.saveProductImage(image);
    }

    // Validar y obtener la categoría y unidad si se proporcionan
    let category: any = null;
    let unit: any = null;
    if (dto.categoryId) {
      category = await this.categoryService
        .findOne(dto.categoryId)
        .catch(() => {
          throw new BadRequestException(
            `La categoría con ID ${dto.categoryId} no existe`,
          );
        });
    }
    if (dto.unitId) {
      unit = await this.unitService.findOne(dto.unitId).catch(() => {
        throw new BadRequestException(
          `La unidad con ID ${dto.unitId} no existe`,
        );
      });
    }

    const product = this.productRepository.create({
      name: dto.name,
      description: dto.description,
      sku: dto.sku,
      barcode: dto.barcode,
      cost: dto.cost,
      price: dto.price,
      imageUrl: imageUrl,
      category: category,
      unit: unit,
      manageStock: (dto.manageStock ?? true) as boolean,
      stockAvailability: dto.stockAvailability ?? StockAvailability.IN_STOCK,
      isActive: (dto.isActive ?? true) as boolean,
      isVisible: (dto.isVisible ?? true) as boolean,
    });

    const savedProduct = await this.productRepository.save(product);

    if (dto.manageStock && dto.initialStocks?.length) {
      for (const stockItem of dto.initialStocks) {
        const branch = await this.branchRepository.findOne({
          where: { id: stockItem.branchId },
          withDeleted: false,
        });
        if (!branch)
          throw new NotFoundException(
            `Sucursal con ID ${stockItem.branchId} no encontrada`,
          );

        const inventory = this.inventoryRepository.create({
          product: savedProduct,
          branch,
          stock: stockItem.quantity,
          minStock: 0,
          maxStock: null,
        });

        await this.inventoryRepository.save(inventory);
      }
    }

    return plainToInstance(ProductResponseDto, savedProduct, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(branchId?: string): Promise<ProductResponseDto[]> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .leftJoinAndSelect('product.inventories', 'inventories')
      .leftJoinAndSelect('inventories.branch', 'branch')
      .where('product.deletedAt IS NULL');

    if (branchId !== undefined) {
      query.andWhere('branch.id = :branchId', { branchId });
    }

    query.orderBy('product.name', 'ASC');

    const products = await query.getMany();

    return products.map((p) =>
      plainToInstance(
        ProductResponseDto,
        {
          ...p,
          inventories: p.inventories?.map((inv) => ({
            id: inv.id,
            branchId: inv.branch.id,
            branchName: inv.branch.name,
            stock: inv.stock,
          })),
        },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async findOne(id: string, branchId?: string): Promise<ProductResponseDto> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .leftJoinAndSelect('product.inventories', 'inventories')
      .leftJoinAndSelect('inventories.branch', 'branch')
      .where('product.id = :productId', { productId: id })
      .andWhere('product.deletedAt IS NULL');

    if (branchId !== undefined) {
      query.andWhere('branch.id = :branchId', { branchId });
    }

    const product = await query.getOne();

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    const stock =
      product.inventories?.reduce((sum, inv) => sum + Number(inv.stock), 0) ||
      0;

    return plainToInstance(
      ProductResponseDto,
      {
        ...product,
        stock,
        inventories: product.inventories?.map((inv) => ({
          id: inv.id,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
          product: inv.product,
          branch: inv.branch,
          stock: inv.stock,
          minStock: inv.minStock,
          maxStock: inv.maxStock,
          lastMovementDate: inv.lastMovementDate,
        })),
      },
      { excludeExtraneousValues: false },
    );
  }

  async findBySku(sku: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { sku, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con SKU ${sku} no encontrado`);
    }

    return plainToInstance(ProductResponseDto, product);
  }

  async findByBarcode(barcode: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { barcode, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(
        `Producto con código de barras ${barcode} no encontrado`,
      );
    }

    return plainToInstance(ProductResponseDto, product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    image?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo SKU ya existe (incluso en eliminados)
    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.productRepository.findOne({
        where: { sku: dto.sku },
        withDeleted: true,
      });

      if (existingSku) {
        if (existingSku.deletedAt) {
          throw new ConflictException(
            `El SKU '${dto.sku}' pertenece a un producto eliminado (ID: ${existingSku.id}).`,
          );
        }
        throw new ConflictException(`El SKU '${dto.sku}' ya está en uso`);
      }
    }

    // Verificar si el nuevo código de barras ya existe
    if (dto.barcode && dto.barcode !== product.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode, deletedAt: IsNull() },
      });

      if (existingBarcode) {
        throw new ConflictException(
          `El código de barras '${dto.barcode}' ya está en uso`,
        );
      }
    }

    // Validar que el precio sea mayor o igual al costo
    if (
      dto.price !== undefined &&
      dto.cost !== undefined &&
      dto.price < dto.cost
    ) {
      throw new BadRequestException(
        'El precio debe ser mayor o igual al costo',
      );
    } else if (dto.price !== undefined && dto.price < product.cost) {
      throw new BadRequestException(
        'El precio debe ser mayor o igual al costo',
      );
    } else if (dto.cost !== undefined && product.price < dto.cost) {
      throw new BadRequestException(
        'El precio debe ser mayor o igual al costo',
      );
    }

    // MANEJO DE IMAGEN
    let imageUrl = product.imageUrl;
    if (image) {
      // Eliminar imagen anterior si existe
      if (product.imageUrl) {
        await this.fileService.deleteProductImage(product.imageUrl);
      }

      // Guardar nueva imagen
      imageUrl = await this.fileService.saveProductImage(image);
    }

    // Manejar categoría
    let category: any = product.category;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        category = null;
      } else {
        try {
          category = await this.categoryService.findOne(dto.categoryId);
        } catch (error) {
          throw new BadRequestException(
            `La categoría con ID ${dto.categoryId} no existe`,
          );
        }
      }
    }

    // Manejar unidad
    let unit: any = product.unit;
    if (dto.unitId !== undefined) {
      if (dto.unitId === null) {
        unit = null;
      } else {
        try {
          unit = await this.unitService.findOne(dto.unitId);
        } catch (error) {
          throw new BadRequestException(
            `La unidad con ID ${dto.unitId} no existe`,
          );
        }
      }
    }

    console.log('DTO --->', dto);

    Object.assign(product, {
      name: dto.name ?? product.name,
      description: dto.description ?? product.description,
      sku: dto.sku ?? product.sku,
      barcode: dto.barcode ?? product.barcode,
      cost: dto.cost ?? product.cost,
      price: dto.price ?? product.price,
      imageUrl: imageUrl,
      category: category,
      unit: unit,
      manageStock: (dto.manageStock ?? product.manageStock) as boolean,
      stockAvailability: dto.stockAvailability ?? product.stockAvailability,
      isActive: (dto.isActive ?? product.isActive) as boolean,
      isVisible: (dto.isVisible ?? product.isVisible) as boolean,
    });

    const updatedProduct = await this.productRepository.save(product);
    return plainToInstance(ProductResponseDto, updatedProduct);
  }

  async remove(id: string): Promise<{ message: string }> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['inventories'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Verificar si el producto tiene inventarios asociados
    if (product.inventories && product.inventories.length > 0) {
      throw new ConflictException(
        'No se puede eliminar el producto porque tiene inventarios asociados',
      );
    }

    await this.productRepository.softRemove(product);
    return { message: 'Producto eliminado exitosamente' };
  }

  async restore(id: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (!product.deletedAt) {
      throw new ConflictException(`El producto con ID ${id} no está eliminado`);
    }

    product.deletedAt = null;
    const restoredProduct = await this.productRepository.save(product);
    return plainToInstance(ProductResponseDto, restoredProduct);
  }

  async searchProducts(
    query: string,
    branchId?: string,
  ): Promise<ProductResponseDto[]> {
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .where('product.deletedAt IS NULL')
      .andWhere(
        '(product.name ILIKE :query OR product.sku ILIKE :query OR product.barcode ILIKE :query OR product.description ILIKE :query)',
        { query: `%${query}%` },
      );

    if (branchId) {
      // Si hay branchId, usamos INNER JOIN para traer SOLO productos que existan en esa sucursal
      queryBuilder
        .innerJoin(
          'inventories',
          'inventory',
          'inventory.product_id = product.id AND inventory.branch_id = :branchId',
          { branchId },
        )
        .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
        .groupBy('product.id')
        .addGroupBy('category.id')
        .addGroupBy('unit.id')
        .addGroupBy('defaultUnit.id');
    } else {
      // Caso global: LEFT JOIN para ver todos los productos, tengan o no inventario
      queryBuilder
        .leftJoin(
          'inventories',
          'inventory',
          'inventory.product_id = product.id',
        )
        .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
        .groupBy('product.id')
        .addGroupBy('category.id')
        .addGroupBy('unit.id')
        .addGroupBy('defaultUnit.id');
    }

    queryBuilder.orderBy('product.name', 'ASC');

    // Usamos getRawAndEntities para obtener tanto la data de la entidad como el campo calculado 'stock'
    const { entities, raw } = await queryBuilder.getRawAndEntities();

    return entities.map((entity, index) => {
      // Mapeamos el stock calculado al DTO
      const rawItem = raw.find((r) => r.product_id === entity.id);
      const stock = rawItem ? Number(rawItem.stock) : 0;
      return plainToInstance(ProductResponseDto, { ...entity, stock });
    });
  }

  async getTopSelling(
    branchId?: string,
    limit: number = 10,
  ): Promise<ProductResponseDto[]> {
    // 1. Obtener los IDs de productos más vendidos desde SaleDetails
    const salesQuery = this.productRepository.manager
      .createQueryBuilder('sale_details', 'sd')
      .select('sd.product_id', 'productId')
      .addSelect('SUM(sd.quantity)', 'totalSold')
      .innerJoin('sales', 's', 's.id = sd.sale_id')
      .where('s.deletedAt IS NULL')
      .andWhere('s.status = :status', { status: SaleStatus.CONFIRMED }) // Solo ventas confirmadas
      .groupBy('sd.product_id')
      .orderBy('SUM(sd.quantity)', 'DESC')
      .limit(limit);

    if (branchId) {
      salesQuery.andWhere('s.branch_id = :branchId', { branchId });
    }

    // Opcional: Filtrar por fecha (ej. últimos 30 días)
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    salesQuery.andWhere('s.date >= :lastMonth', { lastMonth });

    const topSellingRaw = await salesQuery.getRawMany();
    const productIds = topSellingRaw.map((item) => item.productId);

    // 2. Si NO hay ventas, fallback: Obtener productos recientes
    if (!productIds.length) {
      const fallbackQuery = this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unit', 'unit')
        .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
        .where('product.deletedAt IS NULL')
        .orderBy('product.createdAt', 'DESC')
        .limit(limit);

      if (branchId) {
        fallbackQuery
          .innerJoin(
            'inventories',
            'inventory',
            'inventory.product_id = product.id AND inventory.branch_id = :branchId',
            { branchId },
          )
          .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
          .groupBy('product.id')
          .addGroupBy('category.id')
          .addGroupBy('unit.id')
          .addGroupBy('defaultUnit.id');
      } else {
        fallbackQuery
          .leftJoin(
            'inventories',
            'inventory',
            'inventory.product_id = product.id',
          )
          .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
          .groupBy('product.id')
          .addGroupBy('category.id')
          .addGroupBy('unit.id')
          .addGroupBy('defaultUnit.id');
      }

      const { entities, raw } = await fallbackQuery.getRawAndEntities();

      return entities.map((entity) => {
        const rawItem = raw.find((r) => r.product_id === entity.id);
        const stock = rawItem ? Number(rawItem.stock) : 0;
        return plainToInstance(ProductResponseDto, { ...entity, stock });
      });
    }

    // 3. Obtener la data completa de esos productos (reutilizando lógica de queryBuilder)
    const productQuery = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .whereInIds(productIds);

    if (branchId) {
      productQuery
        .innerJoin(
          'inventories',
          'inventory',
          'inventory.product_id = product.id AND inventory.branch_id = :branchId',
          { branchId },
        )
        .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
        .groupBy('product.id')
        .addGroupBy('category.id')
        .addGroupBy('unit.id')
        .addGroupBy('defaultUnit.id');
    } else {
      productQuery
        .leftJoin(
          'inventories',
          'inventory',
          'inventory.product_id = product.id',
        )
        .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
        .groupBy('product.id')
        .addGroupBy('category.id')
        .addGroupBy('unit.id')
        .addGroupBy('defaultUnit.id');
    }

    const { entities, raw } = await productQuery.getRawAndEntities();

    // 4. Ordenar los resultados en el mismo orden que los IDs más vendidos
    // y asignar el stock correcto
    const result = productIds
      .map((id) => {
        const entity = entities.find((e) => e.id === id);
        if (!entity) return null;

        const rawItem = raw.find((r) => r.product_id === id);
        const stock = rawItem ? Number(rawItem.stock) : 0;

        return plainToInstance(ProductResponseDto, { ...entity, stock });
      })
      .filter((item) => item !== null) as ProductResponseDto[];

    return result;
  }

  // NUEVO MÉTODO para actualizar solo la imagen
  async updateImage(id: string, imageFile: any): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Eliminar imagen anterior si existe
    if (product.imageUrl) {
      await this.fileService.deleteProductImage(product.imageUrl);
    }

    // Guardar nueva imagen
    const imageUrl = await this.fileService.saveProductImage(imageFile);

    // Actualizar solo la imagen
    product.imageUrl = imageUrl;
    const updatedProduct = await this.productRepository.save(product);

    return plainToInstance(ProductResponseDto, updatedProduct);
  }
}
