import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('InventoryIndexes');

export async function ensureInventoryIndexes(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS idx_inventories_branch_id
    ON inventories (branch_id)
  `);
  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS idx_inventories_product_id
    ON inventories (product_id)
  `);
  logger.log('Índices de inventories verificados');
}
