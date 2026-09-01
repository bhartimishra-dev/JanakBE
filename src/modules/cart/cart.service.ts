import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { calculateCouponDiscount } from '../../common/utils/coupon-discount.util';
import { calculateGst } from '../../common/utils/gst.util';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { AddCartItemDto, UpdateCartItemDto } from './dto/add-cart-item.dto';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';
import { SavedItem } from './entities/saved-item.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private cartItemRepository: Repository<CartItem>,
    @InjectRepository(SavedItem)
    private savedItemRepository: Repository<SavedItem>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    private dataSource: DataSource,
  ) {}

  private async getOrCreateCart(user: User): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { user: { id: user.id } },
      relations: { items: { product: { images: true } }, savedItems: { product: true } },
    });
    if (!cart) {
      cart = this.cartRepository.create({ user });
      await this.cartRepository.save(cart);
      cart.items = [];
      cart.savedItems = [];
    }
    return cart;
  }

  private async getOrCreateGuestCart(guestId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { guestId },
      relations: { items: { product: { images: true } }, savedItems: { product: true } },
    });
    if (!cart) {
      cart = this.cartRepository.create({ guestId, user: null });
      await this.cartRepository.save(cart);
      cart.items = [];
      cart.savedItems = [];
    }
    return cart;
  }

  async mergeGuestCart(guestId: string, user: User): Promise<void> {
    const guestCart = await this.cartRepository.findOne({
      where: { guestId },
      relations: { items: { product: true } },
    });
    if (!guestCart || guestCart.items.length === 0) return;

    await this.dataSource.transaction(async (manager) => {
      let userCart = await manager.findOne(Cart, {
        where: { user: { id: user.id } },
        relations: { items: { product: true } },
      });
      if (!userCart) {
        userCart = await manager.save(Cart, manager.create(Cart, { user }));
        userCart.items = [];
      }

      const userItemMap = new Map(userCart.items.map((i) => [i.product.id, i]));

      for (const guestItem of guestCart.items) {
        const existing = userItemMap.get(guestItem.product.id);
        if (existing) {
          existing.quantity += guestItem.quantity;
          await manager.save(CartItem, existing);
        } else {
          await manager.save(CartItem, manager.create(CartItem, {
            cart: userCart,
            product: guestItem.product,
            quantity: guestItem.quantity,
          }));
        }
      }
      await manager.remove(Cart, guestCart);
    });
  }

  async getGuestCart(guestId: string) {
    const cart = await this.getOrCreateGuestCart(guestId);
    return { ...cart, summary: this.buildSummary(cart) };
  }

  async addGuestItem(guestId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateGuestCart(guestId);
    const product = await this.productRepository.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const existing = cart.items.find((i) => i.product.id === dto.productId);
    if (existing) {
      existing.quantity += dto.quantity;
      await this.cartItemRepository.save(existing);
    } else {
      const item = this.cartItemRepository.create({ cart, product, quantity: dto.quantity });
      await this.cartItemRepository.save(item);
    }
    return this.getGuestCart(guestId);
  }

  async removeGuestItem(guestId: string, itemId: string) {
    const cart = await this.getOrCreateGuestCart(guestId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.cartItemRepository.remove(item);
    return this.getGuestCart(guestId);
  }

  private buildSummary(cart: Cart, coupon?: Coupon | null) {
    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );
    const { gstAmount } = calculateGst(subtotal);
    const discountAmount = calculateCouponDiscount(coupon, subtotal);
    const shippingAmount = subtotal >= 50000 ? 0 : 500;
    const totalAmount = subtotal + gstAmount - discountAmount + shippingAmount;
    const ADVANCE_CAP = 50000;
    const advanceAmount = Math.min(Math.round(totalAmount * 0.1 * 100) / 100, ADVANCE_CAP);
    const balanceAmount = Math.round((totalAmount - advanceAmount) * 100) / 100;
    return { subtotal, gstAmount, discountAmount, shippingAmount, totalAmount, advanceAmount, balanceAmount };
  }

  async getCart(user: User) {
    const cart = await this.getOrCreateCart(user);
    return { ...cart, summary: this.buildSummary(cart) };
  }

  async addItem(user: User, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(user);
    const product = await this.productRepository.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const existing = cart.items.find((i) => i.product.id === dto.productId);
    if (existing) {
      existing.quantity += dto.quantity;
      await this.cartItemRepository.save(existing);
    } else {
      const item = this.cartItemRepository.create({ cart, product, quantity: dto.quantity });
      await this.cartItemRepository.save(item);
    }
    return this.getCart(user);
  }

  async updateItem(user: User, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(user);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    item.quantity = dto.quantity;
    await this.cartItemRepository.save(item);
    return this.getCart(user);
  }

  async removeItem(user: User, itemId: string) {
    const cart = await this.getOrCreateCart(user);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.cartItemRepository.remove(item);
    return this.getCart(user);
  }

  async clearCart(user: User) {
    const cart = await this.getOrCreateCart(user);
    await this.cartItemRepository.remove(cart.items);
    return { message: 'Cart cleared' };
  }

  async applyCoupon(user: User, code: string) {
    const coupon = await this.couponRepository.findOne({
      where: { code: code.toUpperCase(), isActive: true },
      relations: { user: true },
    });
    if (!coupon) throw new BadRequestException('Invalid or expired coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }
    if (coupon.user && coupon.user.id !== user.id) {
      throw new BadRequestException('This coupon is not valid for your account');
    }
    const cart = await this.getOrCreateCart(user);
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    if (coupon.minimumOrderValue != null && subtotal < Number(coupon.minimumOrderValue)) {
      throw new BadRequestException(`Minimum order value of ₹${coupon.minimumOrderValue} required for this coupon`);
    }
    return {
      ...this.buildSummary(cart, coupon),
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountPercent: coupon.discountPercent,
        maxDiscountAmount: coupon.maxDiscountAmount,
        additionalDiscountType: coupon.additionalDiscountType,
      },
    };
  }

  async saveForLater(user: User, itemId: string) {
    const cart = await this.getOrCreateCart(user);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    const saved = this.savedItemRepository.create({ cart, product: item.product });
    await this.savedItemRepository.save(saved);
    await this.cartItemRepository.remove(item);
    return this.getCart(user);
  }
}
