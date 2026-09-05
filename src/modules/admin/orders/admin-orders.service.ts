import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { OrderStatus } from '../../../common/enums/order-status.enum';
import { CompanyProfile } from '../../company-profile/entities/company-profile.entity';
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
  tabCounts: { ongoing: number; completed: number };
}

@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderTracking)
    private trackingRepository: Repository<OrderTracking>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepository: Repository<CompanyProfile>,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  private async getTabCounts(): Promise<{ ongoing: number; completed: number }> {
    const [ongoing, completed] = await Promise.all([
      this.ordersRepository.count({ where: { status: In(ONGOING_STATUSES) } }),
      this.ordersRepository.count({ where: { status: In(COMPLETED_STATUSES) } }),
    ]);
    return { ongoing, completed };
  }

  /** Shared by findAll() and exportExcel() so list and export never drift apart. */
  private applyFilters(
    qb: SelectQueryBuilder<Order>,
    tab: 'ongoing' | 'completed' = 'ongoing',
    search?: string,
    from?: string,
    to?: string,
    status?: OrderStatus,
  ): SelectQueryBuilder<Order> {
    if (status) {
      qb.andWhere('o.status = :status', { status });
    } else if (tab === 'completed') {
      qb.andWhere('o.status IN (:...statuses)', { statuses: COMPLETED_STATUSES });
    } else {
      qb.andWhere('o.status IN (:...statuses)', { statuses: ONGOING_STATUSES });
    }

    if (search) {
      qb.andWhere('LOWER(o.orderId) LIKE LOWER(:search)', { search: `%${search}%` });
    }

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

    return qb;
  }

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

    this.applyFilters(qb, tab, search, from, to, status);

    const [orders, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const tabCounts = await this.getTabCounts();
    const profiles = await this.getCompanyProfilesFor(orders.map((o) => o.user?.id).filter(Boolean));

    return {
      orders: orders.map((o) => this.toListItem(o, profiles)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      tabCounts,
    };
  }

  private async getCompanyProfilesFor(userIds: string[]): Promise<Map<string, CompanyProfile>> {
    if (!userIds.length) return new Map();
    const profiles = await this.companyProfileRepository.find({
      where: { user: { id: In(userIds) } },
      relations: { user: true },
    });
    return new Map(profiles.map((p) => [p.user.id, p]));
  }

  private toListItem(o: Order, profiles: Map<string, CompanyProfile> = new Map()): AdminOrderListItem {
    const addr = o.shippingAddress ?? {};
    const deliveryAddress = [addr['addressLine1'], addr['city'], addr['state'], addr['pincode']]
      .filter(Boolean)
      .join(', ');
    const profile = o.user ? profiles.get(o.user.id) : undefined;

    return {
      id: o.id,
      orderId: o.orderId,
      customerName: profile?.companyName ?? o.user?.email ?? 'Unknown',
      customerEmail: o.user?.email ?? '',
      customerContact: profile?.phone ?? addr['phone'] ?? addr['mobile'] ?? '',
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

  /**
   * Excel export of orders — same filters as findAll() (tab/search/status/date
   * range), but unpaginated: every matching row goes into the sheet.
   */
  async exportExcel(
    tab: 'ongoing' | 'completed' = 'ongoing',
    search?: string,
    from?: string,
    to?: string,
    status?: OrderStatus,
  ): Promise<Buffer> {
    const qb = this.ordersRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'u')
      .leftJoinAndSelect('o.items', 'i')
      .orderBy('o.createdAt', 'DESC');
    this.applyFilters(qb, tab, search, from, to, status);

    const orders = await qb.getMany();
    const profiles = await this.getCompanyProfilesFor(orders.map((o) => o.user?.id).filter(Boolean));
    const rows = orders.map((o) => this.toListItem(o, profiles));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders');
    sheet.columns = [
      { header: 'Order ID', key: 'orderId', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 28 },
      { header: 'Customer Email', key: 'customerEmail', width: 28 },
      { header: 'Customer Contact', key: 'customerContact', width: 18 },
      { header: 'Status', key: 'orderStatus', width: 22 },
      { header: 'Advance Paid', key: 'advancePaid', width: 14 },
      { header: 'Balance Paid', key: 'balancePaid', width: 14 },
      { header: 'Booking Amount (₹)', key: 'bookingAmount', width: 18 },
      { header: 'Total Amount (₹)', key: 'totalAmount', width: 18 },
      { header: 'Delivery Address', key: 'deliveryAddress', width: 45 },
      { header: 'Created At', key: 'createdAt', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };

    rows.forEach((row) => {
      sheet.addRow({
        orderId: row.orderId,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        customerContact: row.customerContact,
        orderStatus: row.orderStatus,
        advancePaid: row.paymentStatus.advancePaid ? 'Yes' : 'No',
        balancePaid: row.paymentStatus.balancePaid ? 'Yes' : 'No',
        bookingAmount: row.bookingAmount,
        totalAmount: row.totalAmount,
        deliveryAddress: row.deliveryAddress,
        createdAt: row.createdAt.toISOString(),
      });
    });

    return workbook.xlsx.writeBuffer() as Promise<unknown> as Promise<Buffer>;
  }

  /** Renders a simple PDF invoice for one order. */
  async generateInvoicePdf(id: string): Promise<Buffer> {
    const order = await this.findOne(id);
    const profiles = await this.getCompanyProfilesFor(order.user?.id ? [order.user.id] : []);
    const profile = order.user ? profiles.get(order.user.id) : undefined;
    const addr = order.shippingAddress ?? ({} as Record<string, string>);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Invoice', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Order ID: ${order.orderId}`);
      doc.text(`Date: ${order.createdAt.toDateString()}`);
      doc.text(`Status: ${order.status}`);
      doc.moveDown();

      doc.text('Bill To:', { underline: true });
      doc.text(profile?.companyName ?? order.user?.email ?? 'Customer');
      if (addr['addressLine1']) doc.text(addr['addressLine1']);
      if (addr['addressLine2']) doc.text(addr['addressLine2']);
      const cityLine = [addr['city'], addr['state'], addr['pincode']].filter(Boolean).join(', ');
      if (cityLine) doc.text(cityLine);
      doc.text(`Phone: ${profile?.phone ?? addr['phone'] ?? ''}`);
      doc.moveDown();

      doc.text('Items:', { underline: true });
      order.items.forEach((item) => {
        doc.text(
          `${item.productName}  x${item.quantity}  @ Rs. ${Number(item.unitPrice).toFixed(2)}  =  Rs. ${Number(item.totalPrice).toFixed(2)}`,
        );
      });
      doc.moveDown();

      doc.text(`Subtotal: Rs. ${Number(order.subtotal).toFixed(2)}`);
      doc.text(`GST: Rs. ${Number(order.gstAmount).toFixed(2)}`);
      doc.text(`Shipping: Rs. ${Number(order.shippingAmount).toFixed(2)}`);
      doc.moveDown(0.5);
      doc.fontSize(13).text(`Total: Rs. ${Number(order.totalAmount).toFixed(2)}`, { underline: true });

      if (order.advanceAmount) {
        doc.moveDown();
        doc.fontSize(10);
        doc.text(`Advance paid: Rs. ${Number(order.advanceAmount).toFixed(2)} (${order.advancePaid ? 'received' : 'pending'})`);
        doc.text(`Balance due: Rs. ${Number(order.balanceAmount).toFixed(2)} (${order.balancePaid ? 'received' : 'pending'})`);
      }

      doc.end();
    });
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
