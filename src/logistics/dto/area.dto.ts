import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class CreateAreaDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  previousAreaId?: string;
}

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  previousAreaId?: string;
}

export class AreaResponseDto {
  id: string;
  name: string;
  description: string;
  previousAreaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
