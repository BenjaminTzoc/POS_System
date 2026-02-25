import { IsEnum, IsNotEmpty } from 'class-validator';
import { PreparationStatus } from '../entities/sale-detail.entity';

export class UpdateDetailStatusDto {
  @IsNotEmpty()
  @IsEnum(PreparationStatus)
  status: PreparationStatus;
}
