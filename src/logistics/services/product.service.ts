import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch, Inventory, Product } from '../entities';
import { SaleStatus } from 'src/sales/entities';
import { IsNull, Repository } from 'typeorm';
import { CategoryService } from './category.service';
import { UnitService } from './unit.service';
import { CreateProductDto, ProductResponseDto, UpdateProductDto, BranchProductResponseDto, MinimalProductResponseDto } from '../dto';
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

    if (type) {
      const typePrefixes: Record<string, string> = {
        [ProductType.RAW_MATERIAL]: 'MP',
        [ProductType.COMPONENT]: 'CMP',
        [ProductType.INSUMO]: 'INS',
        [ProductType.FINISHED_PRODUCT]: 'PF',
      };
      if (typePrefixes[type]) prefix = typePrefixes[type];
    } else if (categoryId) {
      try {
        const category = await this.categoryService.findOne(categoryId);
        if (category && category.name) {
          prefix = category.name.substring(0, 3).toUpperCase();
        }
      } catch (e) {
        // Ignorar error si no encuentra categoría
      }
    } else if (name) {
      prefix = name.substring(0, 3).toUpperCase();
    }

    let isUnique = false;
    let sku = '';
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      sku = `${prefix}-${randomSuffix}`;
      const existing = await this.productRepository.findOne({ where: { sku }, withDeleted: true });
      if (!existing) isUnique = true;
      attempts++;
    }

    if (!isUnique) {
      sku = `${prefix}-${Date.now().toString().slice(-4)}`;
    }

    return { sku };
  }

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    if (!dto.sku) {
      const suggestion = await this.suggestSku(dto.name, dto.categoryId ?? undefined, dto.type);
      dto.sku = suggestion.sku;
    }

    const existingSku = await this.productRepository.findOne({
      where: { sku: dto.sku },
      withDeleted: true,
    });

    if (existingSku) {
      if (existingSku.deletedAt) {
        throw new ConflictException(`El producto con SKU '${dto.sku}' ya existe pero está inactivo. Considere reactivarlo o contacte con el administrador.`);
      }
      throw new ConflictException(`El producto con SKU ${dto.sku} ya existe`);
    }

    if (dto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode },
        withDeleted: true,
      });

      if (existingBarcode) {
        if (existingBarcode.deletedAt) {
          throw new ConflictException(`El producto con código de barras '${dto.barcode}' ya pertenece a un producto inactivo. Considere reactivarlo o contacte con el administrador.`);
        }
        throw new ConflictException(`El producto con código de barras ${dto.barcode} ya existe`);
      }
    }

    let category: any = null;
    if (dto.categoryId) {
      try {
        category = await this.categoryService.findOne(dto.categoryId);
      } catch (error) {
        throw new BadRequestException(`La categoría con ID ${dto.categoryId} no existe`);
      }
    }

    let unit: any = null;
    if (dto.unitId) {
      try {
        unit = await this.unitService.findOne(dto.unitId);
      } catch (error) {
        throw new BadRequestException(`La unidad de medida con ID ${dto.unitId} no existe`);
      }
    }

    const product = this.productRepository.create({
      ...dto,
      category: category ? { id: category.id } : null,
      unit: unit ? { id: unit.id } : null,
      parentId: dto.parentId ? dto.parentId : null,
      stockAvailability: dto.stockAvailability || StockAvailability.IN_STOCK,
      manageStock: dto.manageStock !== undefined ? dto.manageStock : true,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      isVisible: dto.isVisible !== undefined ? dto.isVisible : true,
    } as any);

    const savedProduct = await this.productRepository.save(product);
    return this.findOne((savedProduct as any).id);
  }

  async createWithInventory(dto: CreateProductDto, imageFile?: Express.Multer.File): Promise<ProductResponseDto> {
    return await this.productRepository.manager.transaction(async (transactionalEntityManager) => {
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await this.fileService.saveProductImage(imageFile);
      }

      if (!dto.sku) {
        const suggestion = await this.suggestSku(dto.name, dto.categoryId ?? undefined, dto.type);
        dto.sku = suggestion.sku;
      }

      const existingSku = await transactionalEntityManager.findOne(Product, {
        where: { sku: dto.sku },
        withDeleted: true,
      });

      if (existingSku) {
        if (existingSku.deletedAt) {
          throw new ConflictException(`El SKU '${dto.sku}' pertenece a un producto inactivo.`);
        }
        throw new ConflictException(`El SKU '${dto.sku}' ya está registrado.`);
      }

      if (dto.barcode) {
        const existingBarcode = await transactionalEntityManager.findOne(Product, {
          where: { barcode: dto.barcode },
          withDeleted: true,
        });

        if (existingBarcode) {
          if (existingBarcode.deletedAt) {
            throw new ConflictException(`El código de barras '${dto.barcode}' pertenece a un producto inactivo.`);
          }
          throw new ConflictException(`El código de barras '${dto.barcode}' ya está registrado.`);
        }
      }

      const manageStock = dto.manageStock === 'true' || dto.manageStock === true;
      const isActive = dto.isActive === 'true' || dto.isActive === true;
      const isVisible = dto.isVisible === 'true' || dto.isVisible === true;
      const isVariant = dto.isVariant === 'true' || dto.isVariant === true;
      const isMaster = dto.isMaster === 'true' || dto.isMaster === true;

      const product = transactionalEntityManager.create(Product, {
        name: dto.name,
        description: dto.description || '',
        sku: dto.sku,
        barcode: dto.barcode || '',
        cost: Number(dto.cost),
        price: Number(dto.price),
        imageUrl: imageUrl,
        categoryId: dto.categoryId || null,
        unitId: dto.unitId || null,
        parentId: dto.parentId || null,
        manageStock: manageStock,
        stockAvailability: dto.stockAvailability || StockAvailability.IN_STOCK,
        isActive: isActive,
        isVisible: isVisible,
        type: dto.type,
        isVariant: isVariant,
        isMaster: isMaster,
      });

      const savedProduct = await transactionalEntityManager.save(Product, product);

      if (dto.initialStocks && Array.isArray(dto.initialStocks)) {
        for (const stockDto of dto.initialStocks) {
          const qty = Number(stockDto.quantity || 0);
          const isAvail = stockDto.isAvailable !== undefined ? stockDto.isAvailable : true;
          
          if (manageStock) {
            if (qty > 0) {
              const inventory = transactionalEntityManager.create(Inventory, {
                product: { id: savedProduct.id },
                branch: { id: stockDto.branchId },
                stock: qty,
                isAvailable: isAvail,
                lastMovementDate: new Date(),
              });
              await transactionalEntityManager.save(Inventory, inventory);
            }
          } else {
            const inventory = transactionalEntityManager.create(Inventory, {
              product: { id: savedProduct.id },
              branch: { id: stockDto.branchId },
              stock: 0,
              isAvailable: isAvail,
            });
            await transactionalEntityManager.save(Inventory, inventory);
          }
        }
      }

      const reloaded = await transactionalEntityManager.findOne(Product, {
        where: { id: savedProduct.id },
        relations: ['category', 'unit', 'category.defaultUnit'],
      });

      return plainToInstance(
        ProductResponseDto,
        {
          ...reloaded,
          stock: 0,
          inventories: [],
        },
        { excludeExtraneousValues: false },
      );
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
    minimal: boolean = false,
  ): Promise<ProductResponseDto[] | MinimalProductResponseDto[]> {
    if (minimal) {
      const minimalQuery = this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.unit', 'unit')
        .select([
          'product.id',
          'product.name',
          'product.sku',
          'product.imageUrl',
          'product.manageStock',
          'unit.abbreviation',
          'unit.allowsDecimals',
        ])
        .where(includeDeleted ? '1=1' : 'product.deletedAt IS NULL');

      if (includeDeleted) {
        minimalQuery.withDeleted();
      }

      if (isMaster === false) {
        minimalQuery.andWhere('product.isMaster = :isMaster', { isMaster: false });
      } else if (isMaster === true) {
        minimalQuery.andWhere('product.isMaster = :isMaster', { isMaster: true });
        minimalQuery.andWhere('product.parent_id IS NULL');
      } else {
        minimalQuery.andWhere('product.parent_id IS NULL');
      }

      if (type) {
        minimalQuery.andWhere('product.type = :type', { type });
      }

      if (excludeTypes && excludeTypes.length > 0) {
        const cleanExcludedTypes = excludeTypes.map(t => t.trim().toLowerCase());
        if (cleanExcludedTypes.length > 0) {
          minimalQuery.andWhere('LOWER(product.type::text) NOT IN (:...excludedTypes)', { excludedTypes: cleanExcludedTypes });
        }
      }

      if (hasRecipe !== undefined) {
        if (hasRecipe) {
          minimalQuery.andWhere((qb) => {
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
          minimalQuery.andWhere((qb) => {
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
        minimalQuery.andWhere('product.manageStock = :manageStock', { manageStock });
      }

      minimalQuery.orderBy('product.name', 'ASC');

      const products = await minimalQuery.getMany();
      return plainToInstance(MinimalProductResponseDto, products, { excludeExtraneousValues: true });
    }

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
          isAvailable: inv.isAvailable,
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
            isAvailable: inv.isAvailable,
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
    minimal: boolean = false,
  ): Promise<ProductResponseDto[] | MinimalProductResponseDto[]> {
    if (minimal) {
      const minimalQuery = this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.unit', 'unit')
        .select([
          'product.id',
          'product.name',
          'product.sku',
          'product.imageUrl',
          'product.manageStock',
          'unit.abbreviation',
          'unit.allowsDecimals',
        ])
        .where(includeDeleted ? '1=1' : 'product.deletedAt IS NULL')
        .andWhere('(product.name ILIKE :query OR product.sku ILIKE :query OR product.barcode ILIKE :query OR product.description ILIKE :query)', { query: `%${query}%` });

      if (type) {
        minimalQuery.andWhere('product.type = :type', { type });
      }

      if (isMaster !== undefined) {
        minimalQuery.andWhere('product.isMaster = :isMaster', { isMaster });
      }

      if (manageStock !== undefined) {
        minimalQuery.andWhere('product.manageStock = :manageStock', { manageStock });
      }

      if (excludeTypes && excludeTypes.length > 0) {
        const cleanExcludedTypes = excludeTypes.map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
        if (cleanExcludedTypes.length > 0) {
          minimalQuery.andWhere('LOWER(product.type::text) NOT IN (:...excludedTypes)', { excludedTypes: cleanExcludedTypes });
        }
      }

      if (includeDeleted) {
        minimalQuery.withDeleted();
      }

      minimalQuery.orderBy('product.name', 'ASC');

      const products = await minimalQuery.getMany();
      return plainToInstance(MinimalProductResponseDto, products, { excludeExtraneousValues: true });
    }

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

  async getBranchCatalog(branchId: string, isMaster?: boolean, manageStock?: boolean, hasStock?: boolean): Promise<BranchProductResponseDto[]> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('product.inventories', 'inventories', 'inventories.branch_id = :branchId', { branchId })
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.unit', 'vUnit')
      .leftJoinAndSelect('variants.inventories', 'vInventories', 'vInventories.branch_id = :branchId', { branchId })
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true });

    if (isMaster === false) {
      query.andWhere('product.isMaster = :isMaster', { isMaster: false });
    } else if (isMaster === true) {
      query.andWhere('product.isMaster = :isMaster', { isMaster: true });
      query.andWhere('product.parent_id IS NULL');
    } else {
      query.andWhere('product.parent_id IS NULL');
    }

    if (manageStock !== undefined) {
      query.andWhere('product.manageStock = :manageStock', { manageStock });
    }

    query.orderBy('product.name', 'ASC');

    const products = await query.getMany();

    const mapped = products.map((p) => {
      const dto = new BranchProductResponseDto();
      dto.id = p.id;
      dto.name = p.name;
      dto.sku = p.sku;
      dto.imageUrl = p.imageUrl ?? null;
      dto.price = Number(p.price);
      dto.manageStock = p.manageStock;
      const inv = p.inventories?.[0];
      dto.stock = p.inventories?.reduce((sum, i) => sum + Number(i.stock), 0) || 0;
      dto.reservedStock = p.inventories?.reduce((sum, i) => sum + Number(i.reservedStock || 0), 0) || 0;
      dto.availableStock = Math.max(0, dto.stock - dto.reservedStock);
      dto.isAvailable = p.manageStock ? dto.availableStock > 0 : (inv?.isAvailable ?? true);
      dto.unitName = p.unit?.name || null;
      dto.unitAbbreviation = p.unit?.abbreviation || null;
      dto.allowsDecimals = p.unit?.allowsDecimals || false;

      if (p.variants && p.variants.length > 0) {
        let activeVariants = p.variants.filter(v => v.deletedAt === null && v.isActive === true);
        if (hasStock === true) {
          activeVariants = activeVariants.filter(v => {
            const vStock = v.inventories?.reduce((sum, i) => sum + Number(i.stock), 0) || 0;
            const vReserved = v.inventories?.reduce((sum, i) => sum + Number(i.reservedStock || 0), 0) || 0;
            const vAvailable = Math.max(0, vStock - vReserved);
            return v.manageStock ? vAvailable > 0 : (v.inventories?.[0]?.isAvailable ?? true);
          });
        }

        dto.variants = activeVariants.map((v) => {
          const vDto = new BranchProductResponseDto();
          vDto.id = v.id;
          vDto.name = v.name;
          vDto.sku = v.sku;
          vDto.imageUrl = v.imageUrl ?? null;
          vDto.price = Number(v.price);
          vDto.manageStock = v.manageStock;
          const vInv = v.inventories?.[0];
          vDto.stock = v.inventories?.reduce((sum, i) => sum + Number(i.stock), 0) || 0;
          vDto.reservedStock = v.inventories?.reduce((sum, i) => sum + Number(i.reservedStock || 0), 0) || 0;
          vDto.availableStock = Math.max(0, vDto.stock - vDto.reservedStock);
          vDto.isAvailable = v.manageStock ? vDto.availableStock > 0 : (vInv?.isAvailable ?? true);
          vDto.unitName = v.unit?.name || p.unit?.name || null;
          vDto.unitAbbreviation = v.unit?.abbreviation || p.unit?.abbreviation || null;
          vDto.allowsDecimals = v.unit?.allowsDecimals ?? p.unit?.allowsDecimals ?? false;
          return vDto;
        });
      }

      return dto;
    });

    if (hasStock === true) {
      return mapped.filter((p) => {
        if (p.variants && p.variants.length > 0) {
          return p.variants.length > 0;
        }
        return p.manageStock ? ((p.availableStock ?? p.stock) > 0) : (p.isAvailable === true);
      });
    }

    return mapped;
  }

  async getQuotationCatalog(branchId: string): Promise<BranchProductResponseDto[]> {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('product.parent', 'parent')
      .innerJoin('inventories', 'inventory', 'inventory.product_id = product.id AND inventory.branch_id = :branchId', { branchId })
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .andWhere('product.isMaster = :isMaster', { isMaster: false })
      .select([
        'product.id',
        'product.name',
        'product.sku',
        'product.imageUrl',
        'product.price',
        'product.manageStock',
        'inventory.isAvailable',
        'unit.name',
        'unit.abbreviation',
        'unit.allowsDecimals',
        'parent.name'
      ])
      .addSelect('inventory.stock', 'stock')
      .orderBy('product.name', 'ASC');

    const rawProducts = await query.getRawMany();

    return rawProducts.map((p) => {
      const dto = new BranchProductResponseDto();
      dto.id = p.product_id;
      
      // Format name to include parent name if it is a variant and does not already include it
      let displayName = p.product_name;
      if (p.parent_name && !p.product_name.toLowerCase().includes(p.parent_name.toLowerCase())) {
        displayName = `${p.parent_name} - ${p.product_name}`;
      }
      
      dto.name = displayName;
      dto.sku = p.product_sku;
      dto.imageUrl = p.product_imageUrl ?? null;
      dto.price = Number(p.product_price);
      const manageStock = p.product_manageStock === true || p.product_manageStock === 1;
      dto.manageStock = manageStock;
      dto.stock = Number(p.stock);
      const isAvail = p.inventory_is_available ?? p.inventory_isAvailable ?? true;
      dto.isAvailable = manageStock ? dto.stock > 0 : (isAvail === true || isAvail === 1 || isAvail === '1');
      dto.unitName = p.unit_name;
      dto.unitAbbreviation = p.unit_abbreviation;
      const allowsDec = p.unit_allowsDecimals ?? p.unit_allows_decimals;
      dto.allowsDecimals = allowsDec === 1 || allowsDec === true || allowsDec === '1';
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
