import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

// multipart/form-data always sends non-file fields as strings — these coerce
// them back to the right type whether the request was JSON or multipart.
const toBoolean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value === 'true' : value;
const toNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value !== '' ? Number(value) : value;

export class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;

  @ApiPropertyOptional({
    description: 'Category image URL. Ignored if an image file is uploaded in the same request.',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(toBoolean) @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBoolean) @IsBoolean() showOnWebsite?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBoolean) @IsBoolean() showOnApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toNumber) @IsNumber() sortOrder?: number;
}
