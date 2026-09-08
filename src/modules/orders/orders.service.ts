import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { renderInvoicePdfBuffer } from '../../common/utils/invoice-pdf.util';
import {
  getInvoiceRelativePath,
  invoiceFileExists,
  readInvoiceFile,
  saveInvoiceFile,
} from '../../common/utils/invoice-storage.util';
import { CompanyProfile } from '../company-profile/entities/company-profile.entity';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepository: Repository<CompanyProfile>,
    private configService: ConfigService,
  ) {}

  findAll(userId: string, status?: OrderStatus) {
    const where: any = { user: { id: userId } };
    if (status) where.status = status;
    return this.ordersRepository.find({
      where,
      relations: { items: { product: { images: true } }, tracking: true },
      order: { createdAt: 'DESC' },
    });
  }

  findPendingBalancePayments(userId: string) {
    return this.ordersRepository.find({
      where: { user: { id: userId }, advancePaid: true, balancePaid: false },
      relations: { items: { product: { images: true } }, tracking: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const where: any = isUuid
      ? { id, user: { id: userId } }
      : { orderId: id, user: { id: userId } };

    const order = await this.ordersRepository.findOne({
      where,
      relations: { user: true, items: { product: { images: true } }, tracking: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Returns the invoice PDF for one of the current user's own orders —
   * `findOne` above already 404s if the order doesn't belong to them, so
   * there's no separate ownership check needed here.
   *
   * Same stored-first behavior as the admin download endpoint: serves the
   * permanent copy generated at order placement, or generates + backfills
   * one live for orders placed before that existed.
   */
  async getInvoicePdf(id: string, userId: string): Promise<Buffer> {
    const order = await this.findOne(id, userId);

    if (await invoiceFileExists(order.id)) {
      return readInvoiceFile(order.id);
    }

    const profile = await this.companyProfileRepository.findOne({ where: { user: { id: userId } } });
    const buffer = await renderInvoicePdfBuffer(order, profile);

    try {
      await saveInvoiceFile(order.id, buffer);
      const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3001');
      await this.ordersRepository.update(order.id, { invoiceUrl: `${baseUrl}${getInvoiceRelativePath(order.id)}` });
    } catch (err) {
      console.error(`Failed to backfill stored invoice for order ${order.orderId}:`, err);
    }

    return buffer;
  }
}
