import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory, InventoryMovement, MovementStatus, MovementConcept } from '../../logistics/entities';

@Injectable()
export class InventoryReportsService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
  ) {}

  calculateDates(startParam?: Date, endParam?: Date, frequency: string = 'week', days: number = 7): { start: Date; end: Date } {
    let start: Date;
    let end: Date = endParam || new Date();

    if (startParam && endParam) {
      start = startParam;
      end = endParam;
    } else {
      const now = new Date();
      switch (frequency) {
        case 'day':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          end = new Date(now);
          end.setHours(23, 59, 59, 999);
          break;
        case 'week':
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          start = new Date(now);
          start.setDate(diff);
          start.setHours(0, 0, 0, 0);
          end = new Date();
          end.setHours(23, 59, 59, 999);
          break;
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          start.setHours(0, 0, 0, 0);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          start.setHours(0, 0, 0, 0);
          end = new Date(now.getFullYear(), 11, 31);
          end.setHours(23, 59, 59, 999);
          break;
        default:
          start = new Date();
          start.setDate(start.getDate() - (days - 1));
          start.setHours(0, 0, 0, 0);
      }
    }
    return { start, end };
  }

  async getCriticalStockReport(branchId?: string): Promise<any[]> {
    const query = this.inventoryRepository.createQueryBuilder('inventory').innerJoinAndSelect('inventory.product', 'product').innerJoinAndSelect('inventory.branch', 'branch').leftJoinAndSelect('product.category', 'category').leftJoinAndSelect('product.unit', 'unit').where('inventory.deletedAt IS NULL');

    if (branchId) query.andWhere('inventory.branch_id = :branchId', { branchId });

    const inventories = await query.orderBy('inventory.stock', 'ASC').getMany();

    return inventories.map((inv) => {
      let status = 'OK',
        color = 'green',
        indicator = '🟢';
      if (inv.stock <= 0) {
        status = 'Crítico';
        color = 'red';
        indicator = '🔴';
      } else if (inv.stock <= inv.minStock) {
        status = 'Bajo';
        color = 'yellow';
        indicator = '🟡';
      }

      return {
        productId: inv.product.id,
        productName: inv.product.name,
        sku: inv.product.sku,
        cost: inv.product.cost,
        category: inv.product.category?.name,
        unit: inv.product.unit?.abbreviation,
        branch: inv.branch.name,
        stock: inv.stock,
        minStock: inv.minStock,
        status,
        color,
        indicator,
      };
    });
  }

  async getWasteTrends(branchId?: string, days: number = 30, startDateParam?: Date, endDateParam?: Date): Promise<any[]> {
    const { start, end } = this.calculateDates(startDateParam, endDateParam, 'custom', days);

    const query = this.movementRepository.createQueryBuilder('movement').select("TO_CHAR(movement.movement_date, 'YYYY-MM-DD')", 'date').addSelect('SUM(movement.quantity)', 'quantity').where('movement.status = :status', { status: MovementStatus.COMPLETED }).andWhere('movement.concept = :concept', { concept: MovementConcept.WASTE }).andWhere('movement.movement_date BETWEEN :start AND :end', { start, end });

    if (branchId) query.andWhere('movement.branch_id = :branchId', { branchId });

    const results = await query.groupBy("TO_CHAR(movement.movement_date, 'YYYY-MM-DD')").orderBy('date', 'ASC').getRawMany();

    const finalResults: any[] = [];
    const resultsMap = new Map(results.map((r) => [r.date, Number(r.quantity)]));
    const current = new Date(start);
    while (current <= end) {
      const key = current.toISOString().split('T')[0];
      finalResults.push({ date: key, quantity: resultsMap.get(key) || 0 });
      current.setDate(current.getDate() + 1);
    }
    return finalResults;
  }

  async getWasteByProduct(branchId?: string, limit: number = 10, startDateParam?: Date, endDateParam?: Date): Promise<any[]> {
    const { start, end } = this.calculateDates(startDateParam, endDateParam, 'month');

    const query = this.movementRepository.createQueryBuilder('movement').innerJoin('movement.product', 'product').select('product.name', 'productName').addSelect('SUM(movement.quantity)', 'quantity').where('movement.status = :status', { status: MovementStatus.COMPLETED }).andWhere('movement.concept = :concept', { concept: MovementConcept.WASTE }).andWhere('movement.movement_date BETWEEN :start AND :end', { start, end });

    if (branchId) query.andWhere('movement.branch_id = :branchId', { branchId });

    const results = await query.groupBy('product.name').orderBy('quantity', 'DESC').limit(limit).getRawMany();

    return results.map((r) => ({
      productName: r.productName,
      quantity: Number(r.quantity),
    }));
  }
}
