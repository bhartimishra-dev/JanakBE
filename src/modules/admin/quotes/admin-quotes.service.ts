import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';
import { CompanyProfile } from '../../company-profile/entities/company-profile.entity';
import { Quote } from '../../quotes/entities/quote.entity';

const IN_PROGRESS_STATUSES: QuoteStatus[] = [QuoteStatus.PENDING, QuoteStatus.QUOTE_SENT];
const CLOSED_STATUSES: QuoteStatus[] = [QuoteStatus.ACCEPTED, QuoteStatus.EXPIRED];

export interface AdminQuoteListItem {
  id: string;
  quoteId: string;
  customerName: string;
  customerEmail: string;
  customerContact: string;
  currentValue: number;
  quotationValue: number | null;
  status: QuoteStatus;
  raisedOn: Date;
  itemCount: number;
}

export interface PaginatedQuotes {
  quotes: AdminQuoteListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  tabCounts: { inProgress: number; closed: number };
}

@Injectable()
export class AdminQuotesService {
  constructor(
    @InjectRepository(Quote)
    private quotesRepository: Repository<Quote>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepository: Repository<CompanyProfile>,
  ) {}

  private async getTabCounts(): Promise<{ inProgress: number; closed: number }> {
    const [inProgress, closed] = await Promise.all([
      this.quotesRepository.count({ where: { status: In(IN_PROGRESS_STATUSES) } }),
      this.quotesRepository.count({ where: { status: In(CLOSED_STATUSES) } }),
    ]);
    return { inProgress, closed };
  }

  private async getCompanyProfilesFor(userIds: string[]): Promise<Map<string, CompanyProfile>> {
    if (!userIds.length) return new Map();
    const profiles = await this.companyProfileRepository.find({
      where: { user: { id: In(userIds) } },
      relations: { user: true },
    });
    return new Map(profiles.map((p) => [p.user.id, p]));
  }

  private toListItem(quote: Quote, profiles: Map<string, CompanyProfile>): AdminQuoteListItem {
    const profile = profiles.get(quote.user?.id);
    const items = quote.items ?? [];
    const currentValue = items.reduce(
      (sum, item) => sum + Number(item.product?.price ?? 0) * item.quantity,
      0,
    );

    return {
      id: quote.id,
      quoteId: quote.quoteId,
      customerName: profile?.companyName ?? quote.user?.email ?? 'Unknown',
      customerEmail: quote.user?.email ?? '',
      customerContact: profile?.phone ?? '',
      currentValue,
      quotationValue: quote.quotedPrice != null ? Number(quote.quotedPrice) : null,
      status: quote.status,
      raisedOn: quote.createdAt,
      itemCount: items.length,
    };
  }

  async findAll(
    tab: 'in-progress' | 'closed' = 'in-progress',
    page = 1,
    limit = 20,
    search?: string,
    from?: string,
    to?: string,
    status?: QuoteStatus,
  ): Promise<PaginatedQuotes> {
    const qb = this.quotesRepository
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.user', 'u')
      .leftJoinAndSelect('q.items', 'i')
      .leftJoinAndSelect('i.product', 'p')
      .orderBy('q.createdAt', 'DESC');

    if (status) {
      qb.andWhere('q.status = :status', { status });
    } else if (tab === 'closed') {
      qb.andWhere('q.status IN (:...statuses)', { statuses: CLOSED_STATUSES });
    } else {
      qb.andWhere('q.status IN (:...statuses)', { statuses: IN_PROGRESS_STATUSES });
    }

    if (search) {
      qb.andWhere('LOWER(q.quoteId) LIKE LOWER(:search)', { search: `%${search}%` });
    }

    if (from) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      qb.andWhere('q.createdAt >= :from', { from: start });
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('q.createdAt <= :to', { to: end });
    }

    const [quotes, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const profiles = await this.getCompanyProfilesFor(quotes.map((q) => q.user?.id).filter(Boolean));
    const tabCounts = await this.getTabCounts();

    return {
      quotes: quotes.map((q) => this.toListItem(q, profiles)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      tabCounts,
    };
  }

  async findOne(id: string) {
    const quote = await this.quotesRepository.findOne({
      where: { id },
      relations: { user: true, items: { product: { images: true, brand: true, category: true } } },
    });
    if (!quote) throw new NotFoundException('Quote not found');

    const profiles = await this.getCompanyProfilesFor(quote.user?.id ? [quote.user.id] : []);
    const profile = profiles.get(quote.user?.id);
    const currentValue = (quote.items ?? []).reduce(
      (sum, item) => sum + Number(item.product?.price ?? 0) * item.quantity,
      0,
    );
    const quotationValue = quote.quotedPrice != null ? Number(quote.quotedPrice) : null;

    return {
      ...quote,
      customerName: profile?.companyName ?? quote.user?.email ?? 'Unknown',
      customerContact: profile?.phone ?? '',
      customerEmail: quote.user?.email ?? '',
      currentValue,
      quotationValue,
      discountRequested: quotationValue != null ? currentValue - quotationValue : null,
    };
  }

  async updateStatus(id: string, status: QuoteStatus) {
    const quote = await this.getEntity(id);
    quote.status = status;
    await this.quotesRepository.save(quote);
    return this.findOne(id);
  }

  async update(id: string, data: { quotedPrice?: number; validUntil?: Date; notes?: string; status?: QuoteStatus }) {
    const quote = await this.getEntity(id);
    Object.assign(quote, data);
    await this.quotesRepository.save(quote);
    return this.findOne(id);
  }

  private async getEntity(id: string): Promise<Quote> {
    const quote = await this.quotesRepository.findOne({ where: { id } });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }
}
