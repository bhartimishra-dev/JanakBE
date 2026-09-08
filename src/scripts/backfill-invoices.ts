/**
 * One-off backfill: generates and stores an invoice PDF for every order that
 * doesn't have one yet (Order.invoiceUrl IS NULL) — orders placed before
 * invoice generation-at-checkout existed.
 *
 * Reuses AdminOrdersService.generateInvoicePdf(), which already does exactly
 * this "generate live + write to disk + set invoiceUrl" backfill as a
 * side effect when no stored file exists for an order — this script just
 * calls it for every order missing one, up front, instead of waiting for
 * someone to hit GET /admin/orders/:id/invoice (or the customer equivalent)
 * for each one individually.
 *
 * Usage: npm run backfill-invoices
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { AdminOrdersService } from '../modules/admin/orders/admin-orders.service';
import { Order } from '../modules/orders/entities/order.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const orderRepository = app.get<Repository<Order>>(getRepositoryToken(Order));
    const adminOrdersService = app.get(AdminOrdersService);

    const pending = await orderRepository.find({
      where: { invoiceUrl: IsNull() },
      select: { id: true, orderId: true },
      order: { createdAt: 'ASC' },
    });

    console.log(`Found ${pending.length} order(s) without a stored invoice.\n`);

    let succeeded = 0;
    let failed = 0;
    for (const order of pending) {
      try {
        await adminOrdersService.generateInvoicePdf(order.id);
        succeeded++;
        console.log(`✓ ${order.orderId}`);
      } catch (err) {
        failed++;
        console.error(`✗ ${order.orderId}:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`\nDone. ${succeeded} generated, ${failed} failed out of ${pending.length}.`);
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Backfill script crashed:', err);
  process.exit(1);
});
