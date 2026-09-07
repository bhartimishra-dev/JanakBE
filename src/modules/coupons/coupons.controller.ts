import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private couponsService: CouponsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List coupons available to the current user',
    description:
      'All active, non-expired public coupons, plus any private coupon scoped to this account (e.g. a quote-linked one). Does not include anyone else\'s private coupons.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available coupons',
    schema: {
      example: {
        success: true,
        data: [
          {
            code: 'SAVE10',
            discountType: 'percentage',
            discountValue: '10.00',
            discountPercent: '10.00',
            maxDiscountAmount: null,
            additionalDiscountType: null,
            minimumOrderValue: null,
            isPublic: true,
            expiresAt: null,
            freeProduct: null,
          },
        ],
        message: 'Success',
        timestamp: '2026-06-16T09:00:00.000Z',
      },
    },
  })
  findAvailable(@CurrentUser() user: User) {
    return this.couponsService.findAvailable(user);
  }

  @Post('validate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Validate a coupon code',
    description:
      'Checks if a coupon is active, not expired, and usable by the current user (quote-linked/private coupons are rejected for anyone else). Case-insensitive.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coupon is valid',
    schema: {
      example: {
        success: true,
        data: {
          code: 'SAVE10',
          discountType: 'percentage',
          discountValue: '10.00',
          discountPercent: '10.00',
          maxDiscountAmount: null,
          additionalDiscountType: null,
          minimumOrderValue: null,
          isPublic: true,
          freeProduct: null,
        },
        message: 'Success',
        timestamp: '2026-06-16T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or inactive coupon / Coupon has expired / Not valid for this account',
  })
  validate(@Body() dto: ValidateCouponDto, @CurrentUser() user: User) {
    return this.couponsService.validate(dto.code, user);
  }
}
