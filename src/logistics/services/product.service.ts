import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { CategoryService } from './category.service';
import { UnitService } from './unit.service';
import { CreateProductDto, ProductResponseDto, UpdateProductDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly categoryService: CategoryService,
    private readonly unitService: UnitService,
  ) {}

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    // Verificar si el SKU ya existe
    const existingSku = await this.productRepository.findOne({
      where: { sku: dto.sku },
      withDeleted: false,
    });

    if (existingSku) {
      throw new ConflictException(`El SKU '${dto.sku}' ya está en uso`);
    }

    // Verificar si el código de barras ya existe (si se proporciona)
    if (dto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode },
        withDeleted: false,
      });

      if (existingBarcode) {
        throw new ConflictException(`El código de barras '${dto.barcode}' ya está en uso`);
      }
    }

    let category: any = null;
    let unit: any = null;

    // Validar y obtener la categoría si se proporciona
    if (dto.categoryId) {
      try {
        category = await this.categoryService.findOne(dto.categoryId);
      } catch (error) {
        throw new BadRequestException(`La categoría con ID ${dto.categoryId} no existe`);
      }
    }

    // Validar y obtener la unidad si se proporciona
    if (dto.unitId) {
      try {
        unit = await this.unitService.findOne(dto.unitId);
      } catch (error) {
        throw new BadRequestException(`La unidad con ID ${dto.unitId} no existe`);
      }
    }

    // Validar que el precio sea mayor o igual al costo
    if (dto.price < dto.cost) {
      throw new BadRequestException('El precio debe ser mayor o igual al costo');
    }

    const product = this.productRepository.create({
      name: dto.name,
      description: dto.description,
      sku: dto.sku,
      barcode: dto.barcode,
      cost: dto.cost,
      price: dto.price,
      category: category,
      unit: unit,
    });

    const savedProduct = await this.productRepository.save(product);
    return plainToInstance(ProductResponseDto, savedProduct);
  }

  async findAll(): Promise<ProductResponseDto[]> {
    const products = await this.productRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
      order: { name: 'ASC' },
    });
    return plainToInstance(ProductResponseDto, products);
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    return plainToInstance(ProductResponseDto, product);
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

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category', 'unit', 'category.defaultUnit'],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo SKU ya existe
    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.productRepository.findOne({
        where: { sku: dto.sku, deletedAt: IsNull() },
      });

      if (existingSku) {
        throw new ConflictException(`El SKU '${dto.sku}' ya está en uso`);
      }
    }

    // Verificar si el nuevo código de barras ya existe
    if (dto.barcode && dto.barcode !== product.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode, deletedAt: IsNull() },
      });

      if (existingBarcode) {
        throw new ConflictException(`El código de barras '${dto.barcode}' ya está en uso`);
      }
    }

    // Validar que el precio sea mayor o igual al costo
    if (dto.price !== undefined && dto.cost !== undefined && dto.price < dto.cost) {
      throw new BadRequestException('El precio debe ser mayor o igual al costo');
    } else if (dto.price !== undefined && dto.price < product.cost) {
      throw new BadRequestException('El precio debe ser mayor o igual al costo');
    } else if (dto.cost !== undefined && product.price < dto.cost) {
      throw new BadRequestException('El precio debe ser mayor o igual al costo');
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
          throw new BadRequestException(`La categoría con ID ${dto.categoryId} no existe`);
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
      category: category,
      unit: unit,
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

  async searchProducts(query: string): Promise<ProductResponseDto[]> {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('category.defaultUnit', 'defaultUnit')
      .where('product.deletedAt IS NULL')
      .andWhere(
        '(product.name ILIKE :query OR product.sku ILIKE :query OR product.barcode ILIKE :query OR product.description ILIKE :query)',
        { query: `%${query}%` },
      )
      .orderBy('product.name', 'ASC')
      .getMany();

    return plainToInstance(ProductResponseDto, products);
  }
}
