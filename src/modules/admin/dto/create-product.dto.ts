import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MediaType } from '../../../common/enums/media-type.enum';
import { StockStatus } from '../../../common/enums/stock-status.enum';

export class ProductSpecDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() value: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

export class ProductImageDto {
  @ApiProperty() @IsString() url: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: MediaType, default: MediaType.IMAGE }) @IsOptional() @IsEnum(MediaType) type?: MediaType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

export class ProductDocumentDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() url: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileType?: string;
}

export class CreateProductDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ description: 'Short product headline, max 150 characters' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  headline?: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional({ description: 'Free-text key specification block, max 500 characters' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  keySpecification?: string;
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty() @IsUUID() brandId: string;
  @ApiPropertyOptional({ description: 'MRP / original price shown struck through' })
  @IsOptional()
  @IsNumber()
  originalPrice?: number;
  @ApiProperty({ description: 'Listing / selling price' }) @IsNumber() price: number;
  @ApiProperty({ enum: StockStatus }) @IsEnum(StockStatus) stockStatus: StockStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() modelNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() salesRepName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() salesRepPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isNewArrival?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showOnWebsite?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showOnApp?: boolean;

  @ApiPropertyOptional({ type: [ProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @ApiPropertyOptional({ type: [ProductSpecDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  specs?: ProductSpecDto[];

  @ApiPropertyOptional({ type: [ProductDocumentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDocumentDto)
  documents?: ProductDocumentDto[];
}

export class AddProductImagesDto {
  @ApiProperty({ type: [ProductImageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images: ProductImageDto[];
}

export class ReorderProductImagesDto {
  @ApiProperty({ type: [String], description: 'Image ids in the desired display order' })
  @IsArray()
  @IsUUID('4', { each: true })
  imageIds: string[];
}

export class AddProductDocumentsDto {
  @ApiProperty({ type: [ProductDocumentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDocumentDto)
  documents: ProductDocumentDto[];
}
