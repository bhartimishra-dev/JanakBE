import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { CompanyProfile } from '../../company-profile/entities/company-profile.entity';
import { Order } from '../../orders/entities/order.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { QuoteItem } from '../../quotes/entities/quote-item.entity';
import { User } from '../../users/entities/user.entity';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';

export interface DashboardStatsDto {
  period: { from: string; to: string };
  totalSales: { current: number; previous: number; changePercent: number | null };
  totalOrders: { current: number; previous: number; changePercent: number | null };
  quotationsRaised: { current: number; unattended: number };
  users: { total: number; newInPeriod: number };
}

export interface CategorySalesDto {
  categoryId: string;
  categoryName: string;
  totalSales: number;
  orderCount: number;
  quantitySold: number;
}

export interface RecentQuotationDto {
  id: string;
  quoteId: string;
  status: string;
  createdAt: Date;
  raisedBy: string;
  productRequested: string;
  quotedPrice: number | null;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Quote) private readonly quoteRepo: Repository<Quote>,
    @InjectRepository(QuoteItem) private readonly quoteItemRepo: Repository<QuoteItem>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(CompanyProfile) private readonly companyProfileRepo: Repository<CompanyProfile>,
  ) {}

  private getPeriodDates(period: string, from?: string, to?: string): { start: Date; end: Date } {
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);

    if (from) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }

    const start = new Date(end);
    start.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        break;
      case '3d':
        start.setDate(start.getDate() - 2);
        break;
      case '7d':
        start.setDate(start.getDate() - 6);
        break;
      case '30d':
        start.setDate(start.getDate() - 29);
        break;
      default:
        start.setDate(start.getDate() - 6);
    }

    return { start, end };
  }

  private getPreviousPeriod(start: Date, end: Date): { start: Date; end: Date } {
    const diffMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diffMs);
    return { start: prevStart, end: prevEnd };
  }

  private pctChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  }

  async getStats(period: string, from?: string, to?: string): Promise<DashboardStatsDto> {
    const { start, end } = this.getPeriodDates(period, from, to);
    const { start: prevStart, end: prevEnd } = this.getPreviousPeriod(start, end);

    const [currentSales, previousSales, currentOrders, previousOrders, currentQuotes, unattendedQuotes, totalUsers, newUsers] =
      await Promise.all([
        this.orderRepo
          .createQueryBuilder('o')
          .select('COALESCE(SUM(o.totalAmount), 0)', 'total')
          .where('o.createdAt BETWEEN :start AND :end', { start, end })
          .getRawOne<{ total: string }>(),
        this.orderRepo
          .createQueryBuilder('o')
          .select('COALESCE(SUM(o.totalAmount), 0)', 'total')
          .where('o.createdAt BETWEEN :start AND :end', { start: prevStart, end: prevEnd })
          .getRawOne<{ total: string }>(),
        this.orderRepo.count({ where: { createdAt: Between(start, end) } }),
        this.orderRepo.count({ where: { createdAt: Between(prevStart, prevEnd) } }),
        this.quoteRepo.count({ where: { createdAt: Between(start, end) } }),
        this.quoteRepo.count({ where: { status: QuoteStatus.PENDING } }),
        this.userRepo.count(),
        this.userRepo.count({ where: { createdAt: Between(start, end) } }),
      ]);

    const curSales = parseFloat(currentSales?.total ?? '0');
    const prevSales = parseFloat(previousSales?.total ?? '0');

    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      totalSales: {
        current: curSales,
        previous: prevSales,
        changePercent: this.pctChange(curSales, prevSales),
      },
      totalOrders: {
        current: currentOrders,
        previous: previousOrders,
        changePercent: this.pctChange(currentOrders, previousOrders),
      },
      quotationsRaised: {
        current: currentQuotes,
        // Deliberately NOT scoped to the selected period — this is meant to read as
        // "how much is in the backlog right now", not "how much became unattended
        // within this window".
        unattended: unattendedQuotes,
      },
      users: {
        total: totalUsers,
        newInPeriod: newUsers,
      },
    };
  }

  /**
   * One row per active category, always — including ones with zero sales in the
   * selected period (previously innerJoin'd through orders, so a category with
   * no orders in the window vanished from the array instead of showing as 0).
   */
  async getSalesByCategory(period: string, from?: string, to?: string): Promise<CategorySalesDto[]> {
    const { start, end } = this.getPeriodDates(period, from, to);

    const [categories, salesRows] = await Promise.all([
      this.categoryRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } }),
      this.orderItemRepo
        .createQueryBuilder('oi')
        .innerJoin('oi.order', 'o')
        .innerJoin('oi.product', 'p')
        .innerJoin('p.category', 'c')
        .select('c.id', 'categoryId')
        .addSelect('COALESCE(SUM(oi.totalPrice), 0)', 'totalSales')
        .addSelect('COUNT(DISTINCT o.id)', 'orderCount')
        .addSelect('COALESCE(SUM(oi.quantity), 0)', 'quantitySold')
        .where('o.createdAt BETWEEN :start AND :end', { start, end })
        .groupBy('c.id')
        .getRawMany<{ categoryId: string; totalSales: string; orderCount: string; quantitySold: string }>(),
    ]);

    const salesByCategory = new Map(salesRows.map((r) => [r.categoryId, r]));

    return categories.map((c) => {
      const row = salesByCategory.get(c.id);
      return {
        categoryId: c.id,
        categoryName: c.name,
        totalSales: row ? parseFloat(row.totalSales) : 0,
        orderCount: row ? parseInt(row.orderCount, 10) : 0,
        quantitySold: row ? parseInt(row.quantitySold, 10) : 0,
      };
    });
  }

  async getRecentQuotations(limit = 10): Promise<RecentQuotationDto[]> {
    const quotes = await this.quoteRepo
      .createQueryBuilder('q')
      .innerJoinAndSelect('q.user', 'u')
      .leftJoinAndSelect('q.items', 'qi')
      .leftJoinAndSelect('qi.product', 'p')
      .orderBy('q.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    const userIds = [...new Set(quotes.map((q) => q.user?.id).filter(Boolean))];
    const profiles = userIds.length
      ? await this.companyProfileRepo.find({ where: { user: { id: In(userIds) } }, relations: { user: true } })
      : [];
    const profileByUserId = new Map(profiles.map((p) => [p.user.id, p]));

    return quotes.map((q) => {
      const profile = q.user ? profileByUserId.get(q.user.id) : undefined;
      return {
        id: q.id,
        quoteId: q.quoteId,
        status: q.status,
        createdAt: q.createdAt,
        raisedBy: profile?.companyName ?? q.user?.email ?? 'Unknown',
        productRequested: q.items?.[0]?.product?.name ?? '—',
        quotedPrice: q.quotedPrice ? parseFloat(String(q.quotedPrice)) : null,
      };
    });
  }
}
