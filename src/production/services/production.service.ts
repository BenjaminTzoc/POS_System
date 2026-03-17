import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ProductRecipe, ProductionOrder, DecompositionOrder, DecompositionItem, ProductionStatus, DecompositionStatus } from '../entities';
import { ProductService, InventoryMovementService, InventoryService } from '../../logistics/services';
import { CreateDecompositionDto } from '../dto/decomposition.dto';
import { CreateProductionOrderDto, CompleteProductionOrderDto, ProductionOrderResponseDto, CancelProductionOrderDto } from '../dto/production.dto';
import { CreateRecipeDto, UpdateRecipeDto } from '../dto/recipe.dto';
import { MovementType, MovementConcept, MovementStatus } from '../../logistics/entities/inventory-movement.entity';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductRecipe)
    private readonly recipeRepository: Repository<ProductRecipe>,
    @InjectRepository(ProductionOrder)
    private readonly productionRepository: Repository<ProductionOrder>,
    @InjectRepository(DecompositionOrder)
    private readonly decompositionRepository: Repository<DecompositionOrder>,
    @InjectRepository(DecompositionItem)
    private readonly decompositionItemRepository: Repository<DecompositionItem>,
    private readonly productService: ProductService,
    private readonly movementService: InventoryMovementService,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async createDecomposition(dto: CreateDecompositionDto, userId?: string): Promise<DecompositionOrder> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const inputProduct = (await this.productService.findOne(dto.inputProductId)) as any;

      const decomposition = this.decompositionRepository.create({
        inputProduct: { id: inputProduct.id } as any,
        inputQuantity: dto.inputQuantity,
        totalCost: dto.totalCost,
        branch: { id: dto.branchId } as any,
        createdBy: userId ? ({ id: userId } as any) : null,
        status: DecompositionStatus.COMPLETED,
        completedAt: new Date(),
        wasteQuantity: dto.wasteQuantity || 0,
        notes: dto.notes,
      } as any) as unknown as DecompositionOrder;

      const savedDecomp = await queryRunner.manager.save(decomposition);

      // 1. Movimiento de SALIDA para el producto de entrada (Animal)
      await this.movementService.create(
        {
          productId: dto.inputProductId,
          branchId: dto.branchId,
          quantity: dto.inputQuantity,
          type: MovementType.OUT,
          concept: MovementConcept.DECOMPOSITION,
          referenceId: savedDecomp.id,
          status: MovementStatus.COMPLETED,
          notes: `Salida por despiece #${savedDecomp.id}`,
        },
        userId,
        true,
      );

      const items: DecompositionItem[] = [];
      for (const itemDto of dto.items) {
        const outputProduct = (await this.productService.findOne(itemDto.productId)) as any;
        const itemUnitCost = (dto.totalCost * (itemDto.costPercentage / 100)) / itemDto.quantity;

        const item = this.decompositionItemRepository.create({
          decompositionOrder: { id: savedDecomp.id } as any,
          product: { id: outputProduct.id } as any,
          quantity: itemDto.quantity,
          costPercentage: itemDto.costPercentage,
          unitCost: itemUnitCost,
          totalCost: dto.totalCost * (itemDto.costPercentage / 100),
        } as any) as unknown as DecompositionItem;

        const savedItem = await queryRunner.manager.save(item);
        items.push(savedItem);

        // 2. Movimiento de ENTRADA para cada corte obtenido
        await this.movementService.create(
          {
            productId: itemDto.productId,
            branchId: dto.branchId,
            quantity: itemDto.quantity,
            type: MovementType.IN,
            concept: MovementConcept.DECOMPOSITION,
            referenceId: savedDecomp.id,
            unitCost: itemUnitCost,
            notes: `Entrada por despiece #${savedDecomp.id}`,
            status: MovementStatus.COMPLETED,
          },
          userId,
          true,
        );
      }

      savedDecomp.items = items;
      await queryRunner.commitTransaction();
      return savedDecomp;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllDecompositions(): Promise<DecompositionOrder[]> {
    return this.decompositionRepository.find({
      relations: ['inputProduct', 'branch', 'items', 'items.product', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneDecomposition(id: string): Promise<DecompositionOrder> {
    const decomposition = await this.decompositionRepository.findOne({
      where: { id },
      relations: ['inputProduct', 'branch', 'items', 'items.product', 'createdBy'],
    });

    if (!decomposition) {
      throw new NotFoundException(`Despiece con ID ${id} no encontrado`);
    }

    return decomposition;
  }

  // Recipes Management
  async createRecipe(dto: CreateRecipeDto): Promise<ProductRecipe> {
    const recipe = this.recipeRepository.create({
      product: { id: dto.productId } as any,
      component: { id: dto.componentId } as any,
      quantity: dto.quantity,
      notes: dto.notes,
    });
    return this.recipeRepository.save(recipe);
  }

  async getRecipe(productId: string): Promise<ProductRecipe[]> {
    return this.recipeRepository.find({
      where: { product: { id: productId }, deletedAt: IsNull() },
      relations: ['component', 'component.unit'],
    });
  }

  async deleteRecipe(id: string): Promise<void> {
    const recipe = await this.recipeRepository.findOne({
      where: { id },
    });

    if (!recipe) {
      throw new NotFoundException(`Ingrediente de receta con ID ${id} no encontrado`);
    }

    await this.recipeRepository.delete(id);
  }

  async updateRecipe(id: string, dto: UpdateRecipeDto): Promise<ProductRecipe> {
    const recipe = await this.recipeRepository.findOne({
      where: { id },
    });

    if (!recipe) {
      throw new NotFoundException(`Ingrediente de receta con ID ${id} no encontrado`);
    }

    if (dto.quantity !== undefined) recipe.quantity = dto.quantity;
    if (dto.notes !== undefined) recipe.notes = dto.notes;

    return this.recipeRepository.save(recipe);
  }

  // Production Orders
  async createProductionOrder(dto: CreateProductionOrderDto, userId?: string): Promise<ProductionOrder> {
    const order = this.productionRepository.create({
      product: { id: dto.productId } as any,
      branch: { id: dto.branchId } as any,
      plannedQuantity: dto.plannedQuantity,
      createdBy: userId ? ({ id: userId } as any) : null,
      status: ProductionStatus.PENDING,
      notes: dto.notes,
    } as any) as unknown as ProductionOrder;
    return this.productionRepository.save(order);
  }

  async findAllProductionOrders(): Promise<ProductionOrder[]> {
    return this.productionRepository.find({
      relations: ['product', 'branch', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneProductionOrder(id: string): Promise<ProductionOrderResponseDto> {
    const order = await this.productionRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'branch', 'createdBy'],
    });

    if (!order) {
      throw new NotFoundException(`Producción con ID ${id} no encontrada`);
    }

    const response = plainToInstance(ProductionOrderResponseDto, order);

    // Si está pendiente, mostramos lo que SE NECESITA y el stock actual
    if (order.status === ProductionStatus.PENDING || order.status === ProductionStatus.IN_PROGRESS) {
      const recipe = await this.getRecipe(order.product.id);
      const recipeWithStock = await Promise.all(
        recipe.map(async (item) => {
          let currentStock = 0;
          try {
            const inv = await this.inventoryService.findByProductAndBranch(item.component.id, order.branch.id);
            currentStock = inv.stock;
          } catch (e) {
            // Sin registro de inventario
          }
          return {
            componentId: item.component.id,
            componentName: item.component.name,
            sku: item.component.sku,
            unit: item.component.unit?.abbreviation,
            requiredQuantity: item.quantity * order.plannedQuantity,
            unitQuantity: item.quantity,
            currentStock: currentStock,
            hasStock: currentStock >= item.quantity * order.plannedQuantity,
          };
        }),
      );
      response.recipe = recipeWithStock;
    } 
    // Si está completada, mostramos lo que REALMENTE se consumió
    else if (order.status === ProductionStatus.COMPLETED) {
      const movements = await this.movementService.findByReferenceId(order.id);
      // Filtramos solo las salidas (consumo de insumos)
      response.movements = movements
        .filter(m => m.type === MovementType.OUT && m.concept === MovementConcept.PRODUCTION)
        .map(m => ({
          productId: m.product.id,
          productName: m.product.name,
          sku: m.product.sku,
          quantity: m.quantity,
          unitCost: m.unitCost,
          totalCost: m.totalCost,
          unit: m.product.unit?.abbreviation
        }));
    }

    return response;
  }

  async completeProductionOrder(id: string, dto: CompleteProductionOrderDto, userId?: string): Promise<ProductionOrder> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await this.productionRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['product', 'branch'],
      });

      if (!order) {
        throw new NotFoundException(`Producción con ID ${id} no encontrada`);
      }

      if (order.status === ProductionStatus.COMPLETED) {
        throw new BadRequestException('Esta orden de producción ya ha sido completada');
      }

      const recipe = await this.getRecipe(order.product.id);
      if (recipe.length === 0) {
        throw new BadRequestException('El producto no tiene una receta definida');
      }

      // 1. Descuento de insumos (OUT) proporcional a la cantidad real producida
      let totalProductionCost = 0;
      for (const ingredient of recipe) {
        const requiredQty = ingredient.quantity * dto.actualQuantity;
        const ingredientCost = Number(ingredient.component.cost) * requiredQty;
        totalProductionCost += ingredientCost;

        await this.movementService.create(
          {
            productId: ingredient.component.id,
            branchId: order.branch.id,
            quantity: requiredQty,
            type: MovementType.OUT,
            concept: MovementConcept.PRODUCTION,
            referenceId: order.id,
            status: MovementStatus.COMPLETED,
            notes: `Consumo de insumo para producción #${order.id}`,
          },
          userId,
          true,
        );
      }

      // 2. Entrada de producto terminado (IN)
      await this.movementService.create(
        {
          productId: order.product.id,
          branchId: order.branch.id,
          quantity: dto.actualQuantity,
          type: MovementType.IN,
          concept: MovementConcept.PRODUCTION,
          referenceId: order.id,
          status: MovementStatus.COMPLETED,
          notes: `Entrada de producto terminado por producción #${order.id}`,
        },
        userId,
        true,
      );

      order.actualQuantity = dto.actualQuantity;
      order.totalCost = totalProductionCost;
      order.unitCost = dto.actualQuantity > 0 ? totalProductionCost / dto.actualQuantity : 0;
      order.status = ProductionStatus.COMPLETED;
      order.completedAt = new Date();
      order.notes = dto.notes || order.notes;

      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();
      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelProductionOrder(id: string, dto: CancelProductionOrderDto): Promise<ProductionOrder> {
    const order = await this.productionRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!order) {
      throw new NotFoundException(`Producción con ID ${id} no encontrada`);
    }

    if (order.status === ProductionStatus.COMPLETED) {
      throw new BadRequestException('No se puede cancelar una orden que ya ha sido completada');
    }

    if (order.status === ProductionStatus.CANCELLED) {
      throw new BadRequestException('Esta orden ya ha sido cancelada');
    }

    order.status = ProductionStatus.CANCELLED;
    if (dto.reason) {
      order.notes = order.notes ? `${order.notes} | Cancelación: ${dto.reason}` : `Cancelación: ${dto.reason}`;
    }

    return this.productionRepository.save(order);
  }
}
