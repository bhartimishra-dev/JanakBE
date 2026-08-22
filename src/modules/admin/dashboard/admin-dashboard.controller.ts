import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Summary stats — sales, orders, quotations, users for a period' })
  @ApiQuery({ name: 'period', required: false, enum: ['today', '3d', '7d', '30d'], description: 'Preset period (default: 7d)' })
  @ApiQuery({ name: 'from', required: false, description: 'Custom start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'Custom end date (YYYY-MM-DD)' })
  getStats(
    @Query('period') period = '7d',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getStats(period, from, to);
  }

  @Get('sales-by-category')
  @ApiOperation({ summary: 'Category-wise sales for the bar chart' })
  @ApiQuery({ name: 'period', required: false, enum: ['today', '3d', '7d', '30d'] })
  @ApiQuery({ name: 'from', required: false, description: 'Custom start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'Custom end date (YYYY-MM-DD)' })
  getSalesByCategory(
    @Query('period') period = '7d',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getSalesByCategory(period, from, to);
  }

  @Get('recent-quotations')
  @ApiOperation({ summary: 'Most recent quotations for the sidebar list' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results (default: 10)' })
  getRecentQuotations(@Query('limit') limit = '10') {
    return this.dashboardService.getRecentQuotations(parseInt(limit, 10));
  }
}
