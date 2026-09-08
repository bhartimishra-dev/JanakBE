import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { User } from '../users/entities/user.entity';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders for current user' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  findAll(@CurrentUser() user: User, @Query('status') status?: OrderStatus) {
    return this.ordersService.findAll(user.id, status);
  }

  @Get('pending-balance')
  @ApiOperation({ summary: 'Get orders with advance paid but balance payment still pending' })
  findPendingBalancePayments(@CurrentUser() user: User) {
    return this.ordersService.findPendingBalancePayments(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order detail with tracking' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ordersService.findOne(id, user.id);
  }

  @Get(':id/invoice')
  @ApiOperation({
    summary: 'Download the GST tax invoice PDF for one of your own orders',
    description: '404s if the order doesn\'t belong to the current user — same ownership check as GET /orders/:id.',
  })
  async downloadInvoice(@Param('id') id: string, @CurrentUser() user: User, @Res() res: Response) {
    const buffer = await this.ordersService.getInvoicePdf(id, user.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
    });
    res.send(buffer);
  }
}
