import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { AdminCouponsService } from './admin-coupons.service';

@ApiTags('Admin - Coupons')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private adminCouponsService: AdminCouponsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all coupon codes',
    description: 'Returns all coupons ordered by creation date (newest first). Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all coupons',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid',
            code: 'SAVE10',
            discountType: 'percentage',
            discountValue: '10.00',
            minimumOrderValue: null,
            isPublic: true,
            isActive: true,
            expiresAt: null,
            createdAt: '2026-06-16T09:00:00.000Z',
            updatedAt: '2026-06-16T09:00:00.000Z',
          },
        ],
        message: 'Success',
        timestamp: '2026-06-16T09:00:00.000Z',
      },
    },
  })
  findAll() {
    return this.adminCouponsService.findAll();
  }

  @Get('suggest-code')
  @ApiOperation({
    summary: 'Suggest a coupon code for a quote-linked coupon',
    description:
      'Generates a Jnk-<CUSTOMER>-<digits> style code from the quote\'s customer. Not persisted — call again for a fresh suggestion (the "Regenerate" action).',
  })
  @ApiQuery({ name: 'quoteId', required: true })
  suggestCode(@Query('quoteId') quoteId: string) {
    return this.adminCouponsService.suggestCode(quoteId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new coupon code',
    description:
      'Creates a single-use coupon. Code is auto-uppercased. Once used at checkout the coupon is permanently deactivated.',
  })
  @ApiResponse({
    status: 201,
    description: 'Coupon created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          code: 'SAVE10',
          discountType: 'percentage',
          discountValue: 10,
          minimumOrderValue: null,
          isPublic: true,
          isActive: true,
          expiresAt: '2026-12-31T23:59:59.000Z',
          createdAt: '2026-06-16T09:00:00.000Z',
          updatedAt: '2026-06-16T09:00:00.000Z',
        },
        message: 'Success',
        timestamp: '2026-06-16T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Coupon code already exists' })
  create(@Body() dto: CreateCouponDto) {
    return this.adminCouponsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a coupon',
    description: 'Update discount type/value, expiry date, minimum order value, or active status of a coupon.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coupon updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          code: 'SAVE10',
          discountType: 'percentage',
          discountValue: 15,
          maxDiscountAmount: null,
          additionalDiscountType: null,
          minimumOrderValue: null,
          isPublic: true,
          isActive: true,
          expiresAt: null,
          createdAt: '2026-06-16T09:00:00.000Z',
          updatedAt: '2026-06-16T09:05:00.000Z',
        },
        message: 'Success',
        timestamp: '2026-06-16T09:05:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateCouponDto>) {
    return this.adminCouponsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a coupon',
    description: 'Permanently deletes a coupon by ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coupon deleted',
    schema: {
      example: {
        success: true,
        data: { message: 'Coupon deleted' },
        message: 'Success',
        timestamp: '2026-06-16T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  remove(@Param('id') id: string) {
    return this.adminCouponsService.remove(id);
  }
}
