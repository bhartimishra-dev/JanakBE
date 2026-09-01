import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { OrderStatus } from '../../../common/enums/order-status.enum';
import { ApiLog } from '../../api-logs/entities/api-log.entity';
import { Address } from '../../addresses/entities/address.entity';
import { Cart } from '../../cart/entities/cart.entity';
import { CompanyProfile } from '../../company-profile/entities/company-profile.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

export interface UsersFilter {
  search?: string;
  hasCartItems?: boolean;
  abandoned?: boolean;
  idleHours?: number;
  locationState?: string;
  joinedWithinDays?: number;
  activeWithinHours?: number;
  activityStatus?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
}

const DEFAULT_ACTIVE_WITHIN_HOURS = 24;

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ApiLog)
    private apiLogRepository: Repository<ApiLog>,
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepository: Repository<CompanyProfile>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
  ) {}

  async findAll(filter: UsersFilter) {
    const {
      search,
      hasCartItems,
      abandoned,
      idleHours = 24,
      locationState,
      joinedWithinDays,
      activeWithinHours = DEFAULT_ACTIVE_WITHIN_HOURS,
      activityStatus = 'all',
      page = 1,
      limit = 20,
    } = filter;

    const usersQuery = this.userRepository.createQueryBuilder('user');

    // "Search By Customer Name" matches the company name (CompanyProfile) or email —
    // User has no name column of its own.
    if (search) {
      const matchingProfiles = await this.companyProfileRepository.find({
        where: { companyName: ILike(`%${search}%`) },
        relations: { user: true },
      });
      const matchingUserIds = matchingProfiles.map((p) => p.user.id);
      if (matchingUserIds.length) {
        usersQuery.andWhere('(user.email ILIKE :search OR user.id IN (:...matchingUserIds))', {
          search: `%${search}%`,
          matchingUserIds,
        });
      } else {
        usersQuery.andWhere('user.email ILIKE :search', { search: `%${search}%` });
      }
    }

    if (locationState) {
      const matchingAddresses = await this.addressRepository.find({
        where: { state: ILike(`%${locationState}%`) },
        relations: { user: true },
      });
      const stateUserIds = [...new Set(matchingAddresses.map((a) => a.user.id))];
      if (stateUserIds.length) {
        usersQuery.andWhere('user.id IN (:...stateUserIds)', { stateUserIds });
      } else {
        usersQuery.andWhere('1 = 0');
      }
    }

    if (joinedWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - joinedWithinDays);
      usersQuery.andWhere('user.createdAt >= :joinedCutoff', { joinedCutoff: cutoff });
    }

    const [users, total] = await usersQuery
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const cartCutoff = new Date();
    cartCutoff.setHours(cartCutoff.getHours() - idleHours);

    const activeCutoff = new Date();
    activeCutoff.setHours(activeCutoff.getHours() - activeWithinHours);

    const enriched = await Promise.all(
      users.map(async (user) => {
        const [cart, lastLogin, lastActivityLog, orderCount, orders, profile, defaultAddress] = await Promise.all([
          this.cartRepository.findOne({
            where: { user: { id: user.id } },
            relations: { items: { product: true } },
          }),
          this.apiLogRepository.findOne({
            where: { userId: user.id, path: '/api/v1/auth/login', method: 'POST', statusCode: 200 },
            order: { createdAt: 'DESC' },
          }),
          this.apiLogRepository.findOne({
            where: { userId: user.id },
            order: { createdAt: 'DESC' },
          }),
          this.orderRepository.count({ where: { user: { id: user.id } } }),
          this.orderRepository.find({
            where: { user: { id: user.id }, status: Not(OrderStatus.CANCELLED) },
            select: { totalAmount: true },
          }),
          this.companyProfileRepository.findOne({ where: { user: { id: user.id } } }),
          this.addressRepository.findOne({ where: { user: { id: user.id }, isDefault: true } }),
        ]);

        const cartItemCount = cart?.items?.length ?? 0;
        const isAbandoned = cartItemCount > 0 && !!cart && cart.updatedAt < cartCutoff && orderCount === 0;

        const lastActivityAt = lastActivityLog?.createdAt ?? lastLogin?.createdAt ?? null;
        const isActive = !!lastActivityAt && lastActivityAt >= activeCutoff;
        const lifetimeValue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
        const location = defaultAddress
          ? [defaultAddress.city, defaultAddress.state, defaultAddress.pincode].filter(Boolean).join(', ')
          : '';

        return {
          id: user.id,
          customerName: profile?.companyName ?? user.email,
          customerContact: profile?.phone ?? '',
          email: user.email,
          location,
          role: user.role,
          isActive: user.isActive,
          status: isActive ? 'active' : 'inactive',
          lastActivityAt,
          joinedOn: user.createdAt,
          lastLoginAt: lastLogin?.createdAt ?? null,
          lastLoginIp: lastLogin?.ip ?? null,
          ordersQty: orderCount,
          lifetimeValue,
          cart: {
            itemCount: cartItemCount,
            lastUpdated: cart?.updatedAt ?? null,
            isAbandoned,
            idleSinceHours: cart
              ? Math.floor((Date.now() - new Date(cart.updatedAt).getTime()) / (1000 * 60 * 60))
              : null,
          },
        };
      }),
    );

    let items = enriched;

    if (hasCartItems) {
      items = items.filter((u) => u.cart.itemCount > 0);
    }
    if (abandoned) {
      items = items.filter((u) => u.cart.isAbandoned);
    }
    if (activityStatus !== 'all') {
      items = items.filter((u) => u.status === activityStatus);
    }

    const newInLastMonthCutoff = new Date();
    newInLastMonthCutoff.setDate(newInLastMonthCutoff.getDate() - 30);
    const [totalUsers, newInLastMonth] = await Promise.all([
      this.userRepository.count(),
      this.userRepository
        .createQueryBuilder('u')
        .where('u.createdAt >= :cutoff', { cutoff: newInLastMonthCutoff })
        .getCount(),
    ]);

    return {
      items,
      stats: { totalUsers, newInLastMonth },
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string) {
    const [user, cart, orders, loginHistory, recentActivity, profile, addresses] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.cartRepository.findOne({
        where: { user: { id: userId } },
        relations: { items: { product: { images: true } }, savedItems: { product: true } },
      }),
      this.orderRepository.find({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.apiLogRepository.find({
        where: { userId, path: '/api/v1/auth/login', method: 'POST', statusCode: 200 },
        order: { createdAt: 'DESC' },
        take: 10,
        select: { createdAt: true, ip: true, userAgent: true, durationMs: true },
      }),
      this.apiLogRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
        select: { id: true, method: true, path: true, statusCode: true, ip: true, durationMs: true, createdAt: true },
      }),
      this.companyProfileRepository.findOne({ where: { user: { id: userId } } }),
      this.addressRepository.find({ where: { user: { id: userId } } }),
    ]);

    const lifetimeValue = orders
      .filter((o) => o.status !== OrderStatus.CANCELLED)
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);

    return {
      user,
      profile,
      addresses,
      lifetimeValue,
      cart,
      orders,
      loginHistory,
      recentActivity,
    };
  }
}
