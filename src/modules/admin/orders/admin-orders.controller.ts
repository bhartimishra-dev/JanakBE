import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { OrderStatus } from '../../../common/enums/order-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { User } from '../../users/entities/user.entity';
import { AdminOrdersService } from './admin-orders.service';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
}

export class UpdateTrackingDto {
  @IsOptional() @IsString() courierName?: string;
  @IsOptional() @IsString() awbNumber?: string;
  @IsOptional() @IsString() trackingUrl?: string;
}

export class AssignShippingDto {
  @IsOptional() @IsString() courierName?: string;
  @IsOptional() @IsString() awbNumber?: string;
  @IsOptional() @IsString() trackingUrl?: string;
}

export class ConfirmNeftDto {
  @IsString() neftReferenceNumber: string;
}

@ApiTags('Admin - Orders')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private adminOrdersService: AdminOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders — ongoing or completed, with search and date filters' })
  @ApiQuery({ name: 'tab', enum: ['ongoing', 'completed'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Search by order ID' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false, description: 'Filter by specific status' })
  findAll(
    @Query('tab') tab: 'ongoing' | 'completed' = 'ongoing',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: OrderStatus,
  ) {
    return this.adminOrdersService.findAll(tab, page, limit, search, from, to, status);
  }

  @Get('export/excel')
  @ApiOperation({
    summary: 'Download orders as an Excel file',
    description: 'Same filters as the list endpoint (tab/search/status/date range) — exports every matching row, not just the current page.',
  })
  @ApiQuery({ name: 'tab', enum: ['ongoing', 'completed'], required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by order ID' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false, description: 'Filter by specific status' })
  async exportExcel(
    @Res() res: Response,
    @Query('tab') tab: 'ongoing' | 'completed' = 'ongoing',
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: OrderStatus,
  ) {
    const buffer = await this.adminOrdersService.exportExcel(tab, search, from, to, status);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="orders-${stamp}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order detail by UUID or orderId (e.g. JP-2026-00001)' })
  findOne(@Param('id') id: string) {
    return this.adminOrdersService.findOne(id);
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Download a PDF invoice for one order' })
  async downloadInvoice(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.adminOrdersService.generateInvoicePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
    });
    res.send(buffer);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.adminOrdersService.updateStatus(id, dto.status);
  }

  @Patch(':id/tracking')
  @ApiOperation({ summary: 'Update courier and AWB tracking' })
  updateTracking(@Param('id') id: string, @Body() dto: UpdateTrackingDto) {
    return this.adminOrdersService.updateTracking(id, dto);
  }

  @Patch(':id/assign-shipping')
  @ApiOperation({ summary: 'Assign order for shipping and request balance payment' })
  assignForShipping(@Param('id') id: string, @Body() dto: AssignShippingDto) {
    return this.adminOrdersService.assignForShipping(id, dto);
  }

  @Patch(':id/confirm-advance-neft')
  @ApiOperation({ summary: 'Confirm NEFT advance payment received' })
  confirmAdvanceNeft(
    @Param('id') id: string,
    @Body() dto: ConfirmNeftDto,
    @CurrentUser() admin: User,
  ) {
    return this.adminOrdersService.confirmNeftAdvance(id, dto.neftReferenceNumber, admin);
  }

  @Patch(':id/confirm-balance-neft')
  @ApiOperation({ summary: 'Confirm NEFT balance payment received' })
  confirmBalanceNeft(
    @Param('id') id: string,
    @Body() dto: ConfirmNeftDto,
    @CurrentUser() admin: User,
  ) {
    return this.adminOrdersService.confirmNeftBalance(id, dto.neftReferenceNumber, admin);
  }
}
