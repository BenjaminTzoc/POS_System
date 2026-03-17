import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProductionOrderDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  branchId: string;

  @IsNumber()
  plannedQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteProductionOrderDto {
  @IsNumber()
  actualQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelProductionOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ProductionOrderResponseDto {
  @IsUUID()
  id: string;

  product: any;
  branch: any;
  createdBy?: any;
  plannedQuantity: number;
  actualQuantity?: number;
  status: string;
  totalCost?: number;
  unitCost?: number;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;

  // Enfoque: Datos adicionales para gestión
  @IsOptional()
  recipe?: any[]; // Para órdenes PENDING: Ingrediente | Cantidad Requerida | Stock Actual

  @IsOptional()
  movements?: any[]; // Para órdenes COMPLETED: Desglose de insumos consumidos
}
