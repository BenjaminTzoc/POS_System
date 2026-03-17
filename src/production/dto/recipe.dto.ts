import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RecipeComponentDto {
  @IsUUID()
  componentId: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRecipeDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  componentId: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
export class UpdateRecipeDto {
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
