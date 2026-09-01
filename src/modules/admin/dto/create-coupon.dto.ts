import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { CouponDiscountType } from '../../../common/enums/coupon-discount-type.enum';

export class CreateCouponDto {
  @ApiPropertyOptional({
    example: 'SAVE10',
    description:
      'Coupon code (auto-uppercased). Must be unique. Required for public coupons; auto-generated from the linked quote when omitted for a quote-linked (isPublic: false) coupon.',
  })
  @ValidateIf((dto) => dto.isPublic !== false)
  @IsString()
  code?: string;

  @ApiProperty({ enum: CouponDiscountType, default: CouponDiscountType.PERCENTAGE })
  @IsEnum(CouponDiscountType)
  discountType: CouponDiscountType;

  @ApiPropertyOptional({
    description:
      'Discount amount — a percent (1-100) when discountType is percentage, or a ₹ amount when flat. Required unless discountType is free_item (in which case it\'s the amount for additionalDiscountType, if set).',
  })
  @ValidateIf((dto) => dto.discountType !== CouponDiscountType.FREE_ITEM)
  @IsNumber()
  @Min(0.01)
  discountValue?: number;

  @ApiPropertyOptional({
    description: 'Caps the computed discount for percentage-based coupons (including a free_item percentage add-on).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    enum: CouponDiscountType,
    description:
      'Optional flat/percentage discount stacked on top of a free_item coupon. Only flat or percentage are valid here; omit for no additional discount.',
  })
  @IsOptional()
  @IsEnum(CouponDiscountType)
  additionalDiscountType?: CouponDiscountType;

  @ApiPropertyOptional({ description: 'Product given free of charge. Required when discountType is free_item.' })
  @ValidateIf((dto) => dto.discountType === CouponDiscountType.FREE_ITEM)
  @IsUUID()
  freeProductId?: string;

  @ApiPropertyOptional({ description: 'Order subtotal must reach this amount for the coupon to apply' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderValue?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Public coupons are usable by any customer. Set false for a quote-linked coupon.',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Quote this coupon is generated from. Scopes usage to that quote\'s customer. Required when isPublic is false.',
  })
  @ValidateIf((dto) => dto.isPublic === false)
  @IsUUID()
  quoteId?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59Z',
    description: 'Optional expiry date in ISO 8601 format. Coupon rejects after this date.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
