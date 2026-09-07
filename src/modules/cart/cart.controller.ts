import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CartService } from './cart.service';
import { AddCartItemDto, ApplyCouponDto, UpdateCartItemDto } from './dto/add-cart-item.dto';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current cart with summary' })
  getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add product to cart' })
  addItem(@CurrentUser() user: User, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user, dto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update cart item quantity' })
  updateItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user, id, dto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeItem(@CurrentUser() user: User, @Param('id') id: string) {
    return this.cartService.removeItem(user, id);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear entire cart' })
  clearCart(@CurrentUser() user: User) {
    return this.cartService.clearCart(user);
  }

  @Post('coupon')
  @ApiOperation({ summary: 'Apply coupon code' })
  applyCoupon(@CurrentUser() user: User, @Body() dto: ApplyCouponDto) {
    return this.cartService.applyCoupon(user, dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove the coupon currently applied to the cart' })
  removeCoupon(@CurrentUser() user: User) {
    return this.cartService.removeCoupon(user);
  }

  @Post('save-for-later/:id')
  @ApiOperation({ summary: 'Save cart item for later' })
  saveForLater(@CurrentUser() user: User, @Param('id') id: string) {
    return this.cartService.saveForLater(user, id);
  }
}
