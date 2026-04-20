import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch, Inventory, Product } from '../entities';
import { SaleStatus } from 'src/sales/entities';
import { IsNull, Repository } from 'typeorm';
import { CategoryService } from './category.service';
import { UnitService } from './unit.service';
import { CreateProductDto, ProductResponseDto, UpdateProductDto, BranchProductResponseDto } from '../dto';
import { plainToInstance } from 'class-transformer';
import { FilesService } from './files.service';
import { StockAvailability, ProductType } from '../entities/product.entity';

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
    private readonly fileService: FilesService
  ) {}

  async suggestSku(name?: string, categoryId?: string, type?: ProductType): Promise<{ sku: string }> {
    let prefix = 'PROD';

    if (name && name.trim().length >= 2) {
      // 1. Limpiar el nombre: quitar acentos, caracteres especiales y dejar solo letras
      const cleanName = name
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-zA-Z]/g, '') // Solo letras
        .toUpperCase();

      if (cleanName.length >= 3) {
        prefix = cleanName.substring(0, 3);
      } else {
        prefix = cleanName.padEnd(3, 'X');
      }
    } else if (categoryId) {
      try {
        const category = await this.categoryService.findOne(categoryId);
        if (category && category.name) {
          prefix = category.name.substring(0, 3).toUpperCase();
        }
      } catch (e) {}
    } else if (type) {
      const typePrefixes = {
        [ProductType.RAW_MATERIAL]: 'RAW',
        [ProductType.INSUMO]: 'INS',
        [ProductType.FINISHED_PRODUCT]: 'FIN',
        [ProductType.COMPONENT]: 'COM',
      };
      prefix = typePrefixes[type] || 'PROD';
    }

    let isUnique = false;
    let suggestedSku = '';
    let attempts = 0;

    while (!isUnique && attempts < 15) {
      // Sufijo de 4 caracteres alfanuméricos
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      suggestedSku = `${prefix}-${randomSuffix}`;

      const existing = await this.productRepository.findOne({
        where: { sku: suggestedSku },
        withDeleted: true,
      });

      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    return { sku: suggestedSku };
  }

  async createWithInventory(dto: CreateProductDto, image?: Express.Multer.File): Promise<ProductResponseDto> {
    // Generar SKU si no viene en el DTO (usando el nombre como base)
    if (!dto.sku || dto.sku.trim() === '') {
      const suggestion = await this.suggestSku(dto.name, dto.categoryId || undefined, dto.type);
      dto.sku = suggestion.sku;
    } else {
      const existingSku = await this.productRepository.findOne({
        where: { sku: dto.sku },
        withDeleted: true,
      });

      if (existingSku) {
        if (existingSku.deletedAt) {
          throw new ConflictException(`El SKU '${dto.sku}' pertenece a un producto eliminado (ID: ${existingSku.id}). Restaure el producto o use otro SKU.`);
        }
        throw new ConflictException(`El SKU '${dto.sku}' ya está en uso`);
      }
    }

    if (dto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode },
        withDeleted: false,
      });

      if (existingBarcode) throw new ConflictException(`El código de barras '${dto.barcode}' ya está en uso`);
    }

    let imageUrl: string | undefined;
    if (image) {
      imageUrl = await this.fileService.saveProductImage(image);
    }

    let category: any = null;
    let unit: any = null;
    if (dto.categoryId) {
      category = await this.categoryService.findOne(dto.categoryId).catch(() => {
        throw new BadRequestException(`La categoría con ID ${dto.categoryId} no existe`);
      });
    }
    if (dto.unitId) {
      unit = await this.unitService.findOne(dto.unitId).catch(() => {
        throw new BadRequestException(`La unidad con ID ${dto.unitId} no existe`);
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
      type: (dto.type ?? ProductType.FINISHED_PRODUCT) as ProductType,
      isVariant: (dto.isVariant ?? false) as boolean,
      isMaster: (dto.isMaster ?? false) as boolean,
      parent: dto.parentId ? ({ id: dto.parentId } as any) : null,
    });

    const savedProduct = await this.productRepository.save(product);

    if (dto.manageStock && dto.initialStocks?.length) {
      for (const stockItem of dto.initialStocks) {
        const branch = await this.branchRepository.findOne({
          where: { id: stockItem.branchId },
          withDeleted: false,
        });
        if (!branch) throw new NotFoundException(`Sucursal con ID ${stockItem.branchId} no encontrada`);

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

  async findAll(
    branchId?: string,
    includeDeleted: boolean = false,
    type?: string,
    hasRecipe?: boolean,
    isMaster?: boolean,
    excludeTypes?: string[],
    manageStock?: boolean,
  ): Promise<ProductResponseDto[]> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .leftJoinAndSelect('product.inventories', 'inventories', branchId ? 'inventories.branch_id = :branchId' : '1=1', { branchId })
      .leftJoinAndSelect('inventories.branch', 'branch')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.inventories', 'vInventories', branchId ? 'vInventories.branch_id = :branchId' : '1=1', { branchId })
      .leftJoinAndSelect('vInventories.branch', 'vBranch')
      .leftJoinAndSelect('variants.unit', 'vUnit')
      .where(includeDeleted ? '1=1' : 'product.deletedAt IS NULL');

    if (includeDeleted) {
      query.withDeleted();
    }

    // 1. Manejo de isMaster y parent_id (Desestructuración de variantes)
    if (isMaster === false) {
      // Si isMaster=false, traemos productos normales y variantes (aplanados)
      query.andWhere('product.isMaster = :isMaster', { isMaster: false });
    } else if (isMaster === true) {
      // Solo productos maestros
      query.andWhere('product.isMaster = :isMaster', { isMaster: true });
      query.andWhere('product.parent_id IS NULL');
    } else {
      // Por defecto: solo productos raíz (Regulares + Maestros)
      query.andWhere('product.parent_id IS NULL');
    }

    // 2. Filtro por tipo exacto (Inclusivo)
    if (type) {
      query.andWhere('product.type = :type', { type });
    }

    // 3. Filtro por exclusión de tipos
    if (excludeTypes && excludeTypes.length > 0) {
      const cleanExcludedTypes = excludeTypes.map(t => t.trim().toLowerCase());
      if (cleanExcludedTypes.length > 0) {
        query.andWhere('LOWER(product.type::text) NOT IN (:...excludedTypes)', { excludedTypes: cleanExcludedTypes });
      }
    }

    // 4. Filtro de Recetas
    if (hasRecipe !== undefined) {
      if (hasRecipe) {
        query.andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('1')
            .from('product_recipes', 'recipe')
            .leftJoin('products', 'v', 'v.id = recipe.product_id')
            .where('recipe.product_id = product.id OR v.parent_id = product.id')
            .getQuery();
          return `EXISTS ${subQuery}`;
        });
      } else {
        query.andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('1')
            .from('product_recipes', 'recipe')
            .leftJoin('products', 'v', 'v.id = recipe.product_id')
            .where('recipe.product_id = product.id OR v.parent_id = product.id')
            .getQuery();
          return `NOT EXISTS ${subQuery}`;
        });
      }
    }

    if (manageStock !== undefined) {
      query.andWhere('product.manageStock = :manageStock', { manageStock });
    }

    query.orderBy('product.name', 'ASC');

    const products = await query.getMany();

    return products.map((p) => {
      // Calcular stock total del producto raíz (debe ser 0 si es maestro sin stock directo)
      const rootStock = p.inventories?.reduce((sum, inv) => sum + Number(inv.stock), 0) || 0;

      // Mapear variantes con sus respectivos stocks de la sucursal
      const mappedVariants = p.variants?.map((v) => ({
        ...v,
        stock: v.inventories?.reduce((sum, inv) => sum + Number(inv.stock), 0) || 0,
        inventories: v.inventories?.map((inv) => ({
          id: inv.id,
          branchId: inv.branch?.id,
          branchName: inv.branch?.name,
          stock: inv.stock,
        })),
      })) || [];

      return plainToInstance(
        ProductResponseDto,
        {
          ...p,
          stock: rootStock,
          variants: mappedVariants,
          inventories: p.inventories?.map((inv) => ({
            id: inv.id,
            branchId: inv.branch?.id,
            branchName: inv.branch?.name,
            stock: inv.stock,
          })),
        },
        { excludeExtraneousValues: false },
      );
    });
  }

  async findOne(id: string, branchId?: string, includeDeleted: boolean = false): Promise<ProductResponseDto> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .leftJoinAndSelect('product.inventories', 'inventories')
      .leftJoinAndSelect('inventories.branch', 'branch')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.inventories', 'vInventories')
      .leftJoinAndSelect('vInventories.branch', 'vBranch')
      .leftJoinAndSelect('variants.unit', 'vUnit')
      .where('product.id = :productId', { productId: id })
      .andWhere(includeDeleted ? '1=1' : 'product.deletedAt IS NULL');

    if (includeDeleted) {
      query.withDeleted();
    }

    if (branchId !== undefined) {
      query.andWhere('branch.id = :branchId', { branchId });
    }

    const product = await query.getOne();

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    const mapProductData = (prod: any) => ({
      ...prod,
      stock: prod.inventories?.reduce((sum, inv) => sum + Number(inv.stock), 0) || 0,
      inventories: prod.inventories?.map((inv) => ({
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
    });

    return plainToInstance(
      ProductResponseDto,
      {
        ...mapProductData(product),
        variants: product.variants?.map((v) => mapProductData(v)),
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
      throw new NotFoundException(`Producto con código de barras ${barcode} no encontrado`);
    }

    return plainToInstance(ProductResponseDto, product);
  }

  async update(id: string, dto: UpdateProductDto, image?: Express.Multer.File): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.productRepository.findOne({
        where: { sku: dto.sku },
        withDeleted: true,
      });

      if (existingSku) {
        if (existingSku.deletedAt) {
          throw new ConflictException(`El SKU '${dto.sku}' pertenece a un producto eliminado (ID: ${existingSku.id}).`);
        }
        throw new ConflictException(`El SKU '${dto.sku}' ya está en uso`);
      }
    }

    if (dto.barcode && dto.barcode !== product.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode, deletedAt: IsNull() },
      });

      if (existingBarcode) {
        throw new ConflictException(`El código de barras '${dto.barcode}' ya está en uso`);
      }
    }

    let imageUrl = product.imageUrl;
    // Si viene una nueva imagen física (Archivo)
    if (image) {
      if (product.imageUrl) {
        await this.fileService.deleteProductImage(product.imageUrl);
      }
      imageUrl = await this.fileService.saveProductImage(image);
    } 
    // Si NO viene archivo, pero el campo imageUrl está presente en el DTO
    else if (dto.imageUrl !== undefined) {
      // Si el valor indica que quieren borrarla (null, vacío o string "null")
      if (dto.imageUrl === null || dto.imageUrl === '' || dto.imageUrl === 'null') {
        if (product.imageUrl) {
          await this.fileService.deleteProductImage(product.imageUrl);
        }
        imageUrl = null;
      }
    }
    
    let category: any = product.category;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null || dto.categoryId === 'null') {
        category = null;
      } else {
        try {
          category = await this.categoryService.findOne(dto.categoryId);
        } catch (error) {
          throw new BadRequestException(`La categoría con ID ${dto.categoryId} no existe`);
        }
      }
    }

    let unit: any = product.unit;
    if (dto.unitId !== undefined) {
      if (dto.unitId === null || dto.unitId === 'null') {
        unit = null;
      } else {
        try {
          unit = await this.unitService.findOne(dto.unitId);
        } catch (error) {
          throw new BadRequestException(`La unidad con ID ${dto.unitId} no existe`);
        }
      }
    }

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
      type: (dto.type ?? product.type) as ProductType,
      isVariant: (dto.isVariant ?? product.isVariant) as boolean,
      isMaster: (dto.isMaster ?? product.isMaster) as boolean,
      parent: dto.parentId !== undefined ? (dto.parentId && dto.parentId !== 'null' ? ({ id: dto.parentId } as any) : null) : product.parent,
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

    if (product.inventories && product.inventories.length > 0) {
      throw new ConflictException('No se puede eliminar el producto porque tiene inventarios asociados');
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
    includeDeleted: boolean = false, 
    type?: string,
    isMaster?: boolean,
    manageStock?: boolean,
    excludeTypes?: string[],
  ): Promise<ProductResponseDto[]> {
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .where(includeDeleted ? '1=1' : 'product.deletedAt IS NULL')
      .andWhere('(product.name ILIKE :query OR product.sku ILIKE :query OR product.barcode ILIKE :query OR product.description ILIKE :query)', { query: `%${query}%` });

    if (type) {
      queryBuilder.andWhere('product.type = :type', { type });
    }

    if (isMaster !== undefined) {
      queryBuilder.andWhere('product.isMaster = :isMaster', { isMaster });
    }

    if (manageStock !== undefined) {
      queryBuilder.andWhere('product.manageStock = :manageStock', { manageStock });
    }

    if (excludeTypes && excludeTypes.length > 0) {
      const cleanExcludedTypes = excludeTypes.map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
      if (cleanExcludedTypes.length > 0) {
        queryBuilder.andWhere('LOWER(product.type::text) NOT IN (:...excludedTypes)', { excludedTypes: cleanExcludedTypes });
      }
    }

    if (includeDeleted) {
      queryBuilder.withDeleted();
    }

    if (branchId) {
      queryBuilder
        .leftJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId })
        .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
        .groupBy('product.id')
        .addGroupBy('category.id')
        .addGroupBy('unit.id')
        .addGroupBy('defaultUnit.id');
    } else {
      queryBuilder
        .leftJoin('inventories', 'inventory', 'inventory.product_id = product.id')
        .addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock')
        .groupBy('product.id')
        .addGroupBy('category.id')
        .addGroupBy('unit.id')
        .addGroupBy('defaultUnit.id');
    }

    queryBuilder.orderBy('product.name', 'ASC');

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    return entities.map((entity, index) => {
      const rawItem = raw.find((r) => r.product_id === entity.id);
      const stock = rawItem ? Number(rawItem.stock) : 0;
      return plainToInstance(ProductResponseDto, { ...entity, stock });
    });
  }

  async getTopSelling(branchId?: string, limit: number = 10): Promise<ProductResponseDto[]> {
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

    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    salesQuery.andWhere('s.date >= :lastMonth', { lastMonth });

    const topSellingRaw = await salesQuery.getRawMany();
    const productIds = topSellingRaw.map((item) => item.productId);

    if (!productIds.length) {
      const fallbackQuery = this.productRepository.createQueryBuilder('product').leftJoinAndSelect('product.category', 'category').leftJoinAndSelect('product.unit', 'unit').leftJoinAndSelect('category.defaultUnit', 'defaultUnit').where('product.deletedAt IS NULL').orderBy('product.createdAt', 'DESC').limit(limit);

      if (branchId) {
        fallbackQuery.innerJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId }).addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock').groupBy('product.id').addGroupBy('category.id').addGroupBy('unit.id').addGroupBy('defaultUnit.id');
      } else {
        fallbackQuery.leftJoin('inventories', 'inventory', 'inventory.product_id = product.id').addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock').groupBy('product.id').addGroupBy('category.id').addGroupBy('unit.id').addGroupBy('defaultUnit.id');
      }

      const { entities, raw } = await fallbackQuery.getRawAndEntities();

      return entities.map((entity) => {
        const rawItem = raw.find((r) => r.product_id === entity.id);
        const stock = rawItem ? Number(rawItem.stock) : 0;
        return plainToInstance(ProductResponseDto, { ...entity, stock });
      });
    }

    const productQuery = this.productRepository.createQueryBuilder('product').leftJoinAndSelect('product.category', 'category').leftJoinAndSelect('product.unit', 'unit').leftJoinAndSelect('category.defaultUnit', 'defaultUnit').whereInIds(productIds);

    if (branchId) {
      productQuery.innerJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId }).addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock').groupBy('product.id').addGroupBy('category.id').addGroupBy('unit.id').addGroupBy('defaultUnit.id');
    } else {
      productQuery.leftJoin('inventories', 'inventory', 'inventory.product_id = product.id').addSelect('COALESCE(SUM(inventory.stock), 0)', 'stock').groupBy('product.id').addGroupBy('category.id').addGroupBy('unit.id').addGroupBy('defaultUnit.id');
    }

    const { entities, raw } = await productQuery.getRawAndEntities();

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

  async updateImage(id: string, imageFile: any): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (product.imageUrl) {
      await this.fileService.deleteProductImage(product.imageUrl);
    }

    const imageUrl = await this.fileService.saveProductImage(imageFile);

    product.imageUrl = imageUrl;
    const updatedProduct = await this.productRepository.save(product);

    return plainToInstance(ProductResponseDto, updatedProduct);
  }

  async getBranchCatalog(branchId: string): Promise<BranchProductResponseDto[]> {
    const query = this.productRepository.createQueryBuilder('product').leftJoinAndSelect('product.unit', 'unit').innerJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId }).where('product.deletedAt IS NULL').andWhere('product.isActive = :isActive', { isActive: true }).select(['product.id', 'product.name', 'product.sku', 'product.imageUrl', 'product.price', 'unit.name', 'unit.abbreviation', 'unit.allowsDecimals']).addSelect('inventory.stock', 'stock').orderBy('product.name', 'ASC');

    const rawProducts = await query.getRawMany();

    return rawProducts.map((p) => {
      const dto = new BranchProductResponseDto();
      dto.id = p.product_id;
      dto.name = p.product_name;
      dto.sku = p.product_sku;
      dto.imageUrl = p.product_imageUrl;
      dto.price = Number(p.product_price);
      dto.stock = Number(p.stock);
      dto.unitName = p.unit_name;
      dto.unitAbbreviation = p.unit_abbreviation;
      dto.allowsDecimals = p.unit_allowsDecimals === 1 || p.unit_allowsDecimals === true;
      return dto;
    });
  }

  async getDispatchableCatalog(branchId?: string, excludeTypes?: string[]): Promise<ProductResponseDto[]> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .leftJoinAndSelect('product.inventories', 'inventories', branchId ? 'inventories.branch_id = :branchId' : '1=1', { branchId })
      .leftJoinAndSelect('inventories.branch', 'branch')
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .andWhere('product.manageStock = :manageStock', { manageStock: true })
      .andWhere('product.isMaster = :isMaster', { isMaster: false }); // Desestructurar: No traer maestros

    if (excludeTypes && excludeTypes.length > 0) {
      const cleanExcludedTypes = excludeTypes.map((t) => t.trim().toLowerCase());
      if (cleanExcludedTypes.length > 0) {
        query.andWhere('LOWER(product.type::text) NOT IN (:...excludedTypes)', { excludedTypes: cleanExcludedTypes });
      }
    }

    query.orderBy('product.name', 'ASC');

    const products = await query.getMany();

    return products.map((p) => {
      const stock = p.inventories?.reduce((sum, inv) => sum + Number(inv.stock), 0) || 0;
      return plainToInstance(
        ProductResponseDto,
        {
          ...p,
          stock,
          inventories: p.inventories?.map((inv) => ({
            id: inv.id,
            branchId: inv.branch?.id,
            branchName: inv.branch?.name,
            stock: inv.stock,
          })),
        },
        { excludeExtraneousValues: false },
      );
    }).filter((p) => (p.stock || 0) > 0);
  }
}
