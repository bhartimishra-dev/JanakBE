import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ description: 'Category image URL' }) @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showOnWebsite?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showOnApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}
