import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { QuoteStatus } from '../../../common/enums/quote-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UpdateQuoteDto, UpdateQuoteStatusDto } from '../dto/update-quote.dto';
import { AdminQuotesService } from './admin-quotes.service';

@ApiTags('Admin - Quotations')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/quotes')
export class AdminQuotesController {
  constructor(private adminQuotesService: AdminQuotesService) {}

  @Get()
  @ApiOperation({ summary: 'List quotations — in-progress or closed, with search and date filters' })
  @ApiQuery({ name: 'tab', enum: ['in-progress', 'closed'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by quotation ID' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', enum: QuoteStatus, required: false, description: 'Filter by specific status' })
  findAll(
    @Query('tab') tab: 'in-progress' | 'closed' = 'in-progress',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: QuoteStatus,
  ) {
    return this.adminQuotesService.findAll(tab, page, limit, search, from, to, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quotation detail' })
  findOne(@Param('id') id: string) {
    return this.adminQuotesService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update quotation status (e.g. from the list dropdown)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuoteStatusDto) {
    return this.adminQuotesService.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update quotation detail — quoted price, validity, notes, status' })
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto) {
    return this.adminQuotesService.update(id, {
      ...dto,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
    });
  }
}
