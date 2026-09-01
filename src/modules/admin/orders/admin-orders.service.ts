import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, In, Not, Repository } from 'typeorm';
import { OrderStatus } from '../../../common/enums/order-status.enum';
import { OrderTracking } from '../../orders/entities/order-tracking.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';

const ONGOING_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PENDING_ADVANCE_PAYMENT,
  OrderStatus.ADVANCE_PAID,
  OrderStatus.PROCESSING,
  OrderStatus.ASSIGNED_FOR_SHIPPING,
  OrderStatus.PENDING_BALANCE_PAYMENT,
  OrderStatus.BALANCE_PAID,
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];

const COMPLETED_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export interface AdminOrderListItem {
  id: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerContact: string;
  bookingAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: { advancePaid: boolean; balancePaid: boolean };
  deliveryAddress: string;
  totalAmount: number;
  createdAt: Date;
  items?: AdminOrderLineItem[];
}

export interface AdminOrderLineItem {
  id: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PaginatedOrders {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderTracking)
    private trackingRepository: Repository<OrderTracking>,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  async findAll(
    tab: 'ongoing' | 'completed' = 'ongoing',
    page = 1,
    limit = 20,
    search?: string,
    from?: string,
    to?: string,
    status?: OrderStatus,
  ): Promise<PaginatedOrders> {
    const qb = this.ordersRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('o.items', 'i')
      .leftJoinAndSelect('i.product', 'p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('o.tracking', 't')
      .orderBy('o.createdAt', 'DESC');

    // Tab filter
    if (status) {
      qb.andWhere('o.status = :status', { status });
    } else if (tab === 'completed') {
      qb.andWhere('o.status IN (:...statuses)', { statuses: COMPLETED_STATUSES });
    } else {
      qb.andWhere('o.status IN (:...statuses)', { statuses: ONGOING_STATUSES });
    }

    // Search by orderId
    if (search) {
      qb.andWhere('LOWER(o.orderId) LIKE LOWER(:search)', { search: `%${search}%` });
    }

    // Date range
    if (from) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      qb.andWhere('o.createdAt >= :from', { from: start });
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('o.createdAt <= :to', { to: end });
    }

    const [orders, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      orders: orders.map((o) => this.toListItem(o)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toListItem(o: Order): AdminOrderListItem {
    const addr = o.shippingAddress ?? {};
    const deliveryAddress = [addr['addressLine1'], addr['city'], addr['state'], addr['pincode']]
      .filter(Boolean)
      .join(', ');

    return {
      id: o.id,
      orderId: o.orderId,
      customerName: (o.user as any)?.name ?? (o.user as any)?.email ?? 'Unknown',
      customerEmail: (o.user as any)?.email ?? '',
      customerContact: addr['phone'] ?? addr['mobile'] ?? '',
      bookingAmount: Number(o.advanceAmount),
      orderStatus: o.status,
      paymentStatus: { advancePaid: o.advancePaid, balancePaid: o.balancePaid },
      deliveryAddress,
      totalAmount: Number(o.totalAmount),
      createdAt: o.createdAt,
      items: (o.items ?? []).map((i) => ({
        id: i.id,
        productName: i.productName,
        productImage: (i.product as any)?.images?.[0]?.url ?? null,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    };
  }

  async findOne(id: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const where: any = isUuid ? { id } : { orderId: id };

    const order = await this.ordersRepository.findOne({
      where,
      relations: { user: true, items: { product: { images: true } }, tracking: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.findOne(id);
    order.status = status;
    await this.ordersRepository.save(order);

    if (order.tracking) {
      order.tracking.events.push({
        status,
        timestamp: new Date(),
        message: `Order status updated to ${status}`,
      });
      await this.trackingRepository.save(order.tracking);
    }
    return this.findOne(id);
  }

  async updateTracking(id: string, data: { courierName?: string; awbNumber?: string; trackingUrl?: string }) {
    const order = await this.findOne(id);
    if (!order.tracking) throw new NotFoundException('Tracking record not found');
    Object.assign(order.tracking, data);
    await this.trackingRepository.save(order.tracking);
    return this.findOne(id);
  }

  async confirmNeftAdvance(orderId: string, neftRef: string, adminUser: User) {
    const order = await this.findOne(orderId);
    order.advancePaid = true;
    order.neftReferenceNumber = neftRef;
    order.status = OrderStatus.ADVANCE_PAID;
    await this.ordersRepository.save(order);

    if (order.user) {
      await this.notificationsService.create(order.user, {
        title: 'Advance Payment Confirmed',
        message: `Your NEFT advance payment of ₹${Number(order.advanceAmount).toFixed(2)} for order ${order.orderId} has been confirmed. UTR: ${neftRef}`,
        type: NotificationType.PAYMENT_CONFIRMED,
        orderId: order.orderId,
        metadata: { amount: order.advanceAmount, neftReferenceNumber: neftRef },
      });
    }

    return this.findOne(orderId);
  }

  async confirmNeftBalance(orderId: string, neftRef: string, adminUser: User) {
    const order = await this.findOne(orderId);
    order.balancePaid = true;
    order.balanceNeftReferenceNumber = neftRef;
    order.status = OrderStatus.BALANCE_PAID;
    await this.ordersRepository.save(order);

    if (order.user) {
      await this.notificationsService.create(order.user, {
        title: 'Balance Payment Confirmed',
        message: `Your balance payment of ₹${Number(order.balanceAmount).toFixed(2)} for order ${order.orderId} has been confirmed. UTR: ${neftRef}. Your order will be shipped soon.`,
        type: NotificationType.PAYMENT_CONFIRMED,
        orderId: order.orderId,
        metadata: { amount: order.balanceAmount, balanceNeftReferenceNumber: neftRef },
      });
    }

    return this.findOne(orderId);
  }

  async assignForShipping(id: string, dto: { courierName?: string; awbNumber?: string; trackingUrl?: string }) {
    const order = await this.findOne(id);
    order.status = OrderStatus.ASSIGNED_FOR_SHIPPING;
    await this.ordersRepository.save(order);

    if (order.tracking) {
      if (dto.courierName) order.tracking.courierName = dto.courierName;
      if (dto.awbNumber) order.tracking.awbNumber = dto.awbNumber;
      if (dto.trackingUrl) order.tracking.trackingUrl = dto.trackingUrl;
      order.tracking.events.push({
        status: OrderStatus.ASSIGNED_FOR_SHIPPING,
        timestamp: new Date(),
        message: 'Order assigned for shipping. Please complete balance payment.',
      });
      await this.trackingRepository.save(order.tracking);
    }

    const neftDetails = {
      accountName: this.configService.get<string>('NEFT_ACCOUNT_NAME'),
      accountNumber: this.configService.get<string>('NEFT_ACCOUNT_NUMBER'),
      ifscCode: this.configService.get<string>('NEFT_IFSC_CODE'),
      bankName: this.configService.get<string>('NEFT_BANK_NAME'),
      qrCodeUrl: this.configService.get<string>('QR_CODE_URL'),
    };

    if (order.user) {
      await this.notificationsService.create(order.user, {
        title: 'Balance Payment Required',
        message: `Your order ${order.orderId} is ready for shipping. Please pay the remaining 90% (₹${Number(order.balanceAmount).toFixed(2)}) via NEFT or QR code. Account: ${neftDetails.accountNumber}, IFSC: ${neftDetails.ifscCode}`,
        type: NotificationType.PAYMENT_BALANCE,
        orderId: order.orderId,
        metadata: {
          balanceAmount: order.balanceAmount,
          neftDetails,
        },
      });
    }

    return this.findOne(id);
  }
}
