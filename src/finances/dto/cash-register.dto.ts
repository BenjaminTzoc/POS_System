import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class OpenCashRegisterDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  openingBalance: number;

  @IsNotEmpty()
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCashRegisterDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  closingBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CashRegisterResponseDto {
  id: string;
  userId: string;
  userName: string;
  branchId: string;
  branchName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingBalance: number;
  expectedBalance: number;
  closingBalance: number | null;
  difference: number | null;
  status: string;
  notes: string | null;
}
