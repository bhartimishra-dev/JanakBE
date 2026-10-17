import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateSalesRepEnquiryDto } from './dto/create-sales-rep-enquiry.dto';
import { SalesRepEnquiriesService } from './sales-rep-enquiries.service';

@ApiTags('Sales Rep Enquiries')
@Controller('sales-rep-enquiries')
export class SalesRepEnquiriesController {
  constructor(private salesRepEnquiriesService: SalesRepEnquiriesService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a "Contact sales rep" click on a product',
    description:
      'Call this when a customer clicks the sales rep button on a product. Works without login; send the access token (cookie or Bearer) when available so the customer is captured — logged-in customers are recorded with email + company profile, guests by guest ID. Repeat clicks on the same product by the same customer within 30 minutes are not recorded twice. Limited to 20 requests per minute per IP.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Click recorded (or de-duplicated). Returns the sales rep contact to show/dial.',
    schema: {
      example: {
        success: true,
        data: { salesRepName: 'Amit Verma', salesRepPhone: '9876500000' },
        message: 'Success',
        timestamp: '2026-10-17T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'productId is not a valid UUID' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests — try again in a minute',
  })
  create(
    @Body() dto: CreateSalesRepEnquiryDto,
    @CurrentUser() caller: User | JwtPayload | null,
  ) {
    return this.salesRepEnquiriesService.create(dto.productId, caller ?? null);
  }
}
