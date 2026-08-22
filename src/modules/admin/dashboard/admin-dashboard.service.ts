import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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
        unattended: unattendedQuotes,
      },
      users: {
        total: totalUsers,
        newInPeriod: newUsers,
      },
    };
  }

  async getSalesByCategory(period: string, from?: string, to?: string): Promise<CategorySalesDto[]> {
    const { start, end } = this.getPeriodDates(period, from, to);

    const rows = await this.orderItemRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('oi.product', 'p')
      .innerJoin('p.category', 'c')
      .select('c.id', 'categoryId')
      .addSelect('c.name', 'categoryName')
      .addSelect('COALESCE(SUM(oi.totalPrice), 0)', 'totalSales')
      .addSelect('COUNT(DISTINCT o.id)', 'orderCount')
      .where('o.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('c.id')
      .addGroupBy('c.name')
      .orderBy('"totalSales"', 'DESC')
      .getRawMany<{ categoryId: string; categoryName: string; totalSales: string; orderCount: string }>();

    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      totalSales: parseFloat(r.totalSales),
      orderCount: parseInt(r.orderCount, 10),
    }));
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

    return quotes.map((q) => ({
      id: q.id,
      quoteId: q.quoteId,
      status: q.status,
      createdAt: q.createdAt,
      raisedBy: (q.user as any)?.email ?? 'Unknown',
      productRequested: q.items?.[0]?.product?.name ?? '—',
      quotedPrice: q.quotedPrice ? parseFloat(String(q.quotedPrice)) : null,
    }));
  }
}
