import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory, Branch } from '../../logistics/entities';
import { SaleDetail, SaleStatus } from '../../sales/entities';
import {
  RunwayRiskLevel,
  StockRunwayItemDto,
  StockRunwayKpisDto,
  StockRunwayQueryDto,
  StockRunwayResponseDto,
} from '../dto/stock-runway.dto';

const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;
const round1 = (num: number): number => Math.round((num + Number.EPSILON) * 10) / 10;

@Injectable()
export class StockRunwayService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async getStockRunway(query: StockRunwayQueryDto): Promise<StockRunwayResponseDto> {
    const velocityDays = query.velocityDays || 14;
    const limit = query.limit || 10;
    const branchId = query.branchId;

    if (branchId) {
      const branchExists = await this.branchRepository.findOne({ where: { id: branchId } });
      if (!branchExists) {
        throw new BadRequestException('Sucursal no encontrada');
      }
    }

    // 1. Obtener inventarios activos
    const invQb = this.inventoryRepository
      .createQueryBuilder('inv')
      .innerJoinAndSelect('inv.product', 'product')
      .innerJoinAndSelect('inv.branch', 'branch')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.unit', 'unit')
      .where('inv.deletedAt IS NULL')
      .andWhere('product.isActive = true')
      .andWhere('product.manageStock = true')
      .andWhere('inv.isAvailable = true');

    if (branchId) {
      invQb.andWhere('inv.branch_id = :branchId', { branchId });
    }

    const inventories = await invQb.getMany();

    // 2. Calcular velocidad de consumo reciente
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - velocityDays);

    const velocityQb = this.saleDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.sale', 'sale')
      .select('detail.product_id', 'productId')
      .addSelect('COALESCE(SUM(detail.quantity), 0)', 'totalSold')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('sale.date >= :startDate', { startDate });

    if (branchId) {
      velocityQb.andWhere('sale.branch_id = :branchId', { branchId });
    }

    velocityQb.groupBy('detail.product_id');

    const salesVelocityRows = await velocityQb.getRawMany();
    const velocityMap = new Map<string, number>();

    salesVelocityRows.forEach((row) => {
      const totalSold = Number(row.totalSold) || 0;
      const daily = totalSold / velocityDays;
      velocityMap.set(row.productId, daily);
    });

    // 3. Evaluar riesgo y días restantes por inventario
    let criticalCount = 0;
    let warningCount = 0;
    let belowMinCount = 0;
    let totalReservedUnits = 0;

    const evaluatedItems: StockRunwayItemDto[] = inventories.map((inv) => {
      const totalStock = round2(Number(inv.stock) || 0);
      const reserved = round2(Number(inv.reservedStock) || 0);
      const available = Math.max(0, round2(totalStock - reserved));
      const minStock = round2(Number(inv.minStock) || 0);

      totalReservedUnits += reserved;

      const dailyVelocity = round2(velocityMap.get(inv.product.id) || 0);

      let daysRemaining: number | null = null;
      let riskLevel: RunwayRiskLevel = 'healthy';
      let riskMessage = 'Stock saludable';

      if (available <= 0) {
        daysRemaining = 0;
        riskLevel = 'critical';
        riskMessage = 'Agotado';
        criticalCount++;
      } else if (dailyVelocity > 0) {
        const days = round1(available / dailyVelocity);
        daysRemaining = days;

        if (days <= 2) {
          riskLevel = 'critical';
          riskMessage = `Quiebre en ${days} días`;
          criticalCount++;
        } else if (days <= 5) {
          riskLevel = 'warning';
          riskMessage = `Alerta: ${days} días de stock`;
          warningCount++;
        } else if (available <= minStock) {
          riskLevel = 'reorder';
          riskMessage = 'Bajo punto de reorden';
          belowMinCount++;
        }
      } else {
        // No registra ventas recientes en la ventana
        if (available <= minStock && minStock > 0) {
          riskLevel = 'reorder';
          riskMessage = 'Bajo stock mínimo';
          belowMinCount++;
        }
      }

      return {
        productId: inv.product.id,
        productName: inv.product.name,
        sku: inv.product.sku || undefined,
        categoryName: inv.product.category?.name || 'Sin categoría',
        unit: inv.product.unit?.abbreviation || 'u',
        branchName: inv.branch?.name,
        totalStock,
        reservedStock: reserved,
        availableStock: available,
        minStock,
        dailyVelocity,
        daysRemaining,
        riskLevel,
        riskMessage,
      };
    });

    // 4. Ordenar por criticidad (críticos primero, luego advertencias, luego por días restantes ascendente)
    const priorityWeight: Record<RunwayRiskLevel, number> = {
      critical: 1,
      warning: 2,
      reorder: 3,
      healthy: 4,
    };

    evaluatedItems.sort((a, b) => {
      const weightDiff = priorityWeight[a.riskLevel] - priorityWeight[b.riskLevel];
      if (weightDiff !== 0) return weightDiff;
      if (a.daysRemaining !== null && b.daysRemaining !== null) {
        return a.daysRemaining - b.daysRemaining;
      }
      if (a.daysRemaining !== null) return -1;
      if (b.daysRemaining !== null) return 1;
      return a.availableStock - b.availableStock;
    });

    const kpis: StockRunwayKpisDto = {
      criticalCount,
      warningCount,
      belowMinCount,
      totalReservedUnits: round2(totalReservedUnits),
    };

    return {
      kpis,
      items: evaluatedItems.slice(0, limit),
    };
  }
}
