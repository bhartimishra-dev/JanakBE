import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
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
      relations: { items: { product: { images: true } }, tracking: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
