import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { calculateCouponDiscount } from '../../common/utils/coupon-discount.util';
import { calculateGst } from '../../common/utils/gst.util';
import { generateOrderId } from '../../common/utils/order-id.util';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { Address } from '../addresses/entities/address.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderTracking } from '../orders/entities/order-tracking.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Cart } from '../cart/entities/cart.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { PlaceOrderDto } from './dto/place-order.dto';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  async initiate(user: User) {
    const cart = await this.cartRepository.findOne({
      where: { user: { id: user.id } },
      relations: { items: { product: true }, coupon: true },
    });
    if (!cart || !cart.items.length) throw new BadRequestException('Cart is empty');

    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );
    const { gstAmount } = calculateGst(subtotal);
    // Same coupon persisted on the cart via POST /cart/coupon applies here too,
    // so this preview matches what GET /cart and the eventual order will show.
    const coupon = this.activeCartCoupon(cart);
    const discountAmount = calculateCouponDiscount(coupon, subtotal);
    const shippingAmount = subtotal >= 50000 ? 0 : 500;
    const totalAmount = subtotal + gstAmount - discountAmount + shippingAmount;

    return {
      items: cart.items,
      summary: { subtotal, gstAmount, discountAmount, couponCode: coupon?.code ?? null, shippingAmount, totalAmount },
    };
  }

  /** The cart's persisted coupon, or null if none applied / it's since expired or been deactivated. */
  private activeCartCoupon(cart: Cart): Coupon | null {
    const coupon = cart.coupon;
    if (!coupon) return null;
    if (!coupon.isActive) return null;
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return null;
    return coupon;
  }

  async placeOrder(user: User, dto: PlaceOrderDto) {
    const cart = await this.cartRepository.findOne({
      where: { user: { id: user.id } },
      relations: { items: { product: true }, coupon: true },
    });
    if (!cart || !cart.items.length) throw new BadRequestException('Cart is empty');

    const address = await this.addressRepository.findOne({
      where: { id: dto.addressId, user: { id: user.id } },
    });
    if (!address) throw new NotFoundException('Address not found');

    // An explicit couponCode in the request wins; otherwise fall back to
    // whatever coupon is already applied/persisted on the cart (from
    // POST /cart/coupon) so checkout honors it without the frontend having
    // to resend the code it already applied.
    const couponCode = dto.couponCode ?? this.activeCartCoupon(cart)?.code;
    let coupon: Coupon | null = null;
    if (couponCode) {
      coupon = await this.couponRepository.findOne({
        where: { code: couponCode.toUpperCase(), isActive: true },
        relations: { user: true },
      });
      if (!coupon) throw new BadRequestException('Invalid or expired coupon');
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new BadRequestException('Coupon has expired');
      }
      if (coupon.user && coupon.user.id !== user.id) {
        throw new BadRequestException('This coupon is not valid for your account');
      }
    }

    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );
    if (coupon?.minimumOrderValue != null && subtotal < Number(coupon.minimumOrderValue)) {
      throw new BadRequestException(`Minimum order value of ₹${coupon.minimumOrderValue} required for this coupon`);
    }
    const { gstAmount } = calculateGst(subtotal);
    const discountAmount = calculateCouponDiscount(coupon, subtotal);
    const shippingAmount = subtotal >= 50000 ? 0 : 500;
    const totalAmount = subtotal + gstAmount - discountAmount + shippingAmount;

    const ADVANCE_CAP = 50000;
    const tenPercent = Math.round(totalAmount * 0.1 * 100) / 100;
    const advanceAmount = Math.min(tenPercent, ADVANCE_CAP);
    const balanceAmount = Math.round((totalAmount - advanceAmount) * 100) / 100;
    const isFullPayment = balanceAmount === 0;

    const estimatedStart = new Date();
    estimatedStart.setDate(estimatedStart.getDate() + 5);
    const estimatedEnd = new Date();
    estimatedEnd.setDate(estimatedEnd.getDate() + 8);

    const result = await this.dataSource.transaction(async (manager) => {
      const count = await manager.count(Order);
      const orderId = generateOrderId(count + 1);

      const order = manager.create(Order, {
        orderId,
        user,
        subtotal,
        gstAmount,
        shippingAmount,
        discountAmount,
        couponCode: coupon?.code,
        totalAmount,
        advanceAmount,
        balanceAmount,
        transactionId: dto.transactionId,
        paymentMethod: dto.paymentMethod,
        requiresGstBill: dto.requiresGstBill ?? false,
        status: OrderStatus.PENDING_ADVANCE_PAYMENT,
        estimatedDeliveryStart: estimatedStart,
        estimatedDeliveryEnd: estimatedEnd,
        shippingAddress: {
          fullName: address.fullName,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? '',
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          phone: address.phone,
        },
      });
      await manager.save(order);

      const orderItems = cart.items.map((item) =>
        manager.create(OrderItem, {
          order,
          product: item.product,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price,
          totalPrice: Number(item.product.price) * item.quantity,
        }),
      );
      await manager.save(orderItems);

      const tracking = manager.create(OrderTracking, {
        order,
        events: [{ status: 'Order Placed', timestamp: new Date(), message: 'Your order has been placed successfully' }],
      });
      await manager.save(tracking);

      await manager.delete('cart_items', { cart: { id: cart.id } });
      await manager.update(Cart, { id: cart.id }, { coupon: null });

      if (coupon) {
        await manager.update(Coupon, { id: coupon.id }, { isActive: false });
      }

      return order;
    });

    const neftDetails = !isFullPayment
      ? {
          accountName: this.configService.get<string>('NEFT_ACCOUNT_NAME'),
          accountNumber: this.configService.get<string>('NEFT_ACCOUNT_NUMBER'),
          ifscCode: this.configService.get<string>('NEFT_IFSC_CODE'),
          bankName: this.configService.get<string>('NEFT_BANK_NAME'),
          qrCodeUrl: this.configService.get<string>('QR_CODE_URL'),
        }
      : undefined;

    const notificationMessage = isFullPayment
      ? `Your order ${result.orderId} has been placed. Please complete the full payment of ₹${advanceAmount.toFixed(2)} via UPI/gateway to confirm your order.`
      : `Your order ${result.orderId} has been placed. Please pay ₹${advanceAmount.toFixed(2)} advance via UPI/gateway. Remaining ₹${balanceAmount.toFixed(2)} will be collected via NEFT before shipping.`;

    await this.notificationsService.create(user, {
      title: 'Order Placed — Payment Required',
      message: notificationMessage,
      type: NotificationType.PAYMENT_ADVANCE,
      orderId: result.orderId,
      metadata: {
        advanceAmount,
        balanceAmount,
        totalAmount,
        isFullPayment,
        ...(neftDetails ? { neftDetails } : {}),
      },
    });

    return {
      orderId: result.orderId,
      id: result.id,
      totalAmount: result.totalAmount,
      advanceAmount,
      balanceAmount,
      isFullPayment,
      ...(neftDetails ? { neftDetails } : {}),
      estimatedDeliveryStart: estimatedStart,
      estimatedDeliveryEnd: estimatedEnd,
      message: isFullPayment
        ? 'Order placed. Please complete full payment via UPI/gateway.'
        : `Order placed. Pay ₹${advanceAmount.toFixed(2)} now via UPI. Remaining ₹${balanceAmount.toFixed(2)} via NEFT before shipping.`,
    };
  }
}
